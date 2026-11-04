import logging
import time
from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from api.auth import RATE_LIMITED_DETAIL
from api.auth import router as auth_router
from api.health import router as health_router
from api.payables import router as payables_router
from core.config import CORS_ORIGINS, ENVIRONMENT
from core.limiter import limiter
from core.logging_config import setup_logging
from core.net import mask_ip

setup_logging()
access_logger = logging.getLogger("app.access")

is_production = ENVIRONMENT == "production"
app = FastAPI(
    docs_url=None if is_production else "/docs",
    redoc_url=None if is_production else "/redoc",
    openapi_url=None if is_production else "/openapi.json",
)


def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> Response:
    original = _rate_limit_exceeded_handler(request, exc)
    # mesma resposta do slowapi (cabeçalhos de espera), com a mensagem em pt-BR
    headers = {
        key: value
        for key, value in original.headers.items()
        if key.lower() == "retry-after" or key.lower().startswith("x-ratelimit")
    }
    return JSONResponse(status_code=429, content={"detail": RATE_LIMITED_DETAIL}, headers=headers)


app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)  # type: ignore[arg-type]
app.add_middleware(SlowAPIMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _route_template(request: Request) -> str:
    """Caminho da rota com os parâmetros como `{nome}`: o caminho cru pode trazer
    dado pessoal, e 404 não tem rota."""
    route = request.scope.get("route")
    return getattr(route, "path", None) or "<sem rota>"


@app.middleware("http")
async def log_requests(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    start = time.monotonic()
    client_ip = mask_ip(request.client.host if request.client else None)
    try:
        response = await call_next(request)
    except Exception:
        access_logger.exception(
            "request",
            extra={
                "method": request.method,
                "path": _route_template(request),
                "status_code": 500,
                "duration_ms": round((time.monotonic() - start) * 1000, 2),
                "client_ip": client_ip,
            },
        )
        raise
    access_logger.info(
        "request",
        extra={
            "method": request.method,
            "path": _route_template(request),
            "status_code": response.status_code,
            "duration_ms": round((time.monotonic() - start) * 1000, 2),
            "client_ip": client_ip,
        },
    )
    return response


@app.middleware("http")
async def security_headers(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers.setdefault("Cache-Control", "no-store")
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


app.include_router(health_router)
app.include_router(auth_router)
app.include_router(payables_router)
