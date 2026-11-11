from slowapi import Limiter
from slowapi.util import get_remote_address

from core.config import RATE_LIMIT_ENABLED

# shortcut: contadores em memória zeram no restart e não valem entre réplicas;
# trocar por Redis quando a API tiver mais de uma instância (handoff/06 §1).
limiter = Limiter(key_func=get_remote_address, enabled=RATE_LIMIT_ENABLED)
