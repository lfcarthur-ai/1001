import re
import unicodedata
from datetime import date, datetime
from zoneinfo import ZoneInfo

BRT = ZoneInfo("America/Sao_Paulo")

ARTICLES = {
    "the", "a", "an",  # inglês
    "o", "os", "as", "um", "uma",  # português ("a" já incluído)
    "el", "la", "los", "las",  # espanhol
    "le", "les", "l",  # francês
    "der", "die", "das",  # alemão
    "il", "lo", "gli",  # italiano
}

_QUOTES = {
    "‘": "'", "’": "'", "‚": "'", "‛": "'", "′": "'", "`": "'", "´": "'",
    "“": '"', "”": '"', "„": '"', "‟": '"', "″": '"',
    "–": "-", "—": "-", "‐": "-", "‑": "-", "−": "-",
}


def now_brt():
    return datetime.now(BRT)


def today_brt():
    return now_brt().date()


def normalize(text):
    """Normaliza para comparação: minúsculas, sem acentos, aspas especiais,
    pontuação e artigos."""
    if not text:
        return ""
    s = str(text)
    for k, v in _QUOTES.items():
        s = s.replace(k, v)
    s = unicodedata.normalize("NFKD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().replace("&", " and ")
    s = s.replace("'", "")  # "don't" -> "dont"
    s = re.sub(r"[^\w\s]", " ", s)
    s = s.replace("_", " ")
    tokens = [t for t in s.split() if t not in ARTICLES and t != "and"]
    return " ".join(tokens)


def split_genres(genre):
    if not genre:
        return []
    parts = re.split(r"[;,]", genre)
    return [p.strip() for p in parts if p.strip()]


def parse_year(value):
    if value is None:
        return None
    m = re.search(r"(\d{4})", str(value))
    return int(m.group(1)) if m else None


def parse_date(value):
    """Aceita AAAA-MM-DD, DD/MM/AAAA, AAAA/MM/DD e variações com horário."""
    if not value:
        return None
    s = str(value).strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(s[:10], fmt).date()
        except ValueError:
            continue
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def parse_rating(value):
    """Converte nota (0,5–5) em meias-estrelas (1–10). Retorna None se vazia/inválida."""
    if value is None:
        return None
    s = str(value).strip().replace(",", ".")
    if not s:
        return None
    try:
        v = float(s)
    except ValueError:
        return None
    half = int(round(v * 2))
    if half < 1 or half > 10:
        return None
    return half


def fmt_num(value, digits=2):
    if value is None:
        return "—"
    return f"{value:.{digits}f}".replace(".", ",")


def fmt_stars(half_stars):
    if half_stars is None:
        return "—"
    return fmt_num(half_stars / 2, 1)


def fmt_delta(value):
    if value is None:
        return "—"
    sign = "+" if value > 0 else ""
    return sign + fmt_num(value)


def fmt_pct(value):
    if value is None:
        return "—"
    return f"{value * 100:.0f}%"


def fmt_date(value):
    if not value:
        return "—"
    if isinstance(value, (date, datetime)):
        return value.strftime("%d/%m/%Y")
    s = str(value)
    parts = s.split("-")
    if len(parts) == 3:
        return f"{parts[2]}/{parts[1]}/{parts[0]}"
    if len(parts) == 2:
        return f"{parts[1]}/{parts[0]}"
    return s


def decade_label(decade):
    if decade is None:
        return "Sem data"
    return f"Anos {decade}" if decade >= 2000 else f"Anos {decade % 100:02d}"


# Códigos ISO 3166-1 alfa-2 (MusicBrainz) -> nome em português
COUNTRY_NAMES = {
    "US": "Estados Unidos", "GB": "Reino Unido", "XE": "Europa", "XW": "Mundial",
    "CA": "Canadá", "AU": "Austrália", "NZ": "Nova Zelândia", "IE": "Irlanda",
    "DE": "Alemanha", "FR": "França", "IT": "Itália", "ES": "Espanha", "PT": "Portugal",
    "NL": "Países Baixos", "BE": "Bélgica", "SE": "Suécia", "NO": "Noruega",
    "DK": "Dinamarca", "FI": "Finlândia", "IS": "Islândia", "AT": "Áustria",
    "CH": "Suíça", "PL": "Polônia", "CZ": "Tchéquia", "HU": "Hungria", "GR": "Grécia",
    "RU": "Rússia", "SU": "União Soviética", "UA": "Ucrânia", "TR": "Turquia",
    "BR": "Brasil", "AR": "Argentina", "CL": "Chile", "CO": "Colômbia", "MX": "México",
    "CU": "Cuba", "JM": "Jamaica", "TT": "Trinidad e Tobago", "PE": "Peru", "UY": "Uruguai",
    "VE": "Venezuela", "PR": "Porto Rico", "BB": "Barbados",
    "JP": "Japão", "KR": "Coreia do Sul", "CN": "China", "IN": "Índia", "ID": "Indonésia",
    "IL": "Israel", "IR": "Irã", "PK": "Paquistão", "TH": "Tailândia", "VN": "Vietnã",
    "ZA": "África do Sul", "NG": "Nigéria", "ML": "Mali", "SN": "Senegal", "GH": "Gana",
    "BJ": "Benin", "CD": "Rep. Dem. do Congo", "CM": "Camarões", "EG": "Egito",
    "ET": "Etiópia", "CV": "Cabo Verde", "AO": "Angola", "MZ": "Moçambique",
    "DZ": "Argélia", "MA": "Marrocos", "KE": "Quênia", "ZW": "Zimbábue", "NE": "Níger",
    "XG": "Alemanha Oriental", "YU": "Iugoslávia", "CS": "Tchecoslováquia",
}


def country_name(code_or_name):
    if not code_or_name:
        return None
    return COUNTRY_NAMES.get(code_or_name.upper(), code_or_name) if len(code_or_name) == 2 else code_or_name
