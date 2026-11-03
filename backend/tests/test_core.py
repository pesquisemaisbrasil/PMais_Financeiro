import os
import subprocess
import sys
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

import pytest
from fastapi import HTTPException

from core.permissions import require_admin, require_finance
from core.text import (
    format_brl,
    format_brl_plain,
    format_date_br,
    format_datetime_br,
    launch_date,
    normalize,
)
from db.connection import Base
from models.user import User

BACKEND_DIR = Path(__file__).resolve().parents[1]


def test_every_foreign_key_declares_ondelete() -> None:
    missing = [
        f"{table.name}.{fk.parent.name}"
        for table in Base.metadata.tables.values()
        for fk in table.foreign_keys
        if fk.ondelete is None
    ]
    assert missing == []


@pytest.mark.parametrize("path", ["/docs", "/redoc", "/openapi.json"])
def test_docs_are_off_in_production(path: str) -> None:
    # Processo próprio: o FastAPI decide as rotas de documentação ao importar o main.
    code = (
        "from fastapi.testclient import TestClient; from main import app; "
        f"assert TestClient(app).get({path!r}).status_code == 404; "
        "assert TestClient(app).get('/healthz').status_code == 200"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=BACKEND_DIR,
        env={**os.environ, "ENVIRONMENT": "production"},
        capture_output=True,
        text=True,
    )
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize(
    ("role", "admin_ok", "finance_ok"),
    [("admin", True, True), ("financeiro", False, True), ("user", False, False)],
)
def test_permissions_by_role(role: str, admin_ok: bool, finance_ok: bool) -> None:
    for check, allowed in ((require_admin, admin_ok), (require_finance, finance_ok)):
        if allowed:
            check(User(role=role))
        else:
            with pytest.raises(HTTPException) as denied:
                check(User(role=role))
            assert denied.value.status_code == 403


def test_money_format() -> None:
    assert format_brl(Decimal("1234.5")) == "R$ 1.234,50"
    assert format_brl(Decimal("-0.5")) == "-R$ 0,50"
    assert format_brl_plain(Decimal("1234.5")) == "1.234,50"


def test_dates_follow_sao_paulo_near_midnight_utc() -> None:
    instant = datetime(2026, 11, 3, 2, 30, tzinfo=UTC)
    assert launch_date(instant).isoformat() == "2026-11-02"
    assert launch_date(instant.replace(tzinfo=None)).isoformat() == "2026-11-02"
    assert format_datetime_br(instant) == "02/11/2026 23:30:00"
    assert format_date_br(instant) == "03/11/2026"


def test_normalize_ignores_accent_case_and_edges() -> None:
    assert normalize("  São PAULO ") == "sao paulo"
    assert normalize(None) == ""
