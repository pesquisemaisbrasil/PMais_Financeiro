import os

from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.environ["SECRET_KEY"]
# O .env.example é público: a API não sobe com o valor de exemplo nem com chave curta.
if len(SECRET_KEY) < 32:
    raise ValueError("SECRET_KEY precisa ter pelo menos 32 caracteres")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
# Validados em todo token de usuário (handoff/06 §1).
JWT_ISSUER = "pmais-financeiro"
JWT_AUDIENCE = "pmais-financeiro-web"

DATABASE_URL = os.environ["DATABASE_URL"]
# Role dona das tabelas, usada só pelo alembic/env.py.
MIGRATION_DATABASE_URL = os.getenv("MIGRATION_DATABASE_URL") or DATABASE_URL

# "production" desliga /docs e /openapi.json.
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

# Limite de requisições (slowapi, core/limiter.py). Ligado sempre em produção;
# só os testes de tela (e2e) desligam, porque fazem vários logins por minuto.
RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"

# Ligado por padrão para um ambiente mal configurado não mandar o cookie sem HTTPS;
# só o .env local, em http://localhost, desliga.
REFRESH_COOKIE_SECURE = os.getenv("REFRESH_COOKIE_SECURE", "true").lower() == "true"

CORS_ORIGINS = [
    origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
]
