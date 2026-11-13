"""O backend da demonstração sobe do zero num processo novo (como no navegador) e atende a tela."""

import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]

SCRIPT = """
import asyncio, json, urllib.parse
import demo_runtime

FORM = [("content-type", "application/x-www-form-urlencoded")]


async def call(method, path, headers=(), body=b""):
    return await demo_runtime.handle(method, path, list(headers), body)


async def sign_in():
    creds = demo_runtime.credentials()
    form = urllib.parse.urlencode(
        {"username": creds["email"], "password": creds["password"]}
    ).encode()
    status, _, body = await call("POST", "/auth/token", FORM, form)
    assert status == 200, (status, body)
    mfa = json.loads(body)["mfa_token"]
    status, headers, body = await call(
        "POST",
        "/auth/token/mfa",
        [("authorization", f"Bearer {mfa}"), ("content-type", "application/json")],
        json.dumps({"code": demo_runtime.totp_code()}).encode(),
    )
    assert status == 200, (status, body)
    assert any(k.lower() == "set-cookie" and v.startswith("refresh_token=") for k, v in headers)
    return [("authorization", "Bearer " + json.loads(body)["access_token"])]


async def main():
    demo_runtime.start()
    auth = await sign_in()
    # sair e entrar de novo logo em seguida (mesma janela de 30 s do código) não pode dar "inválido"
    await sign_in()
    status, _, body = await call("GET", "/home", auth)
    assert status == 200, (status, body)
    status, _, body = await call("GET", "/payables?mode=tudo", auth)
    assert status == 200 and json.loads(body)["total"] >= 10
    status, _, body = await call("GET", "/payables/export?mode=tudo&format=xlsx", auth)
    assert status == 200 and body[:2] == b"PK"
    # restaurar: apaga e semeia de novo, e dá para entrar outra vez (o código do momento muda
    # a cada 30 s, mas o mesmo código não vale duas vezes: o banco novo não guarda o uso)
    demo_runtime.reset()
    await sign_in()
    print("OK")


asyncio.run(main())
"""


def test_demo_runtime_starts_from_scratch_logs_in_and_serves_screens() -> None:
    result = subprocess.run(
        [
            sys.executable,
            "-I",
            "-X",
            "utf8",
            "-c",
            f"import sys; sys.path.insert(0, {str(BACKEND)!r})" + "\n" + SCRIPT,
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=BACKEND,
        timeout=180,
    )

    assert result.returncode == 0, result.stderr[-2000:]
    assert result.stdout.strip().endswith("OK")
