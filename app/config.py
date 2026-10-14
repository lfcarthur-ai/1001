import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-inseguro-troque-em-producao")
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL", f"sqlite:///{BASE_DIR / 'instance' / 'app.db'}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {"pool_pre_ping": True}
    MAX_CONTENT_LENGTH = 5 * 1024 * 1024

    # Catálogo inicial (carregado automaticamente se a tabela de álbuns estiver vazia)
    ALBUMS_CSV = os.environ.get("ALBUMS_CSV", str(BASE_DIR / "data" / "albums.csv"))

    TIMEZONE = "America/Sao_Paulo"

    # Tarefas em segundo plano (sorteio à meia-noite e enriquecimento)
    SCHEDULER_ENABLED = os.environ.get("SCHEDULER_ENABLED", "1") == "1"
    ENRICH_ENABLED = os.environ.get("ENRICH_ENABLED", "1") == "1"
    ENRICH_BATCH_SIZE = int(os.environ.get("ENRICH_BATCH_SIZE", "10"))
    ENRICH_INTERVAL_MINUTES = int(os.environ.get("ENRICH_INTERVAL_MINUTES", "5"))
    HTTP_USER_AGENT = os.environ.get(
        "HTTP_USER_AGENT", "1001AlbunsClube/1.0 (https://github.com/lfcarthur-ai/1001)"
    )


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    WTF_CSRF_ENABLED = False
    SCHEDULER_ENABLED = False
    ENRICH_ENABLED = False
    ALBUMS_CSV = ""
