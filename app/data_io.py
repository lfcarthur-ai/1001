"""Página de importação/exportação."""

import csv
import io

from flask import Blueprint, Response, abort, flash, redirect, render_template, request, url_for
from flask_login import current_user

from . import stats as st
from .importer import ImportFormatError, apply_job, create_job, job_rows
from .models import Album, Draw, ImportJob, User, db
from .utils import fmt_date, fmt_delta, fmt_num, fmt_pct, fmt_stars, today_brt
from .views import history_rows

bp = Blueprint("data", __name__, url_prefix="/dados")


@bp.get("/")
def index():
    job = ImportJob.query.filter_by(user_id=current_user.id).first()
    return render_template("data/index.html", job=job, users=User.query.order_by(User.name).all())


@bp.post("/importar")
def upload():
    f = request.files.get("arquivo")
    if not f or not f.filename:
        flash("Selecione um arquivo CSV.", "error")
        return redirect(url_for("data.index"))
    try:
        create_job(current_user, f.filename, f.read())
    except ImportFormatError as exc:
        flash(str(exc), "error")
        return redirect(url_for("data.index"))
    return redirect(url_for("data.review"))


def _current_job():
    job = ImportJob.query.filter_by(user_id=current_user.id).first()
    if not job:
        flash("Nenhuma importação em andamento.", "info")
    return job


@bp.get("/importar/revisao")
def review():
    job = _current_job()
    if not job:
        return redirect(url_for("data.index"))
    data = job_rows(job)
    rows = data["rows"]
    groups = {
        "exato": [r for r in rows if r["status"] == "exato"],
        "revisar": [r for r in rows if r["status"] == "revisar"],
        "nao_sorteado": [r for r in rows if r["status"] == "nao_sorteado"],
    }
    catalog = Album.query.order_by(Album.artist, Album.title).all()
    drawn = {r[0] for r in db.session.query(Draw.album_id).all()}
    return render_template("data/review.html", job=job, data=data, groups=groups,
                           catalog=catalog, drawn=drawn)


@bp.post("/importar/confirmar")
def confirm():
    job = _current_job()
    if not job:
        return redirect(url_for("data.index"))
    labels = {a.label: a.id for a in Album.query.all()}
    decisions = {}
    for r in job_rows(job)["rows"]:
        if r["status"] != "revisar":
            continue
        manual = (request.form.get(f"manual-{r['line']}") or "").strip()
        choice = request.form.get(f"linha-{r['line']}", "ignorar")
        if manual:
            if manual not in labels:
                flash(f"Linha {r['line']}: álbum “{manual}” não encontrado no catálogo.", "error")
                return redirect(url_for("data.review"))
            decisions[r["line"]] = labels[manual]
        elif choice.isdigit():
            decisions[r["line"]] = int(choice)
    summary = apply_job(job, current_user, decisions, overwrite=request.form.get("sobrescrever") == "1")
    return render_template("data/done.html", s=summary)


@bp.post("/importar/cancelar")
def cancel():
    ImportJob.query.filter_by(user_id=current_user.id).delete()
    db.session.commit()
    flash("Importação cancelada.", "info")
    return redirect(url_for("data.index"))


# ------------------------------------------------------------------ exportação

def _csv_response(filename, header, rows):
    buf = io.StringIO()
    buf.write("﻿")  # BOM para o Excel reconhecer UTF-8
    w = csv.writer(buf, delimiter=";")
    w.writerow(header)
    w.writerows(rows)
    return Response(
        buf.getvalue(),
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _export_user():
    uid = request.args.get("usuario", type=int)
    if uid:
        return db.session.get(User, uid) or abort(404)
    return current_user


def _slug(user):
    return "".join(c if c.isalnum() else "-" for c in user.name.lower()).strip("-") or str(user.id)


def _yn(v):
    return "" if v is None else ("Sim" if v else "Não")


@bp.get("/exportar/historico.csv")
def export_history():
    user = _export_user()
    rows = []
    for r in history_rows(user):
        a, rating = r["album"], r["rating"]
        rows.append([
            r["order"], fmt_date(r["draw"].draw_date), a.artist, a.title, a.year or "", a.genre or "",
            a.country or "", fmt_stars(rating.half_stars) if rating else "",
            _yn(rating.should_be_in_list) if rating else "", (rating.comment or "") if rating else "",
            fmt_num(r["avg"]) if r["avg"] is not None else "", r["votes"], a.wikipedia_url or "",
            a.rym_link,
        ])
    header = ["Nº", "Data do sorteio", "Artista", "Álbum", "Ano", "Gênero", "País", "Nota",
              "Deveria estar na lista?", "Comentário", "Média global", "Votos", "Wikipedia",
              "RateYourMusic"]
    return _csv_response(f"historico-{_slug(user)}-{today_brt()}.csv", header, rows)


@bp.get("/exportar/estatisticas.csv")
def export_individual():
    user = _export_user()
    s = st.individual_stats(user.id)
    rows = []
    for dim, title in (("decada", "Década"), ("genero", "Gênero"), ("pais", "País de origem"),
                       ("ano", "Ano de lançamento")):
        for r in s[dim]:
            rows.append([title, r["label"], r["n"], fmt_num(r["user_avg"]), fmt_num(r["group_avg"]),
                         fmt_delta(r["delta"]), "", ""])
    for kind, title in (("acima", "Outlier (acima do grupo)"), ("abaixo", "Outlier (abaixo do grupo)")):
        for r in s["outliers"][kind]:
            rows.append([title, r["album"].label, r["others_n"], fmt_num(r["user"], 1),
                         fmt_num(r["others_avg"]), fmt_delta(r["delta"]), "", ""])
    rows.append(["Deveria estar na lista", "Usuário", s["lista_usuario"]["n"],
                 fmt_pct(s["lista_usuario"]["pct"]), "", "", "", ""])
    rows.append(["Deveria estar na lista", "Global", s["lista_global"]["n"],
                 fmt_pct(s["lista_global"]["pct"]), "", "", "", ""])
    for r in s["comparacoes"]:
        if not r["n"]:
            rows.append(["Comparação", r["user"].name, 0, "", "", "", "", ""])
            continue
        rows.append(["Comparação", r["user"].name, r["n"], fmt_num(r["my_avg"]), fmt_num(r["their_avg"]),
                     fmt_delta(r["delta"]), fmt_pct(r["agreement"]),
                     fmt_num(r["corr"]) if r["corr"] is not None else ""])
    header = ["Seção", "Categoria", "Nº de álbuns", "Média individual", "Média de todos", "Delta",
              "Concordância", "Correlação"]
    return _csv_response(f"estatisticas-{_slug(user)}-{today_brt()}.csv", header, rows)


@bp.get("/exportar/grupo.csv")
def export_group():
    s = st.group_stats()
    rows = [["Progresso", "Álbuns sorteados", s["drawn"], "", f"{s['total']} no total", ""]]
    for d in s["distribution"]:
        rows.append(["Distribuição de notas", fmt_num(d["stars"], 1), d["count"], "", fmt_pct(d["pct"]), ""])
    for key, title in (("best_decade", "Melhor década"), ("worst_decade", "Pior década"),
                       ("best_genre", "Melhor gênero"), ("worst_genre", "Pior gênero")):
        r = s[key]
        if r:
            rows.append([title, r["label"], r["n"], r["votes"], fmt_num(r["avg"]), ""])
    for dim, title in (("decada", "Por década"), ("genero", "Por gênero"), ("pais", "Por país")):
        for r in s[dim]:
            rows.append([title, r["label"], r["n"], r["votes"], fmt_num(r["avg"]), ""])
    for key, title in (("top", "Melhores"), ("bottom", "Piores"), ("controversial", "Mais controversos")):
        for r in s[key]:
            rows.append([title, r["album"].label, 1, r["votes"], fmt_num(r["avg"]),
                         fmt_num(r["std"]) if r["std"] is not None else ""])
    for r in s["albums"]:
        rows.append(["Álbuns sorteados", r["album"].label, 1, r["votes"],
                     fmt_num(r["avg"]) if r["avg"] is not None else "",
                     fmt_num(r["std"]) if r["std"] is not None else ""])
    header = ["Seção", "Categoria / Álbum", "Nº de álbuns", "Votos", "Média", "Desvio padrão"]
    return _csv_response(f"estatisticas-grupo-{today_brt()}.csv", header, rows)
