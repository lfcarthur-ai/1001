"""Cálculo de estatísticas individuais e do grupo.

As notas são guardadas em meias-estrelas (1–10) e convertidas para estrelas (0,5–5).
O volume de dados é pequeno (≤ 1.089 álbuns × poucos usuários), então os cálculos
são feitos em memória a cada requisição.
"""

import math
from collections import defaultdict
from statistics import mean, pstdev

from .models import Album, Draw, Rating, User, db
from .utils import decade_label

MIN_ALBUMS_FOR_FAVORITE = 3


def _pearson(xs, ys):
    if len(xs) < 3:
        return None
    mx, my = mean(xs), mean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    den = math.sqrt(sum((x - mx) ** 2 for x in xs) * sum((y - my) ** 2 for y in ys))
    return num / den if den else None


class Dataset:
    """Fotografia dos dados necessários para as estatísticas."""

    def __init__(self):
        self.draws = Draw.query.order_by(Draw.draw_date.asc(), Draw.id.asc()).all()
        self.order = {d.album_id: i for i, d in enumerate(self.draws, start=1)}
        self.albums = {d.album_id: d.album for d in self.draws}
        self.total_albums = db.session.query(db.func.count(Album.id)).scalar() or 0
        self.users = {u.id: u for u in User.query.order_by(User.name).all()}
        ratings = Rating.query.filter(Rating.album_id.in_(list(self.albums) or [0])).all()
        self.ratings = ratings
        self.scored = [r for r in ratings if r.half_stars is not None]
        self.by_album = defaultdict(dict)  # album_id -> {user_id: estrelas}
        self.by_user = defaultdict(dict)  # user_id -> {album_id: estrelas}
        for r in self.scored:
            self.by_album[r.album_id][r.user_id] = r.half_stars / 2
            self.by_user[r.user_id][r.album_id] = r.half_stars / 2

    def album_avg(self, album_id):
        votes = self.by_album.get(album_id)
        return mean(votes.values()) if votes else None

    def album_votes(self, album_id):
        return len(self.by_album.get(album_id, {}))

    def album_std(self, album_id):
        votes = self.by_album.get(album_id, {})
        return pstdev(votes.values()) if len(votes) >= 2 else None


DIMENSIONS = {
    "decada": ("Década", lambda a: [a.decade] if a.decade is not None else [None]),
    "genero": ("Gênero", lambda a: a.genres or [None]),
    "pais": ("País de origem", lambda a: [a.country]),
}


def dim_label(dim, key):
    if key is None:
        return "Sem data" if dim == "decada" else "Não informado"
    return decade_label(key) if dim == "decada" else key


def _sort_key(dim):
    def key(row):
        k = row["key"]
        if dim == "decada":
            return (k is None, k or 0)
        return (k is None, -row["n"], str(k))

    return key


# ---------------------------------------------------------------- individuais

def user_breakdown(ds, user_id, dim):
    """Por categoria: nº de álbuns, média do usuário, média de todos nos mesmos álbuns, delta."""
    _, keyfn = DIMENSIONS[dim]
    mine = ds.by_user.get(user_id, {})
    groups = defaultdict(list)
    for album_id, stars in mine.items():
        for k in keyfn(ds.albums[album_id]):
            groups[k].append((album_id, stars))
    rows = []
    for k, items in groups.items():
        user_avg = mean(s for _, s in items)
        all_votes = [v for aid, _ in items for v in ds.by_album[aid].values()]
        group_avg = mean(all_votes) if all_votes else None
        rows.append(
            {
                "key": k,
                "label": dim_label(dim, k),
                "n": len(items),
                "user_avg": user_avg,
                "group_avg": group_avg,
                "delta": user_avg - group_avg if group_avg is not None else None,
            }
        )
    rows.sort(key=_sort_key(dim))
    return rows


def user_by_year(ds, user_id):
    mine = ds.by_user.get(user_id, {})
    groups = defaultdict(list)
    for album_id, stars in mine.items():
        groups[ds.albums[album_id].year].append((album_id, stars))
    rows = []
    for year, items in groups.items():
        all_votes = [v for aid, _ in items for v in ds.by_album[aid].values()]
        u = mean(s for _, s in items)
        g = mean(all_votes)
        rows.append({"key": year, "label": str(year) if year else "Sem data", "n": len(items),
                     "user_avg": u, "group_avg": g, "delta": u - g})
    rows.sort(key=lambda r: (r["key"] is None, r["key"] or 0))
    return rows


def user_outliers(ds, user_id, limit=5):
    """Álbuns em que a nota do usuário mais diverge da média dos demais."""
    rows = []
    for album_id, stars in ds.by_user.get(user_id, {}).items():
        others = [v for uid, v in ds.by_album[album_id].items() if uid != user_id]
        if not others:
            continue
        others_avg = mean(others)
        rows.append({"album": ds.albums[album_id], "user": stars, "others_avg": others_avg,
                     "others_n": len(others), "delta": stars - others_avg})
    above = sorted([r for r in rows if r["delta"] > 0], key=lambda r: -r["delta"])[:limit]
    below = sorted([r for r in rows if r["delta"] < 0], key=lambda r: r["delta"])[:limit]
    return {"acima": above, "abaixo": below}


def should_be_in_list(ds, user_id=None):
    answered = [r for r in ds.ratings if r.should_be_in_list is not None
                and (user_id is None or r.user_id == user_id)]
    if not answered:
        return {"pct": None, "yes": 0, "n": 0}
    yes = sum(1 for r in answered if r.should_be_in_list)
    return {"pct": yes / len(answered), "yes": yes, "n": len(answered)}


def user_comparisons(ds, user_id):
    mine = ds.by_user.get(user_id, {})
    rows = []
    for other_id, theirs in ds.by_user.items():
        if other_id == user_id or other_id not in ds.users:
            continue
        common = sorted(set(mine) & set(theirs))
        if not common:
            rows.append({"user": ds.users[other_id], "n": 0})
            continue
        xs = [mine[a] for a in common]
        ys = [theirs[a] for a in common]
        mad = mean(abs(x - y) for x, y in zip(xs, ys))
        rows.append(
            {
                "user": ds.users[other_id],
                "n": len(common),
                "my_avg": mean(xs),
                "their_avg": mean(ys),
                "delta": mean(xs) - mean(ys),
                "mad": mad,
                "agreement": 1 - mad / 4.5,
                "corr": _pearson(xs, ys),
            }
        )
    rows.sort(key=lambda r: (r["n"] == 0, -(r.get("agreement") or 0), r["user"].name.lower()))
    return rows


def user_summary(ds, user_id):
    mine = ds.by_user.get(user_id, {})
    all_votes = [v for votes in ds.by_album.values() for v in votes.values()]
    same_albums = [v for aid in mine for v in ds.by_album[aid].values()]
    return {
        "rated": len(mine),
        "drawn": len(ds.draws),
        "user_avg": mean(mine.values()) if mine else None,
        "group_avg_same": mean(same_albums) if same_albums else None,
        "group_avg": mean(all_votes) if all_votes else None,
    }


def individual_stats(user_id, ds=None):
    ds = ds or Dataset()
    return {
        "summary": user_summary(ds, user_id),
        "decada": user_breakdown(ds, user_id, "decada"),
        "genero": user_breakdown(ds, user_id, "genero"),
        "pais": user_breakdown(ds, user_id, "pais"),
        "ano": user_by_year(ds, user_id),
        "outliers": user_outliers(ds, user_id),
        "lista_usuario": should_be_in_list(ds, user_id),
        "lista_global": should_be_in_list(ds),
        "comparacoes": user_comparisons(ds, user_id),
    }


# ---------------------------------------------------------------------- grupo

def group_breakdown(ds, dim):
    _, keyfn = DIMENSIONS[dim]
    groups = defaultdict(lambda: {"albums": set(), "votes": []})
    for album_id, votes in ds.by_album.items():
        if not votes:
            continue
        for k in keyfn(ds.albums[album_id]):
            groups[k]["albums"].add(album_id)
            groups[k]["votes"].extend(votes.values())
    rows = [
        {"key": k, "label": dim_label(dim, k), "n": len(g["albums"]), "votes": len(g["votes"]),
         "avg": mean(g["votes"])}
        for k, g in groups.items()
    ]
    rows.sort(key=_sort_key(dim))
    return rows


def _best_worst(rows):
    candidates = [r for r in rows if r["key"] is not None and r["n"] >= MIN_ALBUMS_FOR_FAVORITE]
    if not candidates:
        candidates = [r for r in rows if r["key"] is not None]
    if not candidates:
        return None, None
    ordered = sorted(candidates, key=lambda r: r["avg"])
    return ordered[-1], ordered[0]


def album_table(ds):
    rows = []
    for d in ds.draws:
        rows.append(
            {
                "order": ds.order[d.album_id],
                "draw": d,
                "album": d.album,
                "avg": ds.album_avg(d.album_id),
                "votes": ds.album_votes(d.album_id),
                "std": ds.album_std(d.album_id),
            }
        )
    return rows


def ranking(ds, kind):
    rows = [r for r in album_table(ds) if r["votes"] > 0]
    if kind == "melhores":
        rows.sort(key=lambda r: (-r["avg"], -r["votes"]))
    elif kind == "piores":
        rows.sort(key=lambda r: (r["avg"], -r["votes"]))
    elif kind == "controversos":
        rows = [r for r in rows if r["std"] is not None]
        rows.sort(key=lambda r: (-r["std"], -r["votes"]))
    else:
        raise ValueError(kind)
    return rows


def distribution(ds):
    counts = {h: 0 for h in range(1, 11)}
    for r in ds.scored:
        counts[r.half_stars] += 1
    total = sum(counts.values())
    peak = max(counts.values()) if total else 0
    return [
        {"half": h, "stars": h / 2, "count": c, "pct": (c / total) if total else 0,
         "bar": (c / peak) if peak else 0}
        for h, c in counts.items()
    ]


def group_stats(ds=None):
    ds = ds or Dataset()
    decades = group_breakdown(ds, "decada")
    genres = group_breakdown(ds, "genero")
    countries = group_breakdown(ds, "pais")
    best_decade, worst_decade = _best_worst(decades)
    best_genre, worst_genre = _best_worst(genres)
    all_votes = [r.half_stars / 2 for r in ds.scored]
    return {
        "drawn": len(ds.draws),
        "total": ds.total_albums,
        "progress": (len(ds.draws) / ds.total_albums) if ds.total_albums else 0,
        "votes": len(all_votes),
        "avg": mean(all_votes) if all_votes else None,
        "distribution": distribution(ds),
        "best_decade": best_decade,
        "worst_decade": worst_decade,
        "best_genre": best_genre,
        "worst_genre": worst_genre,
        "top": ranking(ds, "melhores")[:5],
        "bottom": ranking(ds, "piores")[:5],
        "controversial": ranking(ds, "controversos")[:5],
        "decada": decades,
        "genero": genres,
        "pais": countries,
        "albums": album_table(ds),
        "lista_global": should_be_in_list(ds),
    }
