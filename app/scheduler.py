"""Tarefas agendadas: sorteio à meia-noite (Brasília) e enriquecimento periódico.

O sorteio é idempotente (data única no banco). Além do agendamento, a página
inicial também chama `ensure_daily_draw`, garantindo o álbum do dia mesmo que
o servidor estivesse parado à meia-noite.
"""

import logging
import os

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .utils import BRT

log = logging.getLogger(__name__)
_scheduler = None


def start_scheduler(app):
    global _scheduler
    # Evita agendador duplicado com o reloader do modo debug
    if _scheduler is not None or (app.debug and os.environ.get("WERKZEUG_RUN_MAIN") != "true"):
        return _scheduler

    def daily_draw():
        with app.app_context():
            from .draw import ensure_daily_draw

            ensure_daily_draw()

    def enrich():
        with app.app_context():
            from .enrich import enrich_pending

            enrich_pending(app.config["ENRICH_BATCH_SIZE"])

    _scheduler = BackgroundScheduler(timezone=BRT)
    _scheduler.add_job(daily_draw, CronTrigger(hour=0, minute=0, timezone=BRT), id="sorteio",
                       misfire_grace_time=6 * 3600, coalesce=True, max_instances=1)
    if app.config.get("ENRICH_ENABLED"):
        _scheduler.add_job(enrich, "interval", minutes=app.config["ENRICH_INTERVAL_MINUTES"],
                           id="enriquecimento", coalesce=True, max_instances=1)
    _scheduler.start()
    log.info("Agendador iniciado (sorteio diário às 00:00, horário de Brasília)")
    return _scheduler
