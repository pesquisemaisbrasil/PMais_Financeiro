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


async def sign_in(kind=None):
    creds = demo_runtime.credentials(kind)
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
        json.dumps({"code": demo_runtime.totp_code(kind)}).encode(),
    )
    assert status == 200, (status, body)
    assert any(k.lower() == "set-cookie" and v.startswith("refresh_token=") for k, v in headers)
    return [("authorization", "Bearer " + json.loads(body)["access_token"])]


async def who(auth):
    status, _, body = await call("GET", "/auth/me", auth)
    assert status == 200, (status, body)
    return json.loads(body)


async def main():
    demo_runtime.start()
    auth = await sign_in()
    # sair e entrar de novo logo em seguida (mesma janela de 30 s do código) não pode dar "inválido"
    await sign_in()
    # os dois acessos: o do financeiro (o de sempre) e o do desenvolvimento
    assert (await who(auth))["email"] == "demo@pesquisemais.invalid"
    dev = await who(await sign_in("dev"))
    assert (dev["email"], dev["name"]) == ("dev@pesquisemais.invalid", "Desenvolvimento"), dev
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


# ---- O banco volta como estava (guardado pelo navegador entre as visitas) ----

PRELUDE = SCRIPT[: SCRIPT.index("async def main():")]

FIRST_VISIT = (
    PRELUDE
    + """
import sys

async def main():
    demo_runtime.start()
    auth = await sign_in()
    status, _, body = await call(
        "POST",
        "/holidays",
        auth + [("content-type", "application/json")],
        json.dumps(
            {"date": "2031-05-05", "name": "Feriado guardado", "scope": "nacional"}
        ).encode(),
    )
    assert status == 201, (status, body)
    status, _, body = await call("GET", "/payables?mode=tudo", auth)
    total = json.loads(body)["total"]
    # uma cópia guardada antes de existir o acesso do desenvolvimento
    from db.connection import SessionLocal
    from models.user import User

    db = SessionLocal()
    db.query(User).filter_by(email="dev@pesquisemais.invalid").delete()
    db.commit()
    db.close()
    open(sys.argv[1], "wb").write(demo_runtime.snapshot())
    print(total)

asyncio.run(main())
"""
)

SECOND_VISIT = (
    PRELUDE
    + """
import sys

async def main():
    saved = open(sys.argv[1], "rb").read()
    demo_runtime.start(saved)
    auth = await sign_in()
    status, _, body = await call("GET", "/holidays", auth)
    assert any(h["name"] == "Feriado guardado" for h in json.loads(body)), body
    status, _, body = await call("GET", "/payables?mode=tudo", auth)
    # o seed não rodou de novo: nada duplicou
    assert json.loads(body)["total"] == int(sys.argv[2]), (json.loads(body)["total"], sys.argv[2])
    # a conta do desenvolvimento, que faltava na cópia, foi criada sem apagar o que foi feito
    await sign_in("dev")
    print("OK")

asyncio.run(main())
"""
)


def _run(script: str, *args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [
            sys.executable,
            "-I",
            "-X",
            "utf8",
            "-c",
            f"import sys; sys.path.insert(0, {str(BACKEND)!r})\n{script}",
            *args,
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        cwd=BACKEND,
        timeout=180,
    )


def test_the_database_comes_back_as_it_was_from_the_snapshot(tmp_path: Path) -> None:
    saved = tmp_path / "banco.db"

    first = _run(FIRST_VISIT, str(saved))
    assert first.returncode == 0, first.stderr[-2000:]
    total = first.stdout.strip().splitlines()[-1]

    second = _run(SECOND_VISIT, str(saved), total)

    assert second.returncode == 0, second.stderr[-2000:]
    assert second.stdout.strip().endswith("OK")


def test_a_corrupt_snapshot_starts_from_scratch_instead_of_breaking(tmp_path: Path) -> None:
    broken = tmp_path / "quebrado.db"
    broken.write_bytes(b"isto nao e um banco sqlite" * 100)

    script = (
        PRELUDE
        + """
import sys

async def main():
    demo_runtime.start(open(sys.argv[1], "rb").read())
    auth = await sign_in()
    status, _, body = await call("GET", "/payables?mode=tudo", auth)
    assert status == 200 and json.loads(body)["total"] >= 10
    print("OK")

asyncio.run(main())
"""
    )
    result = _run(script, str(broken))

    assert result.returncode == 0, result.stderr[-2000:]
    assert result.stdout.strip().endswith("OK")
