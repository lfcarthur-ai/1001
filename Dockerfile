FROM python:3.13-slim
WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
# Um único processo (com threads) para que o agendador rode uma só vez.
# Mesmo com vários processos o sorteio continua único (restrição no banco).
CMD ["gunicorn", "-w", "1", "--threads", "8", "-b", "0.0.0.0:8000", "wsgi:app"]
