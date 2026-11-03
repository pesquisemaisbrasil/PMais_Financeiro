FROM python:3.11-slim

WORKDIR /app

RUN groupadd --system --gid 1001 api \
  && useradd --system --uid 1001 --gid api --create-home api

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN chown -R api:api /app
USER api

EXPOSE 8000
# Atrás do proxy, FORWARDED_ALLOW_IPS recebe o IP dele; senão limite e logs veem o IP do proxy.
CMD ["sh", "-c", "alembic upgrade head && exec uvicorn main:app --host 0.0.0.0 --port 8000 --no-access-log --proxy-headers --forwarded-allow-ips=\"${FORWARDED_ALLOW_IPS:-127.0.0.1}\""]
