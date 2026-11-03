import json
import logging
import sys
from typing import Any

from core.net import mask_ip


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "time": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
        }
        for key in (
            "method",
            "path",
            "status_code",
            "duration_ms",
            "client_ip",
        ):
            if hasattr(record, key):
                payload[key] = getattr(record, key)
        if "client_ip" in payload:
            # defesa em profundidade: mesmo que quem logou passe o IP cru
            payload["client_ip"] = mask_ip(payload["client_ip"])
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def setup_logging() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(logging.INFO)

    # uvicorn tem os próprios loggers — redireciona pro mesmo formato JSON
    for logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uvicorn_logger = logging.getLogger(logger_name)
        uvicorn_logger.handlers = [handler]
        uvicorn_logger.propagate = False
    # Log de acesso do uvicorn traz IP completo e query string; a API tem o
    # próprio (`log_requests`). Fica desligado mesmo sem `--no-access-log`.
    logging.getLogger("uvicorn.access").disabled = True
