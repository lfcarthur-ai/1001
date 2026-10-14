import pytest

from app import create_app
from app.config import TestConfig
from app.models import Album, User, db

CATALOG = [
    ("The Beatles", "Abbey Road", 1969, "Rock"),
    ("Miles Davis", "Kind of Blue", 1959, "Jazz"),
    ("Radiohead", "OK Computer", 1997, "Rock"),
    ("Kendrick Lamar", "To Pimp a Butterfly", 2015, "Hip Hop"),
    ("Caetano Veloso", "Transa", 1972, "Pop"),
    ("Sgt. Test", "Sgt. Pepper's Lonely Hearts Club Band", 1967, "Rock"),
]


@pytest.fixture
def app():
    app = create_app(TestConfig)
    with app.app_context():
        for artist, title, year, genre in CATALOG:
            db.session.add(Album(artist=artist, title=title, year=year, genre=genre, duration="0:40:00"))
        db.session.commit()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture
def client(app):
    return app.test_client()


def register(client, name, email, password="senha-segura"):
    return client.post("/cadastro", data={"name": name, "email": email, "password": password,
                                          "password2": password})


def login(client, email, password="senha-segura"):
    return client.post("/entrar", data={"email": email, "password": password})


def logout(client):
    return client.post("/sair", follow_redirects=True)


@pytest.fixture
def users(client):
    register(client, "Admin", "admin@x.com")
    logout(client)
    register(client, "Bia", "bia@x.com")
    logout(client)
    register(client, "Caio", "caio@x.com")
    logout(client)
    return {u.email: u.id for u in User.query.all()}
