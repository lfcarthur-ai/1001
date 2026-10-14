from flask import Blueprint, abort, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_user

from . import stats as st
from .auth import validate_user_fields
from .draw import ensure_daily_draw
from .enrich import wikipedia_search_url
from .models import Album, Draw, Rating, User, db
from .utils import decade_label

bp = Blueprint("main", __name__)

MAX_COMMENT = 5000


def _album_context(album, ds=None):
    ratings = (
        Rating.query.filter_by(album_id=album.id)
        .join(User)
        .order_by(Rating.updated_at.desc())
        .all()
    )
    scored = [r.half_stars / 2 for r in ratings if r.half_stars is not None]
    mine = next((r for r in ratings if r.user_id == current_user.id), None)
    order = None
    if album.draw:
        order = (
            Draw.query.filter(
                (Draw.draw_date < album.draw.draw_date)
                | ((Draw.draw_date == album.draw.draw_date) & (Draw.id <= album.draw.id))
            ).count()
        )
    return {
        "album": album,
        "ratings": ratings,
        "mine": mine,
        "avg": sum(scored) / len(scored) if scored else None,
        "votes": len(scored),
        "order": order,
        "editing": mine is None or request.args.get("editar") == "1",
        "wiki_fallback": wikipedia_search_url(album),
    }


@bp.get("/")
def home():
    draw = ensure_daily_draw()
    total = db.session.query(db.func.count(Album.id)).scalar() or 0
    drawn = db.session.query(db.func.count(Draw.id)).scalar() or 0
    ctx = _album_context(draw.album) if draw else None
    return render_template("home.html", draw=draw, ctx=ctx, total=total, drawn=drawn)


@bp.get("/album/<int:album_id>")
def album(album_id):
    album = db.session.get(Album, album_id) or abort(404)
    if not album.draw:
        abort(404, "Este álbum ainda não foi sorteado.")
    return render_template("album.html", ctx=_album_context(album))


@bp.post("/album/<int:album_id>/avaliar")
def rate(album_id):
    album = db.session.get(Album, album_id) or abort(404)
    if not album.draw:
        # Ninguém pode avaliar álbuns ainda não sorteados
        abort(403)
    try:
        half = int(request.form.get("half_stars", ""))
    except ValueError:
        half = None
    if half is None or not 1 <= half <= 10:
        flash("Escolha uma nota entre 0,5 e 5 estrelas.", "error")
        return redirect(request.referrer or url_for("main.album", album_id=album_id, editar=1))
    comment = (request.form.get("comment") or "").strip()[:MAX_COMMENT] or None
    rating = Rating.query.filter_by(user_id=current_user.id, album_id=album_id).first()
    if rating is None:
        rating = Rating(user_id=current_user.id, album_id=album_id)
        db.session.add(rating)
    rating.half_stars = half
    rating.should_be_in_list = request.form.get("should_be_in_list") == "1"
    rating.comment = comment
    db.session.commit()
    flash("Avaliação salva!", "success")
    target = request.form.get("next")
    if target == "home":
        return redirect(url_for("main.home"))
    return redirect(url_for("main.album", album_id=album_id))


@bp.post("/album/<int:album_id>/avaliacao/excluir")
def delete_rating(album_id):
    rating = Rating.query.filter_by(user_id=current_user.id, album_id=album_id).first_or_404()
    db.session.delete(rating)
    db.session.commit()
    flash("Avaliação excluída.", "info")
    return redirect(url_for("main.album", album_id=album_id))


def _target_user():
    uid = request.args.get("usuario", type=int)
    if uid and uid != current_user.id:
        return db.session.get(User, uid) or abort(404)
    return current_user


def history_rows(user, genre=None, decade=None, nota=None):
    ds = st.Dataset()
    my = {r.album_id: r for r in ds.ratings if r.user_id == user.id}
    review_counts = {}
    for r in ds.ratings:
        if r.half_stars is not None or r.comment:
            review_counts[r.album_id] = review_counts.get(r.album_id, 0) + 1
    rows = []
    for d in ds.draws:
        a = d.album
        mine = my.get(a.id)
        if genre and genre not in a.genres:
            continue
        if decade is not None and a.decade != decade:
            continue
        if nota:
            half = mine.half_stars if mine else None
            if nota == "sem" and half is not None:
                continue
            if nota != "sem" and (half is None or str(half) != nota):
                continue
        rows.append(
            {
                "order": ds.order[a.id],
                "draw": d,
                "album": a,
                "rating": mine,
                "avg": ds.album_avg(a.id),
                "votes": ds.album_votes(a.id),
                "reviews": review_counts.get(a.id, 0),
            }
        )
    return rows


def filter_options():
    drawn = Album.query.join(Draw).all()
    genres = sorted({g for a in drawn for g in a.genres})
    decades = sorted({a.decade for a in drawn if a.decade is not None})
    return genres, [(d, decade_label(d)) for d in decades]


@bp.get("/historico")
def history():
    user = _target_user()
    genre = request.args.get("genero") or None
    decade = request.args.get("decada", type=int)
    nota = request.args.get("nota") or None
    rows = history_rows(user, genre, decade, nota)
    genres, decades = filter_options()
    return render_template(
        "history.html", user=user, rows=rows, genres=genres, decades=decades,
        users=User.query.order_by(User.name).all(),
        f={"genero": genre, "decada": decade, "nota": nota},
    )


@bp.get("/estatisticas")
def my_stats():
    user = _target_user()
    data = st.individual_stats(user.id)
    return render_template("stats/individual.html", user=user, s=data,
                           users=User.query.order_by(User.name).all())


@bp.get("/grupo")
def group():
    return render_template("stats/group.html", s=st.group_stats())


RANKINGS = {
    "melhores": "Álbuns melhor avaliados",
    "piores": "Álbuns pior avaliados",
    "controversos": "Álbuns mais controversos",
}


@bp.get("/grupo/ranking/<tipo>")
def group_ranking(tipo):
    if tipo not in RANKINGS:
        abort(404)
    rows = st.ranking(st.Dataset(), tipo)
    return render_template("stats/ranking.html", rows=rows, tipo=tipo, title=RANKINGS[tipo])


@bp.route("/perfil", methods=["GET", "POST"])
def profile():
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        current = request.form.get("current_password", "")
        errors = validate_user_fields(name, email, password, request.form.get("password2", ""),
                                      require_password=False, user=current_user)
        if (password or email != current_user.email) and not current_user.check_password(current):
            errors.append("Informe sua senha atual para alterar e-mail ou senha.")
        if not errors:
            current_user.name = name
            current_user.email = email
            if password:
                current_user.set_password(password)
            db.session.commit()
            login_user(current_user)
            flash("Dados atualizados.", "success")
            return redirect(url_for("main.profile"))
        for e in errors:
            flash(e, "error")
    return render_template("profile.html")
