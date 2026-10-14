"""Sorteio diário do álbum do dia."""

import logging
import secrets

from sqlalchemy.exc import IntegrityError

from .models import Album, Draw, db
from .utils import today_brt

log = logging.getLogger(__name__)


def get_daily_draw(day=None):
    day = day or today_brt()
    return Draw.query.filter_by(daily_date=day).first()


def available_albums():
    """Álbuns que ainda não constam no histórico do administrador."""
    drawn = db.session.query(Draw.album_id)
    return Album.query.filter(~Album.id.in_(drawn))


def ensure_daily_draw(day=None):
    """Garante que exista exatamente um álbum do dia para `day` (horário de Brasília).

    Idempotente e seguro contra concorrência: a coluna `daily_date` é única,
    então execuções simultâneas (vários processos/agendador + requisição)
    resultam em um único sorteio.
    """
    day = day or today_brt()
    existing = get_daily_draw(day)
    if existing:
        return existing

    # Se o histórico importado do administrador já tem um álbum sorteado
    # nesta data, ele passa a ser o álbum do dia.
    same_day = Draw.query.filter_by(draw_date=day, daily_date=None).order_by(Draw.id.desc()).first()
    if same_day:
        same_day.daily_date = day
        try:
            db.session.commit()
            return same_day
        except IntegrityError:
            db.session.rollback()
            return get_daily_draw(day)

    candidates = [a.id for a in available_albums().with_entities(Album.id).all()]
    if not candidates:
        log.info("Todos os álbuns já foram sorteados.")
        return None
    album_id = secrets.choice(candidates)
    draw = Draw(album_id=album_id, draw_date=day, daily_date=day, source="sorteio")
    db.session.add(draw)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return get_daily_draw(day)
    log.info("Álbum do dia %s sorteado: %s", day, album_id)

    from flask import current_app

    if current_app.config.get("ENRICH_ENABLED"):
        from .enrich import enrich_in_background

        enrich_in_background(current_app._get_current_object(), album_id)
    return draw


def drawn_album_ids():
    return {row[0] for row in db.session.query(Draw.album_id).all()}


def history_draws():
    """Sorteios em ordem de audição (data de sorteio, depois inserção)."""
    return Draw.query.order_by(Draw.draw_date.asc(), Draw.id.asc()).all()
