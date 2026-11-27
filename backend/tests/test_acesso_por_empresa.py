# ruff: noqa: F811  (as fixtures importadas de outros testes são reusadas pelo nome)
"""Acesso por empresa (Bruno, 27/11/2026, ADR 0029): o admin escolhe quais empresas cada conta vê,
e o servidor esconde o resto.

A empresa "Oculta" tem de tudo (contas, títulos, baixas, anexos, extrato, fechamento, projeto), com
marcas que não existem na outra. A pessoa restrita passa por **todas** as rotas de leitura do
sistema, e nenhuma marca pode aparecer; a rota nova com um número no endereço que o teste não
conheça faz o teste falhar, para entrar aqui."""

import io
import re
import zipfile
from collections.abc import Callable
from datetime import date
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core import company_scope
from core.file_vault import MemoryFileStore
from main import app
from models.bank_statement import BankTransaction
from models.notification import Notification
from models.payable import Payable, PayableAttachment, PayableItem, PayablePayment
from models.receivable import Receivable, ReceivablePayment
from models.reference import BankAccount, BusinessUnit, Company, Customer, ExpenseCategory, Project
from models.user import User
from services.auth import create_access_token
from services.notifications import notify_finance
from services.payable import today
from tests.test_bank_statements import ofx, send
from tests.test_payables import PDF, body, create, payment, vault, world  # noqa: F401

MARKS = ("OCULT", "9137.00", "9137,00", "9137.55", "9137,55", "<v>9137<")


def _headers(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


def _found(content: bytes) -> list[str]:
    """As marcas da empresa oculta na resposta; no .xlsx, dentro de cada parte do arquivo."""
    parts = [content]
    if content[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(content)) as sheet:
            parts = [sheet.read(name) for name in sheet.namelist()]
    texts = [part.decode("utf-8", errors="ignore").upper() for part in parts]
    return sorted({mark for mark in MARKS for text in texts if mark.upper() in text})


@pytest.fixture
def admin(make_user: Callable[..., User]) -> dict[str, str]:
    return _headers(make_user(email="admin@pesquisemais.com.br", role="superadmin"))


@pytest.fixture
def hidden(
    client: TestClient,
    admin: dict[str, str],
    world: dict[str, Any],
    vault: MemoryFileStore,
    db_session: Session,
) -> dict[str, Any]:
    """A empresa oculta, com uma de cada coisa, feita pela API de quem vê tudo."""
    company = Company(name="Oculta Ltda", nickname="OCULTA SA")
    db_session.add(company)
    db_session.flush()
    unit = BusinessUnit(company_id=company.id, name="Unidade OCULTA")
    account = BankAccount(company_id=company.id, name="Conta OCULTA", bankName="Banco OCULTO")
    project = Project(code="OC9137", title="Projeto OCULTO", company_id=company.id)
    customer = Customer(nickname="Cliente Comum", name="Cliente Comum Ltda")
    revenue = ExpenseCategory(code="1.01", name="Receita de pesquisa", kind="receita")
    db_session.add_all([unit, account, project, customer, revenue])
    db_session.commit()
    day = today().isoformat()
    payable = create(
        client,
        admin,
        world,
        description="Despesa OCULTA",
        companyId=company.id,
        unitId=unit.id,
        amount="9137.00",
        allocations=[{"projectId": project.id, "amount": "9137.00"}],
    )
    db_session.add(
        PayableItem(
            payable_id=payable["id"],
            name="Pessoa OCULTA",
            documentType="NF",
            amount=Decimal("9137.00"),
            invoiceStatus="Pendente",
        )
    )
    db_session.commit()
    paid = client.post(
        f"/payables/{payable['id']}/payments",
        json=payment(
            world, amount="1000.00", bankAccountId=account.id, transactionId="E-OCULTO-0001"
        ),
        headers=admin,
    )
    assert paid.status_code == 200, paid.text
    attached = client.post(
        f"/payables/{payable['id']}/attachments",
        files={"file": ("OCULTO.pdf", PDF)},
        headers=admin,
    )
    assert attached.status_code == 201, attached.text
    receivable = client.post(
        "/receivables",
        json={
            "issueDate": day,
            "dueDate": day,
            "amount": "9137.55",
            "customerId": customer.id,
            "categoryId": revenue.id,
            "companyId": company.id,
            "unitId": unit.id,
            "costCenterId": world["cost_center"].id,
            "description": "Receita OCULTA",
            "projectId": project.id,
        },
        headers=admin,
    )
    assert receivable.status_code == 201, receivable.text
    received = client.post(
        f"/receivables/{receivable.json()['id']}/receipts",
        json={
            "receivedOn": day,
            "amount": "10.00",
            "bankAccountId": account.id,
            "paymentMethodId": world["method"].id,
        },
        headers=admin,
    )
    assert received.status_code in (200, 201), received.text
    statement = send(
        client, admin, account.id, ofx((today().strftime("%Y%m%d"), "-9137.55", "OC1", "OCULTO"))
    )
    assert statement.status_code == 201, statement.text
    line = db_session.query(BankTransaction).filter_by(bank_account_id=account.id).one()
    detail = client.get(f"/payables/{payable['id']}", headers=admin).json()
    return {
        "company_id": company.id,
        "unit_id": unit.id,
        "account_id": account.id,
        "project_id": project.id,
        "payable_id": payable["id"],
        "payment_id": detail["payments"][0]["id"],
        "item_id": detail["items"][0]["id"],
        "attachment_id": detail["attachments"][0]["id"],
        "receivable_id": receivable.json()["id"],
        "transaction_id": line.id,
        "customer_id": customer.id,
        "revenue_id": revenue.id,
    }


@pytest.fixture
def restricted(
    make_user: Callable[..., User], world: dict[str, Any], db_session: Session
) -> tuple[User, dict[str, str]]:
    """Vê só a PPlus (a do `world`)."""
    user = make_user(email="restrita@pesquisemais.com.br", role="admin")
    user.companyAccessText = str(world["company"].id)
    db_session.commit()
    return user, _headers(user)


def _routes(method: str) -> list[str]:
    # pelo esquema da API: o app.routes não lista as rotas dos routers incluídos
    paths = app.openapi()["paths"]
    return [path for path, methods in paths.items() if method in methods]


def _sweep(client: TestClient, headers: dict[str, str], ids: dict[str, Any]) -> dict[str, Any]:
    """Todas as rotas de leitura, apontando para o que é da empresa oculta. {rota: marcas}."""
    day = today()
    values: dict[str, list[Any]] = {
        "payable_id": [ids["payable_id"]],
        "receivable_id": [ids["receivable_id"]],
        "attachment_id": [ids["attachment_id"], 1],
        "record_id": [ids["customer_id"]],
        "kind": [
            "companies",
            "units",
            "bankAccounts",
            "customers",
            "suppliers",
            "categories",
            "categoryGroups",
            "costCenters",
            "paymentMethods",
        ],
        "account_id": [ids["account_id"]],
        "transaction_id": [ids["transaction_id"]],
        "company_id": [ids["company_id"]],
        "month": [day.strftime("%Y-%m")],
        "project_id": [1],
        "batch_id": [1],
        "code": ["OC9137"],
        "provider_name": ["google"],
        "cnpj": ["11222333000181"],
        "demand_id": [1],
    }
    common = {
        "mode": "tudo",
        "ref": day.isoformat(),
        "start": f"{day.year}-01-01",
        "end": f"{day.year}-12-31",
        "month": day.strftime("%Y-%m"),
        "year": str(day.year),
        "date": day.isoformat(),
        "q": "despesa",
        "term": "despesa",
        "codigo": "OC9137",
    }
    pointing = {
        "account": str(ids["account_id"]),
        "bankAccountId": str(ids["account_id"]),
        "company": str(ids["company_id"]),
        "companyId": str(ids["company_id"]),
        "project": str(ids["project_id"]),
        "unit": str(ids["unit_id"]),
    }
    seen: dict[str, Any] = {}
    routes = _routes("get")
    assert len(routes) > 40, routes
    for route in routes:
        paths = [route]
        for name in re.findall(r"{(\w+)}", route):
            assert name in values, f"{route}: diga em `values` o que vai em {name}"
            paths = [p.replace("{" + name + "}", str(v)) for p in paths for v in values[name]]
        for path in paths:
            for query in (common, {**common, **pointing}, {**common, "q": "pessoa"}):
                response = client.get(path, params=query, headers=headers, follow_redirects=False)
                assert response.status_code < 500 or response.status_code == 503, (
                    f"{path} {query}: {response.status_code} {response.text[:300]}"
                )
                marks = _found(response.content)
                if marks:
                    seen[route] = sorted({*seen.get(route, []), *marks})
    return seen


def test_no_read_route_shows_another_company_to_a_restricted_person(
    client: TestClient,
    admin: dict[str, str],
    restricted: tuple[User, dict[str, str]],
    hidden: dict[str, Any],
) -> None:
    # primeiro quem vê tudo: prova que as marcas aparecem de verdade (e deixa o cache quente)
    visible = _sweep(client, admin, hidden)
    for path in (
        "/payables",
        "/payables/{payable_id}",
        "/payables/export",
        "/receivables",
        "/receivables/export",
        "/search",
        "/reference",
        "/records/{kind}",
        "/bank-accounts/{account_id}/transactions",
        "/reports/dre/export",
        "/home",
    ):
        assert any(seen == path for seen in visible), f"{path} deveria mostrar a oculta: {visible}"
    assert _sweep(client, restricted[1], hidden) == {}
    # e quem vê tudo continua vendo depois (o filtro de uma pessoa não vale para a outra)
    assert "/payables/{payable_id}" in _sweep(client, admin, hidden)


def _state(db: Session) -> tuple[Any, ...]:
    company_scope.apply(db, None)
    db.expire_all()
    return (
        db.query(Payable).count(),
        db.query(PayablePayment).count(),
        db.query(PayableAttachment).count(),
        db.query(Receivable).count(),
        db.query(ReceivablePayment).count(),
        sorted((p.id, p.description, p.canceledAt is None) for p in db.query(Payable)),
        sorted((c.id, c.name) for c in db.query(Company)),
    )


def test_a_restricted_person_cannot_change_anything_of_another_company(
    client: TestClient,
    restricted: tuple[User, dict[str, str]],
    hidden: dict[str, Any],
    world: dict[str, Any],
    db_session: Session,
) -> None:
    headers = restricted[1]
    before = _state(db_session)
    day = today().isoformat()
    note = {"reason": "tentativa"}
    p, r = hidden["payable_id"], hidden["receivable_id"]
    attempts: list[tuple[str, str, dict[str, Any]]] = [
        ("post", f"/payables/{p}/payments", {"json": payment(world, amount="1.00")}),
        ("post", f"/payables/{p}/payments/reverse", {"json": {**note, "paymentIds": [1]}}),
        (
            "post",
            f"/payables/{p}/payments/{hidden['payment_id']}/reverse",
            {"json": {**note, "kind": "estorno"}},
        ),
        ("post", f"/payables/{p}/cancel", {"json": note}),
        (
            "patch",
            f"/payables/{p}",
            {"json": {"description": "x", "amount": "1.00", "dueDate": day}},
        ),
        ("post", f"/payables/{p}/attachments", {"files": {"file": ("x.pdf", PDF)}}),
        ("post", f"/payables/{p}/receipts/preview", {"files": [("files", ("x.pdf", PDF))]}),
        (
            "post",
            "/payables/batch/payments",
            {
                "json": {
                    "ids": [p],
                    "paidOn": day,
                    "bankAccountId": world["account"].id,
                    "paymentMethodId": world["method"].id,
                }
            },
        ),
        ("post", "/payables/batch/delete", {"json": {"ids": [p]}}),
        ("post", "/payables/batch/duplicate", {"json": {"ids": [p]}}),
        ("post", f"/receivables/{r}/cancel", {"json": note}),
        (
            "post",
            f"/receivables/{r}/receipts",
            {
                "json": {
                    "receivedOn": day,
                    "amount": "1.00",
                    "bankAccountId": world["account"].id,
                    "paymentMethodId": world["method"].id,
                }
            },
        ),
        (
            "put",
            f"/fiscal/items/{hidden['item_id']}/invoice",
            {"json": {"number": "1", "issueDate": day}},
        ),
        ("post", f"/period-closings/{hidden['company_id']}/{today():%Y-%m}/close", {}),
        ("put", f"/records/companies/{hidden['company_id']}", {"json": {"name": "Mudada"}}),
    ]
    for method, path, kwargs in attempts:
        response = getattr(client, method)(path, headers=headers, **kwargs)
        assert response.status_code in (404, 405), (
            f"{method} {path}: {response.status_code} {response.text}"
        )
    send_ = send(
        client, headers, hidden["account_id"], ofx((today().strftime("%Y%m%d"), "-1.00", "X", "X"))
    )
    assert send_.status_code == 404

    # escolher o que é da outra empresa ao lançar é "não encontrado"
    for overrides in (
        {"unitId": hidden["unit_id"], "companyId": hidden["company_id"]},
        {"allocations": [{"projectId": hidden["project_id"], "amount": "1000.00"}]},
    ):
        refused = client.post("/payables", json=body(world, **overrides), headers=headers)
        assert refused.status_code == 422, refused.text
    mine = create(client, headers, world, amount="50.00")
    wrong_account = client.post(
        f"/payables/{mine['id']}/payments",
        json=payment(world, amount="50.00", bankAccountId=hidden["account_id"]),
        headers=headers,
    )
    assert wrong_account.status_code == 422, wrong_account.text
    new_company = client.post("/records/companies", json={"name": "Nova"}, headers=headers)
    assert (new_company.status_code, new_company.json()["detail"]) == (
        409,
        "Só quem vê todas as empresas cadastra uma empresa nova",
    )
    after = _state(db_session)
    assert after[1:5] == before[1:5]  # nenhuma baixa, anexo ou recebimento novo
    assert after[6] == before[6]
    assert len(after[5]) == len(before[5]) + 1  # só a conta que a pessoa lançou na empresa dela


def test_the_money_and_register_checks_see_every_company(
    client: TestClient,
    restricted: tuple[User, dict[str, str]],
    hidden: dict[str, Any],
    world: dict[str, Any],
    db_session: Session,
) -> None:
    headers = restricted[1]
    mine = create(client, headers, world, amount="50.00")
    reused = client.post(
        f"/payables/{mine['id']}/payments",
        json=payment(world, amount="50.00", transactionId="e-oculto-0001"),
        headers=headers,
    )
    assert reused.status_code == 409, reused.text
    assert "já foi usado" in reused.json()["detail"]
    # o fornecedor é o mesmo nas duas empresas: usado só pela oculta, também não se exclui
    db_session.query(Payable).filter(Payable.id == mine["id"]).delete()
    db_session.commit()
    company_scope.apply(db_session, None)
    supplier = world["supplier"].id
    refused = client.delete(f"/records/suppliers/{supplier}", headers=headers)
    assert (refused.status_code, "tem lançamentos" in refused.json()["detail"]) == (409, True)


def test_the_connect_receipts_ask_for_every_company(
    client: TestClient, restricted: tuple[User, dict[str, str]], admin: dict[str, str]
) -> None:
    for path in (
        "/finance/divergences",
        "/finance/projects",
        "/projects/1/finance/receipt-batches",
    ):
        refused = client.get(path, headers=restricted[1])
        assert refused.status_code == 403, path
        assert "todas as empresas" in refused.json()["detail"]
    assert client.get("/finance/projects", headers=admin).status_code == 200


def test_the_connect_notices_go_only_to_who_sees_every_company(
    client: TestClient,
    restricted: tuple[User, dict[str, str]],
    admin: dict[str, str],
    db_session: Session,
) -> None:
    notify_finance(db_session, "payment_refused", "O Connect recusou uma baixa")
    db_session.commit()
    told = {n.user_id for n in db_session.query(Notification)}
    assert restricted[0].id not in told and told


# ---- Acessos: quem escolhe as empresas ----


def _set(client: TestClient, headers: dict[str, str], person: User, ids: list[int] | None) -> Any:
    return client.put(
        f"/admin/pessoas/{person.id}/empresas", json={"companyIds": ids}, headers=headers
    )


def test_the_admin_chooses_the_companies_each_person_sees(
    client: TestClient,
    make_user: Callable[..., User],
    world: dict[str, Any],
    hidden: dict[str, Any],
    admin: dict[str, str],
    db_session: Session,
) -> None:
    person = make_user(email="pessoa@pesquisemais.com.br")
    headers = _headers(person)
    plus = world["company"].id
    done = _set(client, admin, person, [plus])
    assert done.status_code == 200, done.text
    assert done.json()["companyIds"] == [plus]
    me = client.get("/auth/me", headers=headers).json()
    assert me["companyIds"] == [plus]
    reference = client.get("/reference", headers=headers).json()
    assert [c["id"] for c in reference["companies"]] == [plus]
    assert {a["companyId"] for a in reference["bankAccounts"]} == {plus}
    assert "OC9137" not in [p["code"] for p in reference["projects"]]
    assert client.get("/payables?mode=tudo", headers=headers).json()["total"] == 0
    listed = client.get("/admin/pessoas", headers=admin).json()
    assert {c["name"] for c in listed["companies"]} == {"PPlus", "MC", "OCULTA SA"}
    history = client.get("/admin/pessoas", headers=admin)
    assert history.status_code == 200
    # de volta para todas
    assert _set(client, admin, person, None).json()["companyIds"] is None
    assert client.get("/payables?mode=tudo", headers=headers).json()["total"] == 1


def test_who_cannot_change_the_company_access(
    client: TestClient,
    make_user: Callable[..., User],
    world: dict[str, Any],
    restricted: tuple[User, dict[str, str]],
    admin: dict[str, str],
    db_session: Session,
) -> None:
    person = make_user(email="pessoa@pesquisemais.com.br")
    boss = make_user(email="chefe@pesquisemais.com.br", role="superadmin")
    full_admin = make_user(email="adm@pesquisemais.com.br", role="admin")
    plus = [world["company"].id]
    cases = [
        (_headers(person), person, 403, None),
        (restricted[1], person, 409, "Só quem vê todas as empresas muda o acesso por empresa"),
        (_headers(full_admin), full_admin, 409, "Peça a outro administrador"),
        (_headers(full_admin), boss, 409, "Você não pode mudar"),
        (_headers(full_admin), restricted[0], 409, "Você não pode mudar"),
    ]
    for headers, target, code, message in cases:
        response = _set(client, headers, target, plus)
        assert response.status_code == code, response.text
        if message:
            assert message in response.json()["detail"]
    empty = _set(client, admin, person, [])
    assert (empty.status_code, empty.json()["detail"]) == (
        422,
        "Escolha ao menos uma empresa, ou Todas as empresas",
    )
    assert _set(client, admin, person, [999]).status_code == 422
    assert (
        client.get("/admin/pessoas", headers=restricted[1]).json()["people"][0]["canEditCompanies"]
        is False
    )


def test_the_super_admin_always_sees_every_company(
    client: TestClient, make_user: Callable[..., User], db_session: Session
) -> None:
    boss = make_user(email="chefe@pesquisemais.com.br", role="superadmin")
    boss.companyAccessText = "1"
    db_session.commit()
    assert client.get("/auth/me", headers=_headers(boss)).json()["companyIds"] is None
    assert today() >= date(2026, 1, 1)
