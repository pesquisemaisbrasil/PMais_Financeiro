import base64
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

# AES-256-GCM (core/crypto.py). Gerar com:
#   python -c "import base64, os; print(base64.b64encode(os.urandom(32)).decode())"
ENCRYPTION_KEY = os.environ["ENCRYPTION_KEY"]
if len(base64.b64decode(ENCRYPTION_KEY)) != 32:
    raise ValueError("ENCRYPTION_KEY precisa decodificar para 32 bytes (AES-256)")

# HMAC da chave Pix (core/pix.py: hash_pix). Permanente: trocar invalida os hashes já gravados.
PIX_SECRET_KEY = os.environ["PIX_SECRET_KEY"]
if len(PIX_SECRET_KEY) < 32:
    raise ValueError("PIX_SECRET_KEY precisa ter pelo menos 32 caracteres")

DATABASE_URL = os.environ["DATABASE_URL"]
# Role dona das tabelas, usada só pelo alembic/env.py.
MIGRATION_DATABASE_URL = os.getenv("MIGRATION_DATABASE_URL") or DATABASE_URL

# "production" desliga /docs e /openapi.json.
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
# "simulated" liga o Connect de mentira (services/connect_gateway.py), só fora de produção.
CONNECT_MODE = os.getenv("CONNECT_MODE", "off")
# A cada quantos segundos a API reenvia ao Connect as baixas que ficaram esperando. 0 = desligado.
PAYMENT_DISPATCH_SECONDS = int(os.getenv("PAYMENT_DISPATCH_SECONDS", "0"))
# API de integração do P+ Connect. Sem a URL, o Connect fica "fora do ar" para o Financeiro.
CONNECT_BASE_URL = os.getenv("CONNECT_BASE_URL", "")
CONNECT_CLIENT_ID = os.getenv("CONNECT_CLIENT_ID", "")
CONNECT_CLIENT_SECRET = os.getenv("CONNECT_CLIENT_SECRET", "")

# Consulta de CNPJ para preencher o cadastro (services/cnpj_lookup.py): "brasilapi" (padrão, dados
# públicos da Receita, sem chave), "simulated" (dados de mentira, só fora de produção) ou outro
# valor para desligar.
CNPJ_LOOKUP_MODE = os.getenv("CNPJ_LOOKUP_MODE", "brasilapi")

# Cofre de arquivos dos anexos (core/file_vault.py): um bucket S3, no MinIO. Sem a configuração,
# anexar fica indisponível. "memory" é um cofre de mentira, só fora de produção (testes de tela).
FILES_MODE = os.getenv("FILES_MODE", "off")
FILES_ENDPOINT_URL = os.getenv("FILES_ENDPOINT_URL", "")
FILES_BUCKET = os.getenv("FILES_BUCKET", "financeiro-arquivos")
FILES_ACCESS_KEY = os.getenv("FILES_ACCESS_KEY", "")
FILES_SECRET_KEY = os.getenv("FILES_SECRET_KEY", "")
# Chave que embrulha a chave de cada arquivo (32 bytes em base64, diferente da ENCRYPTION_KEY).
# Permanente: sem ela, os arquivos já guardados não abrem. Guardar com backup próprio.
FILES_MASTER_KEY = os.getenv("FILES_MASTER_KEY", "")
if FILES_MASTER_KEY and len(base64.b64decode(FILES_MASTER_KEY)) != 32:
    raise ValueError("FILES_MASTER_KEY precisa decodificar para 32 bytes (AES-256)")
if (
    ENVIRONMENT == "production"
    and FILES_ENDPOINT_URL
    and not FILES_ENDPOINT_URL.startswith("https://")
):
    raise ValueError("Em produção, FILES_ENDPOINT_URL precisa ser https")

# Limite de requisições (slowapi, core/limiter.py). Ligado sempre em produção;
# só os testes de tela (e2e) desligam, porque fazem vários logins por minuto.
RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"

# Ligado por padrão para um ambiente mal configurado não mandar o cookie sem HTTPS;
# só o .env local, em http://localhost, desliga.
REFRESH_COOKIE_SECURE = os.getenv("REFRESH_COOKIE_SECURE", "true").lower() == "true"

# Login por Google e Microsoft. Vazio = botão avisa que ainda não está disponível.
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
MICROSOFT_CLIENT_ID = os.getenv("MICROSOFT_CLIENT_ID", "")
MICROSOFT_CLIENT_SECRET = os.getenv("MICROSOFT_CLIENT_SECRET", "")
MICROSOFT_TENANT_ID = os.getenv("MICROSOFT_TENANT_ID", "")
# Endereços que o navegador alcança: a volta do provedor e o destino depois do login.
API_PUBLIC_URL = os.getenv("API_PUBLIC_URL", "http://localhost:8010")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3010")

CORS_ORIGINS = [
    origin.strip() for origin in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
]
