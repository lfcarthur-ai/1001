import io
from datetime import date

from app import stats as st
from app.models import Album, Draw, Rating, User, db

from .conftest import login, logout


def _seed(users):
    albums = Album.query.order_by(Album.id).all()
    for i, a in enumerate(albums[:4]):
        db.session.add(Draw(album_id=a.id, draw_date=date(2024, 1, i + 1), source="importacao"))
    a, b, c = users["admin@x.com"], users["bia@x.com"], users["caio@x.com"]
    scores = {  # álbum -> {usuário: meias-estrelas}
        0: {a: 10, b: 2, c: 6},
        1: {a: 8, b: 8, c: 8},
        2: {a: 6, b: 7},
        3: {a: 4, b: 9, c: 5},
    }
    for idx, votes in scores.items():
        for uid, h in votes.items():
            db.session.add(Rating(user_id=uid, album_id=albums[idx].id, half_stars=h,
                                  should_be_in_list=(h >= 6)))
    db.session.commit()
    return albums


def test_group_stats(client, users):
    albums = _seed(users)
    s = st.group_stats()
    assert s["drawn"] == 4 and s["total"] == 6
    assert s["votes"] == 11
    assert sum(d["count"] for d in s["distribution"]) == 11
    assert s["top"][0]["album"].id == albums[1].id  # média 4,0
    assert s["controversial"][0]["album"].id == albums[0].id  # 5 / 1 / 3
    assert s["best_decade"] is not None  # fallback quando há poucos álbuns
    labels = {r["label"] for r in s["decada"]}
    assert "Anos 60" in labels and "Anos 2010" in labels


def test_individual_stats(client, users):
    albums = _seed(users)
    s = st.individual_stats(users["bia@x.com"])
    assert s["summary"]["rated"] == 4
    rock = next(r for r in s["genero"] if r["label"] == "Rock")
    assert rock["n"] == 2
    assert abs(rock["user_avg"] - (1 + 3.5) / 2) < 1e-9
    assert s["outliers"]["abaixo"][0]["album"].id == albums[0].id
    assert s["outliers"]["acima"][0]["album"].id == albums[3].id
    comp = {r["user"].email: r for r in s["comparacoes"]}
    assert comp["admin@x.com"]["n"] == 4 and comp["caio@x.com"]["n"] == 3
    assert 0 <= s["lista_usuario"]["pct"] <= 1


LEGACY = """Artist,Album,Released,Rating,Notes,Global Rating,Origin,Generated Date
The Beatles,Abbey Road,1969,5,Obra-prima,4.3,uk,2024-01-01
Miles Davis,Kind Of Blue,1959,4,,4.2,us,2024-01-02
Radiohed,O.K. Computer,1997,3,,4,uk,2024-01-03
Kendrick Lamar,To Pimp a Butterfly,2015,,,4.1,us,2024-01-04
"""


def _upload(client, text=LEGACY):
    return client.post("/dados/importar", data={"arquivo": (io.BytesIO(text.encode()), "legado.csv")},
                       content_type="multipart/form-data", follow_redirects=True)


def test_admin_import_creates_draws_with_review(client, users):
    login(client, "admin@x.com")
    r = _upload(client)
    html = r.get_data(as_text=True)
    assert "Revisar importação" in html and "Radiohed" in html
    from app.models import ImportJob
    import json

    rows = json.loads(ImportJob.query.one().payload)["rows"]
    status = {r["album"]: r["status"] for r in rows}
    assert status["Abbey Road"] == "exato" and status["Kind Of Blue"] == "exato"
    assert status["O.K. Computer"] == "revisar"
    review = next(r for r in rows if r["status"] == "revisar")
    assert 3 <= len(review["candidates"]) <= 5
    ok = Album.query.filter_by(title="OK Computer").one()
    assert review["candidates"][0]["id"] == ok.id
    r = client.post("/dados/importar/confirmar", data={f"linha-{review['line']}": str(ok.id)}, follow_redirects=True)
    assert "Importação concluída" in r.get_data(as_text=True)
    assert Draw.query.count() == 4
    d = Draw.query.filter_by(album_id=ok.id).one()
    assert d.draw_date == date(2024, 1, 3) and d.daily_date is None
    admin_ratings = Rating.query.filter_by(user_id=users["admin@x.com"]).all()
    assert len(admin_ratings) == 3  # Kendrick sem nota/nota -> só histórico
    abbey = next(x for x in admin_ratings if x.album.title == "Abbey Road")
    assert abbey.half_stars == 10 and abbey.comment == "Obra-prima" and abbey.should_be_in_list is None


def test_user_import_discards_not_drawn(client, users):
    album = Album.query.filter_by(title="Abbey Road").one()
    db.session.add(Draw(album_id=album.id, draw_date=date(2024, 1, 1), source="importacao"))
    db.session.commit()
    login(client, "bia@x.com")
    _upload(client)
    r = client.post("/dados/importar/confirmar", data={}, follow_redirects=True)
    html = r.get_data(as_text=True)
    assert "descartada" in html
    ratings = Rating.query.filter_by(user_id=users["bia@x.com"]).all()
    assert [x.album.title for x in ratings] == ["Abbey Road"]
    assert Draw.query.count() == 1  # usuário comum não altera o histórico de sorteios


def test_import_manual_choice_and_bad_header(client, users):
    login(client, "admin@x.com")
    r = _upload(client, "foo,bar\n1,2\n")
    assert "Cabeçalho não reconhecido" in r.get_data(as_text=True)
    _upload(client, "Artist,Album,Released,Rating,Notes,Global Rating,Origin,Generated Date\nXyz,Qwerty,1900,4,,,,2024-02-02\n")
    transa = Album.query.filter_by(title="Transa").one()
    from app.models import ImportJob
    import json

    line = json.loads(ImportJob.query.one().payload)["rows"][0]["line"]
    client.post("/dados/importar/confirmar", data={f"manual-{line}": transa.label})
    assert Draw.query.filter_by(album_id=transa.id).one().draw_date == date(2024, 2, 2)
