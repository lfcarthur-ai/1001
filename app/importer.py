"""Importação de histórico legado (CSV do 1001 Albums Generator ou similar).

Campos esperados: Artist, Album, Released, Rating, Notes, Global Rating (ignorado),
Origin (ignorado), Generated Date (data de sorteio).

Casamento com o catálogo em três camadas:
1. normalização + match exato de Artista/Álbum/Ano;
2. fuzzy matching sugerindo de 3 a 5 candidatos;
3. revisão manual das linhas não encontradas ou ambíguas antes da confirmação.
"""

import json
from collections import defaultdict

from rapidfuzz import fuzz

from .catalog import read_csv_text, sniff_reader
from .models import Album, Draw, ImportJob, Rating, db
from .utils import normalize, parse_date, parse_rating, parse_year

LEGACY_FIELDS = {
    "artist": {"artist", "artista"},
    "album": {"album", "title", "titulo", "nome album", "nome do album"},
    "released": {"released", "release date", "year", "ano", "ano lancamento", "ano de lancamento"},
    "rating": {"rating", "nota", "my rating"},
    "notes": {"notes", "notas", "comentario", "comment", "review"},
    "generated": {"generated date", "generated", "data sorteio", "data de sorteio", "date"},
}

MIN_CANDIDATES = 3
MAX_CANDIDATES = 5
MIN_FUZZY_SCORE = 45


class ImportFormatError(ValueError):
    pass


def parse_legacy_csv(raw: bytes):
    rows = list(sniff_reader(read_csv_text(raw)))
    if not rows:
        raise ImportFormatError("O arquivo está vazio.")
    header = []
    for h in rows[0]:
        n = normalize(h)
        header.append(next((f for f, al in LEGACY_FIELDS.items() if n in al), None))
    if "artist" not in header or "album" not in header:
        raise ImportFormatError(
            "Cabeçalho não reconhecido. Esperado: Artist, Album, Released, Rating, Notes, "
            "Global Rating, Origin, Generated Date."
        )
    out = []
    for line_no, row in enumerate(rows[1:], start=2):
        rec = {}
        for i, f in enumerate(header):
            if f and i < len(row) and f not in rec:
                rec[f] = row[i].strip()
        if not rec.get("artist") and not rec.get("album"):
            continue
        generated = parse_date(rec.get("generated"))
        out.append(
            {
                "line": line_no,
                "artist": rec.get("artist", ""),
                "album": rec.get("album", ""),
                "year": parse_year(rec.get("released")),
                "half_stars": parse_rating(rec.get("rating")),
                "notes": rec.get("notes") or None,
                "generated": generated.isoformat() if generated else None,
            }
        )
    return out


class CatalogIndex:
    def __init__(self, albums, drawn_ids):
        self.albums = albums
        self.drawn = drawn_ids
        self.exact = defaultdict(list)
        self.norm = []
        for a in albums:
            na, nt = normalize(a.artist), normalize(a.title)
            self.exact[(na, nt, a.year)].append(a)
            self.norm.append((a, na, nt))

    def exact_match(self, artist, title, year):
        hits = self.exact.get((normalize(artist), normalize(title), year), [])
        return hits[0] if len(hits) == 1 else None

    def fuzzy(self, artist, title, year, limit=MAX_CANDIDATES):
        na, nt = normalize(artist), normalize(title)
        scored = []
        for a, aa, at in self.norm:
            ts = max(fuzz.token_sort_ratio(nt, at), fuzz.ratio(nt, at))
            as_ = fuzz.token_set_ratio(na, aa)
            score = 0.6 * ts + 0.4 * as_
            if year and a.year:
                score -= min(abs(a.year - year), 5) * 2
            scored.append((score, a))
        scored.sort(key=lambda x: x[0], reverse=True)
        good = [s for s in scored if s[0] >= MIN_FUZZY_SCORE][:limit]
        if len(good) < MIN_CANDIDATES:
            good = scored[:MIN_CANDIDATES]
        return [
            {"id": a.id, "label": a.label, "score": round(sc), "drawn": a.id in self.drawn}
            for sc, a in good
        ]


def build_index():
    drawn = {r[0] for r in db.session.query(Draw.album_id).all()}
    return CatalogIndex(Album.query.all(), drawn)


def match_rows(rows, index, is_admin):
    for r in rows:
        album = index.exact_match(r["artist"], r["album"], r["year"])
        if album:
            r["status"] = "exato"
            r["album_id"] = album.id
            r["album_label"] = album.label
            r["candidates"] = []
        else:
            r["album_id"] = None
            r["candidates"] = index.fuzzy(r["artist"], r["album"], r["year"])
            r["status"] = "revisar"
        if r["album_id"] and not is_admin and r["album_id"] not in index.drawn:
            r["status"] = "nao_sorteado"
    return rows


def create_job(user, filename, raw):
    rows = parse_legacy_csv(raw)
    if not rows:
        raise ImportFormatError("Nenhuma linha válida encontrada no arquivo.")
    index = build_index()
    match_rows(rows, index, user.is_admin)
    ImportJob.query.filter_by(user_id=user.id).delete()
    job = ImportJob(
        user_id=user.id,
        filename=filename,
        payload=json.dumps({"is_admin": bool(user.is_admin), "rows": rows}, ensure_ascii=False),
    )
    db.session.add(job)
    db.session.commit()
    return job


def job_rows(job):
    return json.loads(job.payload)


def apply_job(job, user, decisions, overwrite=False):
    """Aplica a importação.

    `decisions` mapeia número da linha -> id do álbum escolhido (ou None para ignorar)
    para as linhas que estavam em revisão.
    """
    data = job_rows(job)
    is_admin = data["is_admin"] and user.is_admin
    drawn = {r[0] for r in db.session.query(Draw.album_id).all()}
    valid_ids = {r[0] for r in db.session.query(Album.id).all()}
    summary = {"importadas": 0, "sorteios": 0, "ignoradas": 0, "descartadas": [], "existentes": 0,
               "duplicadas": 0}
    seen = set()
    existing = {r.album_id: r for r in Rating.query.filter_by(user_id=user.id).all()}

    for r in data["rows"]:
        album_id = r.get("album_id")
        if r["status"] == "revisar":
            album_id = decisions.get(r["line"])
        if not album_id or album_id not in valid_ids:
            summary["ignoradas"] += 1
            continue
        if album_id in seen:
            summary["duplicadas"] += 1
            continue
        seen.add(album_id)

        if is_admin:
            if album_id not in drawn:
                gen = parse_date(r.get("generated"))
                if gen is None:
                    from .utils import today_brt

                    gen = today_brt()
                db.session.add(Draw(album_id=album_id, draw_date=gen, source="importacao"))
                drawn.add(album_id)
                summary["sorteios"] += 1
        elif album_id not in drawn:
            # Nota para álbum ainda não sorteado (comparado ao histórico do administrador)
            summary["descartadas"].append(f"{r['artist']} — {r['album']}")
            continue

        if r.get("half_stars") is None and not r.get("notes"):
            continue
        rating = existing.get(album_id)
        if rating and not overwrite:
            summary["existentes"] += 1
            continue
        if not rating:
            rating = Rating(user_id=user.id, album_id=album_id)
            db.session.add(rating)
            existing[album_id] = rating
        rating.half_stars = r.get("half_stars")
        rating.comment = r.get("notes")
        summary["importadas"] += 1

    db.session.delete(job)
    db.session.commit()
    return summary
