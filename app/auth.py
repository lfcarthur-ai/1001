import re
from urllib.parse import urlparse

from flask import Blueprint, flash, redirect, render_template, request, url_for
from flask_login import current_user, login_required, login_user, logout_user
from sqlalchemy.exc import IntegrityError

from .models import User, db

bp = Blueprint("auth", __name__)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD = 8


def validate_user_fields(name, email, password=None, password2=None, require_password=True, user=None):
    errors = []
    if not name or len(name) > 80:
        errors.append("Informe um nome (até 80 caracteres).")
    if not email or not EMAIL_RE.match(email):
        errors.append("Informe um e-mail válido.")
    else:
        other = User.query.filter(db.func.lower(User.email) == email.lower()).first()
        if other and (user is None or other.id != user.id):
            errors.append("Este e-mail já está cadastrado.")
    if require_password or password:
        if not password or len(password) < MIN_PASSWORD:
            errors.append(f"A senha deve ter pelo menos {MIN_PASSWORD} caracteres.")
        elif password != password2:
            errors.append("As senhas não conferem.")
    return errors


def _safe_next(target):
    if not target:
        return None
    parsed = urlparse(target)
    if parsed.scheme or parsed.netloc or not target.startswith("/"):
        return None
    return target


@bp.route("/entrar", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("main.home"))
    if request.method == "POST":
        email = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        user = User.query.filter(db.func.lower(User.email) == email).first()
        if user and user.check_password(password):
            if not user.active:
                flash("Sua conta está desativada. Fale com o administrador.", "error")
            else:
                login_user(user, remember=bool(request.form.get("remember")))
                return redirect(_safe_next(request.args.get("next")) or url_for("main.home"))
        else:
            flash("E-mail ou senha inválidos.", "error")
    return render_template("auth/login.html", no_users=User.query.first() is None)


@bp.route("/cadastro", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        return redirect(url_for("main.home"))
    form = {"name": "", "email": ""}
    if request.method == "POST":
        form["name"] = request.form.get("name", "").strip()
        form["email"] = request.form.get("email", "").strip().lower()
        password = request.form.get("password", "")
        errors = validate_user_fields(form["name"], form["email"], password,
                                      request.form.get("password2", ""))
        if not errors:
            # O primeiro usuário criado é o administrador inicial
            is_first = User.query.first() is None
            user = User(name=form["name"], email=form["email"], is_admin=is_first)
            user.set_password(password)
            db.session.add(user)
            try:
                db.session.commit()
            except IntegrityError:
                db.session.rollback()
                errors.append("Este e-mail já está cadastrado.")
            else:
                login_user(user)
                if is_first:
                    flash("Conta criada! Você é o administrador da plataforma.", "success")
                else:
                    flash("Conta criada! Bem-vindo(a).", "success")
                return redirect(url_for("main.home"))
        for e in errors:
            flash(e, "error")
    return render_template("auth/register.html", form=form)


@bp.post("/sair")
@login_required
def logout():
    logout_user()
    flash("Você saiu da sua conta.", "info")
    return redirect(url_for("auth.login"))
