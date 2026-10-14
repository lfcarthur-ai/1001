"""Carga do catálogo de álbuns a partir do CSV fornecido."""

import csv
import io

from .models import Album, db
from .utils import normalize, parse_year

# Cabeçalhos aceitos (normalizados) -> campo
HEADER_ALIASES = {
    "artist": {"artista", "artist", "artistas", "artists"},
    "title": {"nome album", "nome do album", "album", "titulo", "title", "nome"},
    "year": {"ano lancamento", "ano de lancamento", "ano", "year", "released", "release year", "release date",
             "data lancamento", "data de lancamento"},
    "duration": {"duracao", "duration", "tempo", "run time", "runtime"},
    "genre": {"genero", "generos", "genre", "genres"},
}


def _canonical_header(name):
    n = normalize(name).replace(" de ", " ").replace(" do ", " ")
    n2 = normalize(name)
    for field, aliases in HEADER_ALIASES.items():
        if n in aliases or n2 in aliases:
            return field
    return None


def read_csv_text(raw: bytes) -> str:
    for enc in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", errors="replace")


def sniff_reader(text):
    sample = text[:4096]
    try:
        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
    except csv.Error:
        dialect = csv.excel
    return csv.reader(io.StringIO(text), dialect)


def parse_catalog(text):
    reader = sniff_reader(text)
    rows = list(reader)
    if not rows:
        return []
    header = [_canonical_header(h) for h in rows[0]]
    if "artist" not in header or "title" not in header:
        # Sem cabeçalho reconhecível: assume a ordem do enunciado.
        header = ["artist", "title", "year", "duration", "genre"]
        data = rows
    else:
        data = rows[1:]
    albums = []
    genre_forms = {}
    for row in data:
        rec = {}
        for i, field in enumerate(header):
            if field and i < len(row):
                rec[field] = row[i].strip()
        if not rec.get("artist") or not rec.get("title"):
            continue
        genre = rec.get("genre") or None
        if genre:
            # Unifica variações de caixa ("hip Hop" -> "Hip Hop")
            genre = genre_forms.setdefault(genre.lower(), genre[:1].upper() + genre[1:])
        albums.append(
            {
                "artist": rec["artist"],
                "title": rec["title"],
                "year": parse_year(rec.get("year")),
                "duration": rec.get("duration") or None,
                "genre": genre,
            }
        )
    return albums


def load_catalog(path_or_bytes):
    """Insere os álbuns do CSV que ainda não existem. Retorna quantos foram inseridos."""
    if isinstance(path_or_bytes, (bytes, bytearray)):
        raw = bytes(path_or_bytes)
    else:
        with open(path_or_bytes, "rb") as fh:
            raw = fh.read()
    records = parse_catalog(read_csv_text(raw))
    existing = {(a.artist, a.title, a.year) for a in Album.query.all()}
    inserted = 0
    for r in records:
        key = (r["artist"], r["title"], r["year"])
        if key in existing:
            continue
        existing.add(key)
        db.session.add(Album(**r))
        inserted += 1
    db.session.commit()
    return inserted
