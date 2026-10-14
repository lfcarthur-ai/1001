"""Enriquecimento automático dos álbuns via APIs públicas e gratuitas.

- MusicBrainz: identificação do álbum, data de lançamento, país do artista e links
- Cover Art Archive: capa (fallback: iTunes Search API)
- Wikidata / Wikipedia: link do artigo (prefere pt.wikipedia, senão en.wikipedia)
- RateYourMusic: não possui API; o link é montado a partir do padrão de URLs do site
"""

import logging
import re
import threading
import time
import unicodedata
from urllib.parse import quote, quote_plus

import requests
from flask import current_app
from rapidfuzz import fuzz

from .models import Album, Draw, db, utcnow
from .utils import country_name, normalize

log = logging.getLogger(__name__)

MB_BASE = "https://musicbrainz.org/ws/2"
CAA_BASE = "https://coverartarchive.org"
TIMEOUT = 15
MAX_ATTEMPTS = 3

_mb_lock = threading.Lock()
_mb_last = [0.0]


def _session():
    s = requests.Session()
    ua = current_app.config.get("HTTP_USER_AGENT", "1001AlbunsClube/1.0")
    s.headers.update({"User-Agent": ua, "Accept": "application/json"})
    return s


def _mb_get(sess, path, params):
    """GET no MusicBrainz respeitando o limite de 1 requisição/segundo."""
    with _mb_lock:
        wait = 1.1 - (time.monotonic() - _mb_last[0])
        if wait > 0:
            time.sleep(wait)
        try:
            r = sess.get(f"{MB_BASE}/{path}", params={**params, "fmt": "json"}, timeout=TIMEOUT)
        finally:
            _mb_last[0] = time.monotonic()
    r.raise_for_status()
    return r.json()


def _lucene_escape(s):
    return re.sub(r'([+\-!(){}\[\]^"~*?:\\/]|&&|\|\|)', r"\\\1", s)


def rym_slug(text):
    s = unicodedata.normalize("NFKD", text or "")
    s = "".join(c for c in s if not unicodedata.combining(c)).lower()
    s = s.replace("&", " and ").replace("'", "").replace("’", "")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def rym_url(album):
    return f"https://rateyourmusic.com/release/album/{rym_slug(album.artist)}/{rym_slug(album.title)}/"


def _score_release_group(album, rg):
    title_score = fuzz.token_sort_ratio(normalize(album.title), normalize(rg.get("title", "")))
    credit = " ".join(
        (c.get("name") or c.get("artist", {}).get("name", "")) for c in rg.get("artist-credit", [])
    )
    artist_score = fuzz.token_set_ratio(normalize(album.artist), normalize(credit))
    score = 0.55 * title_score + 0.45 * artist_score
    date = rg.get("first-release-date") or ""
    if album.year and date[:4].isdigit():
        diff = abs(int(date[:4]) - album.year)
        score -= min(diff, 5) * 2
    if rg.get("primary-type") == "Album":
        score += 3
    return score


def find_release_group(sess, album):
    query = f'releasegroup:"{_lucene_escape(album.title)}" AND artist:"{_lucene_escape(album.artist)}"'
    data = _mb_get(sess, "release-group/", {"query": query, "limit": 10})
    groups = data.get("release-groups", [])
    if not groups:
        data = _mb_get(sess, "release-group/", {"query": f"{album.title} {album.artist}", "limit": 10})
        groups = data.get("release-groups", [])
    best, best_score = None, 0
    for rg in groups:
        sc = _score_release_group(album, rg)
        if sc > best_score:
            best, best_score = rg, sc
    return best if best_score >= 70 else None


def _artist_country(sess, artist_id):
    data = _mb_get(sess, f"artist/{artist_id}", {})
    if data.get("country"):
        return country_name(data["country"])
    area = data.get("area") or {}
    codes = area.get("iso-3166-1-codes") or []
    if codes:
        return country_name(codes[0])
    return area.get("name")


def _wikipedia_from_wikidata(sess, qid):
    r = sess.get(f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json", timeout=TIMEOUT)
    r.raise_for_status()
    entity = r.json().get("entities", {}).get(qid, {})
    sitelinks = entity.get("sitelinks", {})
    for site, host in (("ptwiki", "pt.wikipedia.org"), ("enwiki", "en.wikipedia.org")):
        if site in sitelinks:
            title = sitelinks[site]["title"].replace(" ", "_")
            return f"https://{host}/wiki/{quote(title)}"
    return None


def _wikipedia_search(sess, album):
    params = {
        "action": "query",
        "list": "search",
        "srsearch": f'intitle:"{album.title}" {album.artist} album',
        "format": "json",
        "srlimit": 5,
    }
    r = sess.get("https://en.wikipedia.org/w/api.php", params=params, timeout=TIMEOUT)
    r.raise_for_status()
    target = normalize(album.title)
    for hit in r.json().get("query", {}).get("search", []):
        title = hit.get("title", "")
        base = normalize(re.sub(r"\(.*?\)", "", title))
        if base == target or fuzz.ratio(base, target) >= 90:
            return f"https://en.wikipedia.org/wiki/{quote(title.replace(' ', '_'))}"
    return None


def _caa_cover(sess, mbid):
    url = f"{CAA_BASE}/release-group/{mbid}/front-500"
    r = sess.head(url, allow_redirects=False, timeout=TIMEOUT)
    if r.status_code in (200, 301, 302, 307, 308):
        return url
    return None


def _itunes_cover(sess, album):
    params = {"term": f"{album.artist} {album.title}", "entity": "album", "limit": 10}
    r = sess.get("https://itunes.apple.com/search", params=params, timeout=TIMEOUT)
    r.raise_for_status()
    best, best_score = None, 0
    for item in r.json().get("results", []):
        sc = 0.5 * fuzz.token_sort_ratio(normalize(album.title), normalize(item.get("collectionName", ""))) + \
            0.5 * fuzz.token_set_ratio(normalize(album.artist), normalize(item.get("artistName", "")))
        if sc > best_score:
            best, best_score = item, sc
    if best and best_score >= 75 and best.get("artworkUrl100"):
        return best["artworkUrl100"].replace("100x100bb", "600x600bb")
    return None


def _safe(fn, *args):
    try:
        return fn(*args)
    except Exception as exc:  # noqa: BLE001
        log.warning("Enriquecimento: %s falhou: %s", getattr(fn, "__name__", fn), exc)
        return None


def enrich_album(album, sess=None):
    """Preenche capa, links, país e data de lançamento. Não sobrescreve valores existentes."""
    sess = sess or _session()
    album.enrich_attempts = (album.enrich_attempts or 0) + 1
    if not album.rym_url:
        album.rym_url = rym_url(album)

    rg = _safe(find_release_group, sess, album)
    if rg:
        album.musicbrainz_id = rg["id"]
        if not album.release_date and rg.get("first-release-date"):
            album.release_date = rg["first-release-date"]
        credits = rg.get("artist-credit") or []
        if not album.country and credits and credits[0].get("artist", {}).get("id"):
            album.country = _safe(_artist_country, sess, credits[0]["artist"]["id"])
        if not album.wikipedia_url:
            details = _safe(_mb_get, sess, f"release-group/{rg['id']}", {"inc": "url-rels"}) or {}
            for rel in details.get("relations", []):
                target = (rel.get("url") or {}).get("resource", "")
                if rel.get("type") == "wikidata" and "/wiki/Q" in target:
                    album.wikipedia_url = _safe(_wikipedia_from_wikidata, sess, target.rsplit("/", 1)[-1])
                elif rel.get("type") == "wikipedia" and not album.wikipedia_url:
                    album.wikipedia_url = target
                if album.wikipedia_url:
                    break
        if not album.cover_url:
            album.cover_url = _safe(_caa_cover, sess, rg["id"])

    if not album.cover_url:
        album.cover_url = _safe(_itunes_cover, sess, album)
    if not album.wikipedia_url:
        album.wikipedia_url = _safe(_wikipedia_search, sess, album)

    complete = all([album.cover_url, album.wikipedia_url, album.country])
    if complete or album.enrich_attempts >= MAX_ATTEMPTS:
        album.enriched_at = utcnow()
    db.session.commit()
    return album


def pending_query():
    """Álbuns a enriquecer, priorizando os já sorteados."""
    drawn = db.session.query(Draw.album_id)
    q = Album.query.filter(Album.enriched_at.is_(None), Album.enrich_attempts < MAX_ATTEMPTS)
    return q.order_by(Album.id.in_(drawn).desc(), Album.enrich_attempts.asc(), Album.id.asc())


def enrich_pending(limit=10):
    sess = _session()
    done = 0
    for album in pending_query().limit(limit).all():
        try:
            enrich_album(album, sess)
            done += 1
        except Exception:  # noqa: BLE001
            log.exception("Falha ao enriquecer %s", album.id)
            db.session.rollback()
    return done


def enrich_in_background(app, album_id):
    """Enriquece um álbum em outra thread, sem atrasar a requisição/sorteio."""

    def run():
        with app.app_context():
            try:
                album = db.session.get(Album, album_id)
                if album and album.enriched_at is None:
                    enrich_album(album)
            except Exception:  # noqa: BLE001
                log.exception("Falha ao enriquecer álbum %s", album_id)
                db.session.rollback()

    threading.Thread(target=run, daemon=True, name=f"enrich-{album_id}").start()


def wikipedia_search_url(album):
    return "https://pt.wikipedia.org/w/index.php?search=" + quote_plus(f"{album.title} {album.artist}")
