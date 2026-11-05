from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

AUTH_BODY_LIMIT = 16 * 1024
TOO_LARGE_DETAIL = "Pedido grande demais"


class AuthBodyLimit:
    """Recusa corpo grande em /auth antes de o Starlette montar o formulário em memória
    (PYSEC-2026-249). Conta os bytes que chegam, então vale também sem Content-Length.
    shortcut: só /auth; some quando o FastAPI subir para um Starlette com limite próprio."""

    def __init__(self, app: ASGIApp, limit: int = AUTH_BODY_LIMIT) -> None:
        self.app = app
        self.limit = limit

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not scope["path"].startswith("/auth/"):
            await self.app(scope, receive, send)
            return
        response = JSONResponse({"detail": TOO_LARGE_DETAIL}, status_code=413)
        declared = dict(scope["headers"]).get(b"content-length", b"0")
        if declared.isdigit() and int(declared) > self.limit:
            await response(scope, receive, send)
            return

        received = 0
        too_large = False

        async def limited() -> Message:
            nonlocal received, too_large
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self.limit:
                    too_large = True
                    return {"type": "http.request", "body": b"", "more_body": False}
            return message

        started = False

        async def guarded_send(message: Message) -> None:
            nonlocal started
            if too_large and not started:
                started = True
                await response(scope, receive, send)
            if not too_large:
                await send(message)

        await self.app(scope, limited, guarded_send)
