from datetime import date, timedelta

from app.catalog import load_catalog, parse_catalog
from app.draw import ensure_daily_draw
from app.models import Album, Draw, Rating, User, db
from app.utils import normalize, parse_rating

from .conftest import login, logout, register


def test_normalize():
    assert normalize("The Beatles") == "beatles"
    assert normalize("Sgt. Pepper’s Lonely Hearts Club Band") == normalize("Sgt Peppers Lonely Hearts Club Band")
    assert normalize("Simon & Garfunkel") == normalize("Simon and Garfunkel")
    assert normalize("Ágüas de Março") == "aguas de marco"


def test_parse_rating():
    assert parse_rating("4") == 8
    assert parse_rating("3,5") == 7
    assert parse_rating("0.5") == 1
    assert parse_rating("") is None
    assert parse_rating("0") is None


def test_parse_catalog_english_and_portuguese_headers():
    en = "Artist,Title,Release Date,Run Time,Genre\n808 State,90,1989,0:39:14,Electronic\nX,Y,2000,1:00:00,hip Hop\nZ,W,2001,1:00:00,Hip Hop\n"
    rows = parse_catalog(en)
    assert rows[0] == {"artist": "808 State", "title": "90", "year": 1989, "duration": "0:39:14", "genre": "Electronic"}
    assert rows[1]["genre"] == rows[2]["genre"] == "Hip Hop"
    pt = "Artista;Nome do Álbum;Ano de Lançamento;Duração;Gênero\nCaetano;Transa;1972;0:38:00;MPB\n"
    assert parse_catalog(pt)[0]["title"] == "Transa"


def test_real_catalog_file_loads(app):
    import os

    path = os.path.join(os.path.dirname(__file__), "..", "data", "albums.csv")
    Album.query.delete()
    db.session.commit()
    assert load_catalog(path) == 1089
    assert load_catalog(path) == 0  # idempotente


def test_first_user_is_admin(client, users):
    assert User.query.filter_by(email="admin@x.com").one().is_admin
    assert not User.query.filter_by(email="bia@x.com").one().is_admin


def test_pages_require_login(client):
    for url in ["/", "/historico", "/estatisticas", "/grupo", "/dados/", "/perfil", "/admin/"]:
        r = client.get(url)
        assert r.status_code == 302 and "/entrar" in r.headers["Location"], url


def test_daily_draw_unique_and_excludes_drawn(app):
    today = date(2026, 10, 14)
    d1 = ensure_daily_draw(today)
    d2 = ensure_daily_draw(today)
    assert d1.id == d2.id
    assert Draw.query.count() == 1
    ids = {d1.album_id}
    for i in range(1, 6):
        ids.add(ensure_daily_draw(today + timedelta(days=i)).album_id)
    assert len(ids) == 6  # nunca repete
    assert ensure_daily_draw(today + timedelta(days=7)) is None  # catálogo esgotado


def test_imported_draw_same_day_becomes_daily(app):
    today = date(2026, 10, 14)
    album = Album.query.first()
    db.session.add(Draw(album_id=album.id, draw_date=today, source="importacao"))
    db.session.commit()
    d = ensure_daily_draw(today)
    assert d.album_id == album.id and d.daily_date == today
    assert Draw.query.count() == 1


def test_rating_flow_and_restrictions(client, users):
    login(client, "bia@x.com")
    r = client.get("/")
    assert r.status_code == 200 and "Sua avaliação" in r.get_data(as_text=True)
    draw = Draw.query.one()
    r = client.post(f"/album/{draw.album_id}/avaliar",
                    data={"half_stars": "7", "should_be_in_list": "1", "comment": "Ótimo"},
                    follow_redirects=True)
    assert "Avaliação salva" in r.get_data(as_text=True)
    rating = Rating.query.one()
    assert rating.half_stars == 7 and rating.should_be_in_list and rating.comment == "Ótimo"
    # editar
    client.post(f"/album/{draw.album_id}/avaliar", data={"half_stars": "10"})
    assert Rating.query.one().half_stars == 10 and Rating.query.one().should_be_in_list is False
    # nota inválida
    client.post(f"/album/{draw.album_id}/avaliar", data={"half_stars": "11"})
    assert Rating.query.one().half_stars == 10
    # álbum não sorteado não pode ser avaliado
    other = Album.query.filter(Album.id != draw.album_id).first()
    assert client.post(f"/album/{other.id}/avaliar", data={"half_stars": "5"}).status_code == 403
    assert client.get(f"/album/{other.id}").status_code == 404


def test_admin_permissions(client, users):
    login(client, "bia@x.com")
    assert client.get("/admin/").status_code == 403
    assert client.post(f"/admin/usuarios/{users['caio@x.com']}", data={"name": "X", "email": "caio@x.com"}).status_code == 403
    logout(client)
    login(client, "admin@x.com")
    r = client.post(f"/admin/usuarios/{users['caio@x.com']}",
                    data={"name": "Caio Novo", "email": "caio@x.com", "active": "1", "is_admin": "1"},
                    follow_redirects=True)
    assert r.status_code == 200
    caio = db.session.get(User, users["caio@x.com"])
    assert caio.name == "Caio Novo" and caio.is_admin
    # não pode remover o último admin ativo de si mesmo quando é o único
    client.post(f"/admin/usuarios/{users['caio@x.com']}", data={"name": "Caio", "email": "caio@x.com", "active": "1"})
    r = client.post(f"/admin/usuarios/{users['admin@x.com']}", data={"name": "Admin", "email": "admin@x.com", "active": "1"},
                    follow_redirects=True)
    assert "pelo menos um administrador" in r.get_data(as_text=True)


def test_profile_requires_current_password_for_email(client, users):
    login(client, "bia@x.com")
    client.post("/perfil", data={"name": "Bia", "email": "nova@x.com"})
    assert User.query.filter_by(email="nova@x.com").first() is None
    client.post("/perfil", data={"name": "Bia B", "email": "nova@x.com", "current_password": "senha-segura"})
    assert User.query.filter_by(email="nova@x.com").one().name == "Bia B"


def test_pages_render_with_data(client, users):
    login(client, "admin@x.com")
    client.get("/")
    aid = Draw.query.one().album_id
    client.post(f"/album/{aid}/avaliar", data={"half_stars": "8"})
    logout(client)
    login(client, "bia@x.com")
    client.post(f"/album/{aid}/avaliar", data={"half_stars": "3", "should_be_in_list": "1"})
    for url in ["/", f"/album/{aid}", "/historico", "/historico?genero=Rock&decada=1960&nota=3",
                f"/historico?usuario={users['admin@x.com']}", "/estatisticas",
                f"/estatisticas?usuario={users['admin@x.com']}", "/grupo", "/grupo/ranking/melhores",
                "/grupo/ranking/controversos", "/dados/", "/perfil",
                "/dados/exportar/historico.csv", "/dados/exportar/estatisticas.csv", "/dados/exportar/grupo.csv"]:
        r = client.get(url)
        assert r.status_code == 200, url
    csv = client.get("/dados/exportar/historico.csv").get_data(as_text=True)
    assert "Data do sorteio" in csv and "1,5" in csv
