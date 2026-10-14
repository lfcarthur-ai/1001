from datetime import datetime, timezone

from flask_login import UserMixin
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash

db = SQLAlchemy()


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(UserMixin, db.Model):
    __tablename__ = "users"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    is_admin = db.Column(db.Boolean, nullable=False, default=False)
    active = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    ratings = db.relationship("Rating", back_populates="user", cascade="all, delete-orphan")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    @property
    def is_active(self):
        return self.active


class Album(db.Model):
    """Catálogo da lista. Carregado do CSV; nunca alterado por usuários.

    Os campos de enriquecimento (capa, links, país, data) são preenchidos
    automaticamente por app.enrich.
    """

    __tablename__ = "albums"
    __table_args__ = (db.UniqueConstraint("artist", "title", "year", name="uq_album"),)

    id = db.Column(db.Integer, primary_key=True)
    artist = db.Column(db.String(255), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    year = db.Column(db.Integer, nullable=True)
    duration = db.Column(db.String(32), nullable=True)
    genre = db.Column(db.String(255), nullable=True)

    cover_url = db.Column(db.String(500))
    wikipedia_url = db.Column(db.String(500))
    rym_url = db.Column(db.String(500))
    country = db.Column(db.String(80))
    release_date = db.Column(db.String(10))  # AAAA, AAAA-MM ou AAAA-MM-DD
    musicbrainz_id = db.Column(db.String(36))
    enriched_at = db.Column(db.DateTime)
    enrich_attempts = db.Column(db.Integer, nullable=False, default=0)

    draw = db.relationship("Draw", back_populates="album", uselist=False)
    ratings = db.relationship("Rating", back_populates="album")

    @property
    def decade(self):
        return (self.year // 10) * 10 if self.year else None

    @property
    def genres(self):
        from .utils import split_genres

        return split_genres(self.genre)

    @property
    def rym_link(self):
        if self.rym_url:
            return self.rym_url
        from .enrich import rym_url

        return rym_url(self)

    @property
    def label(self):
        return f"{self.artist} — {self.title}" + (f" ({self.year})" if self.year else "")


class Draw(db.Model):
    """Histórico de sorteios (o histórico do administrador).

    Define quais álbuns já foram ouvidos. `daily_date` é preenchido somente
    para o álbum do dia, e é único: no máximo um álbum do dia por data.
    """

    __tablename__ = "draws"

    id = db.Column(db.Integer, primary_key=True)
    album_id = db.Column(db.Integer, db.ForeignKey("albums.id"), unique=True, nullable=False)
    draw_date = db.Column(db.Date, nullable=False, index=True)
    daily_date = db.Column(db.Date, unique=True, nullable=True)
    source = db.Column(db.String(16), nullable=False, default="sorteio")  # sorteio | importacao
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    album = db.relationship("Album", back_populates="draw")


class Rating(db.Model):
    __tablename__ = "ratings"
    __table_args__ = (db.UniqueConstraint("user_id", "album_id", name="uq_rating"),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    album_id = db.Column(db.Integer, db.ForeignKey("albums.id"), nullable=False, index=True)
    # Meias-estrelas: 1 = 0,5★ ... 10 = 5★. Nulo = ouvido sem nota (ex.: importação).
    half_stars = db.Column(db.Integer, nullable=True)
    # Nulo = não informado (ex.: importação de histórico legado).
    should_be_in_list = db.Column(db.Boolean, nullable=True)
    comment = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    user = db.relationship("User", back_populates="ratings")
    album = db.relationship("Album", back_populates="ratings")

    @property
    def stars(self):
        return self.half_stars / 2 if self.half_stars is not None else None


class ImportJob(db.Model):
    """Importação de histórico legado aguardando revisão/confirmação."""

    __tablename__ = "import_jobs"

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    filename = db.Column(db.String(255))
    payload = db.Column(db.Text, nullable=False)  # JSON
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
