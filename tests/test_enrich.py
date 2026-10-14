from app.enrich import enrich_album, rym_slug
from app.models import Album


class FakeResp:
    def __init__(self, data=None, status=200):
        self._data, self.status_code = data, status

    def json(self):
        return self._data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(self.status_code)


class FakeSession:
    def __init__(self):
        self.calls = []

    def get(self, url, params=None, timeout=None):
        self.calls.append(url)
        if url.endswith("/release-group/"):
            return FakeResp({"release-groups": [
                {"id": "rg-wrong", "title": "Abbey Road Live", "first-release-date": "1990",
                 "artist-credit": [{"name": "Tribute Band", "artist": {"id": "x"}}]},
                {"id": "rg-1", "title": "Abbey Road", "primary-type": "Album", "first-release-date": "1969-09-26",
                 "artist-credit": [{"name": "The Beatles", "artist": {"id": "art-1"}}]},
            ]})
        if url.endswith("/artist/art-1"):
            return FakeResp({"country": "GB"})
        if url.endswith("/release-group/rg-1"):
            return FakeResp({"relations": [{"type": "wikidata", "url": {"resource": "https://www.wikidata.org/wiki/Q173643"}}]})
        if "wikidata.org" in url:
            return FakeResp({"entities": {"Q173643": {"sitelinks": {"enwiki": {"title": "Abbey Road"},
                                                                     "ptwiki": {"title": "Abbey Road"}}}}})
        raise AssertionError(url)

    def head(self, url, allow_redirects=False, timeout=None):
        return FakeResp(status=307)


def test_enrich_album(app, monkeypatch):
    import app.enrich as enrich

    monkeypatch.setattr(enrich.time, "sleep", lambda s: None)
    album = Album.query.filter_by(title="Abbey Road").one()
    enrich_album(album, FakeSession())
    assert album.musicbrainz_id == "rg-1"
    assert album.release_date == "1969-09-26"
    assert album.country == "Reino Unido"
    assert album.wikipedia_url == "https://pt.wikipedia.org/wiki/Abbey_Road"
    assert album.cover_url == "https://coverartarchive.org/release-group/rg-1/front-500"
    assert album.rym_url == "https://rateyourmusic.com/release/album/the-beatles/abbey-road/"
    assert album.enriched_at is not None


def test_rym_slug():
    assert rym_slug("Sgt. Pepper's Lonely Hearts Club Band") == "sgt-peppers-lonely-hearts-club-band"
    assert rym_slug("Sigur Rós") == "sigur-ros"
    assert rym_slug("Simon & Garfunkel") == "simon-and-garfunkel"
