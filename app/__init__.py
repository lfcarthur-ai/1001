import logging
import os

import click
from flask import Flask, redirect, request, url_for
from flask_login import LoginManager, current_user
from flask_wtf.csrf import CSRFProtect

from . import utils
from .config import Config
from .models import Album, User, db

login_manager = LoginManager()
login_manager.login_view = "auth.login"
login_manager.login_message = "Entre para acessar esta página."
login_manager.login_message_category = "info"
csrf = CSRFProtect()

PUBLIC_ENDPOINTS = {"auth.login", "auth.register", "static", "health"}


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))


def create_app(config_class=Config):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_object(config_class)
    os.makedirs(app.instance_path, exist_ok=True)
    logging.basicConfig(level=logging.INFO)

    db.init_app(app)
    login_manager.init_app(app)
    csrf.init_app(app)

    from .admin import bp as admin_bp
    from .auth import bp as auth_bp
    from .data_io import bp as data_bp
    from .views import bp as main_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(main_bp)
    app.register_blueprint(data_bp)
    app.register_blueprint(admin_bp)

    @app.before_request
    def require_login():
        # Autenticação obrigatória em todas as páginas
        if request.endpoint in PUBLIC_ENDPOINTS or request.endpoint is None:
            return None
        if not current_user.is_authenticated:
            return redirect(url_for("auth.login", next=request.full_path))
        return None

    from flask import render_template

    errors = {
        403: ("Acesso negado", "Você não tem permissão para esta ação."),
        404: ("Página não encontrada", "O endereço acessado não existe."),
        413: ("Arquivo muito grande", "O arquivo enviado excede o limite de 5 MB."),
        500: ("Erro interno", "Algo deu errado. Tente novamente em instantes."),
    }

    def handle_error(exc):
        code = getattr(exc, "code", 500) or 500
        title, default = errors.get(code, ("Erro", "Ocorreu um erro."))
        desc = getattr(exc, "description", None)
        message = desc if desc and code == 404 and "não" in desc else default
        return render_template("error.html", code=code, title=title, message=message), code

    for code in errors:
        app.register_error_handler(code, handle_error)

    @app.get("/saude")
    def health():
        return {"status": "ok"}

    app.jinja_env.filters["stars"] = utils.fmt_stars
    app.jinja_env.filters["num"] = utils.fmt_num
    app.jinja_env.filters["delta"] = utils.fmt_delta
    app.jinja_env.filters["pct"] = utils.fmt_pct
    app.jinja_env.filters["data"] = utils.fmt_date
    app.jinja_env.filters["decada"] = utils.decade_label
    app.jinja_env.globals["today_brt"] = utils.today_brt

    with app.app_context():
        db.create_all()
        csv_path = app.config.get("ALBUMS_CSV")
        if csv_path and os.path.exists(csv_path) and db.session.query(Album.id).first() is None:
            from .catalog import load_catalog

            n = load_catalog(csv_path)
            app.logger.info("Catálogo carregado: %s álbuns", n)

    register_cli(app)

    if app.config.get("SCHEDULER_ENABLED"):
        from .scheduler import start_scheduler

        start_scheduler(app)

    return app


def register_cli(app):
    @app.cli.command("carregar-catalogo")
    @click.argument("caminho")
    def carregar_catalogo(caminho):
        """Carrega/atualiza o catálogo de álbuns a partir de um CSV."""
        from .catalog import load_catalog

        click.echo(f"{load_catalog(caminho)} álbuns inseridos.")

    @app.cli.command("sortear")
    def sortear():
        """Executa o sorteio do álbum do dia (idempotente)."""
        from .draw import ensure_daily_draw

        d = ensure_daily_draw()
        click.echo(f"Álbum do dia: {d.album.label}" if d else "Nenhum álbum disponível.")

    @app.cli.command("enriquecer")
    @click.option("--limite", default=50)
    def enriquecer(limite):
        """Enriquece álbuns pendentes (capa, links, país)."""
        from .enrich import enrich_pending

        click.echo(f"{enrich_pending(limite)} álbuns processados.")
