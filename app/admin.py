from functools import wraps

from flask import Blueprint, abort, flash, redirect, render_template, request, url_for
from flask_login import current_user

from .auth import validate_user_fields
from .enrich import MAX_ATTEMPTS, enrich_album, enrich_pending
from .models import Album, Draw, User, db

bp = Blueprint("admin", __name__, url_prefix="/admin")


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        if not current_user.is_authenticated or not current_user.is_admin:
            abort(403)
        return fn(*args, **kwargs)

    return wrapper


def _admin_count():
    return User.query.filter_by(is_admin=True, active=True).count()


@bp.get("/")
@admin_required
def index():
    total = Album.query.count()
    enriched = Album.query.filter(Album.enriched_at.isnot(None)).count()
    pending = Album.query.filter(Album.enriched_at.is_(None), Album.enrich_attempts < MAX_ATTEMPTS).count()
    missing_cover = Album.query.join(Draw).filter(Album.cover_url.is_(None)).count()
    return render_template(
        "admin/index.html",
        users=User.query.order_by(User.created_at).all(),
        total=total, enriched=enriched, pending=pending, missing_cover=missing_cover,
        drawn=Draw.query.count(),
    )


@bp.route("/usuarios/<int:user_id>", methods=["GET", "POST"])
@admin_required
def edit_user(user_id):
    user = db.session.get(User, user_id) or abort(404)
    if request.method == "POST":
        name = request.form.get("name", "").strip()
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        is_admin = request.form.get("is_admin") == "1"
        active = request.form.get("active") == "1"
        errors = validate_user_fields(name, email, password, request.form.get("password2", ""),
                                      require_password=False, user=user)
        losing_admin = user.is_admin and user.active and (not is_admin or not active)
        if losing_admin and _admin_count() <= 1:
            errors.append("A plataforma precisa de pelo menos um administrador ativo.")
        if user.id == current_user.id and not active:
            errors.append("Você não pode desativar a própria conta.")
        if not errors:
            user.name, user.email, user.is_admin, user.active = name, email, is_admin, active
            if password:
                user.set_password(password)
            db.session.commit()
            flash("Usuário atualizado.", "success")
            return redirect(url_for("admin.index"))
        for e in errors:
            flash(e, "error")
    return render_template("admin/user.html", user=user)


@bp.post("/usuarios/<int:user_id>/excluir")
@admin_required
def delete_user(user_id):
    user = db.session.get(User, user_id) or abort(404)
    if user.id == current_user.id:
        flash("Você não pode excluir a própria conta.", "error")
        return redirect(url_for("admin.edit_user", user_id=user.id))
    if user.is_admin and _admin_count() <= 1:
        flash("A plataforma precisa de pelo menos um administrador ativo.", "error")
        return redirect(url_for("admin.edit_user", user_id=user.id))
    db.session.delete(user)
    db.session.commit()
    flash("Usuário excluído, junto com suas avaliações.", "info")
    return redirect(url_for("admin.index"))


@bp.post("/enriquecer")
@admin_required
def enrich_now():
    n = enrich_pending(limit=request.form.get("limite", 5, type=int))
    flash(f"{n} álbum(ns) processado(s).", "info")
    return redirect(url_for("admin.index"))


@bp.post("/album/<int:album_id>/reenriquecer")
@admin_required
def re_enrich(album_id):
    album = db.session.get(Album, album_id) or abort(404)
    album.cover_url = album.wikipedia_url = album.country = album.release_date = None
    album.rym_url = album.musicbrainz_id = album.enriched_at = None
    album.enrich_attempts = 0
    enrich_album(album)
    flash("Dados do álbum atualizados a partir das APIs públicas.", "info")
    return redirect(request.referrer or url_for("main.album", album_id=album.id))
