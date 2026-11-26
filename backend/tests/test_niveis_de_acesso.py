# ruff: noqa: F811
"""Três níveis de acesso, telas bloqueadas por pessoa e demandas (Bruno, 19/11/2026)."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from core.file_vault import MemoryFileStore
from models.demand import Demand
from models.notification import Notification
from models.reference import RecordEvent
from models.user import User
from services.auth import create_access_token
from tests.test_payables import vault, world  # noqa: F401

PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64
PDF = b"%PDF-1.4\n" + b"0" * 64


def bearer(user: User) -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}


@pytest.fixture
def team(make_user: Callable[..., User]) -> dict[str, User]:
    return {
        "super": make_user(email="super@pesquisemais.com.br", role="superadmin"),
        "admin": make_user(email="admin@pesquisemais.com.br", role="admin"),
        "admin2": make_user(email="admin2@pesquisemais.com.br", role="admin"),
        "user": make_user(email="ana@pesquisemais.com.br", role="financeiro"),
    }


def block(client: TestClient, editor: User, person: User, screens: list[str]) -> Any:
    return client.put(
        f"/admin/pessoas/{person.id}/telas", json={"blocked": screens}, headers=bearer(editor)
    )


# ---- níveis


def test_super_admin_does_everything_admin_and_user_do(
    client: TestClient, team: dict[str, User]
) -> None:
    for who in ("super", "admin", "user"):
        assert client.get("/reference", headers=bearer(team[who])).status_code == 200
    assert client.get("/admin/navegadores", headers=bearer(team["super"])).status_code == 200
    assert client.get("/admin/pessoas", headers=bearer(team["super"])).status_code == 200
    assert client.get("/admin/pessoas", headers=bearer(team["admin"])).status_code == 200
    response = client.get("/admin/pessoas", headers=bearer(team["user"]))
    assert (response.status_code, response.json()["detail"]) == (
        403,
        "Acesso de administrador é necessário",
    )


def test_the_people_list_says_the_level_and_who_each_one_may_change(
    client: TestClient, team: dict[str, User]
) -> None:
    data = client.get("/admin/pessoas", headers=bearer(team["admin"])).json()
    assert [screen["id"] for screen in data["screens"]] == [
        "contas-a-pagar",
        "contas-a-receber",
        "notas-e-rpa",
        "conferencia-bancaria",
        "divergencias",
        "relatorio-projeto",
        "fluxo-de-caixa",
        "dre",
        "fluxo-mensal",
        "recebimentos-projetos",
        "cadastros",
    ]
    rows = {row["email"]: row for row in data["people"]}
    assert rows["super@pesquisemais.com.br"]["roleLabel"] == "Super admin"
    assert rows["ana@pesquisemais.com.br"]["roleLabel"] == "Usuário"
    # admin muda só usuário; nem a si mesmo, nem outro admin, nem o super admin
    assert {email: row["canEdit"] for email, row in rows.items()} == {
        "super@pesquisemais.com.br": False,
        "admin@pesquisemais.com.br": False,
        "admin2@pesquisemais.com.br": False,
        "ana@pesquisemais.com.br": True,
    }
    rows = {
        r["email"]: r
        for r in client.get("/admin/pessoas", headers=bearer(team["super"])).json()["people"]
    }
    assert rows["admin@pesquisemais.com.br"]["canEdit"] is True


# ---- telas bloqueadas


def test_a_blocked_screen_is_refused_even_calling_the_api_directly(
    client: TestClient, team: dict[str, User], db_session: Session
) -> None:
    user = team["user"]
    assert client.get("/receivables", headers=bearer(user)).status_code == 200
    response = block(client, team["admin"], user, ["cadastros", "contas-a-receber"])
    assert response.status_code == 200
    # a ordem é a do menu, venha como vier
    assert response.json()["blockedScreens"] == ["contas-a-receber", "cadastros"]
    assert client.get("/auth/me", headers=bearer(user)).json()["blockedScreens"] == [
        "contas-a-receber",
        "cadastros",
    ]
    refused = client.get("/receivables", headers=bearer(user))
    assert (refused.status_code, refused.json()["detail"]) == (
        403,
        "Esta tela não está liberada para você. Fale com o administrador.",
    )
    # cadastros: gravar é barrado, ler continua (outras telas usam)
    assert client.post("/records/units", json={}, headers=bearer(user)).status_code == 403
    assert client.put("/tax-rates", json={"rates": []}, headers=bearer(user)).status_code == 403
    assert client.get("/records/units", headers=bearer(user)).status_code == 200
    # o que várias telas usam continua aberto
    assert client.get("/reference", headers=bearer(user)).status_code == 200
    assert client.get("/home", headers=bearer(user)).status_code == 200
    # quem não tem a tela bloqueada não muda nada
    assert client.get("/receivables", headers=bearer(team["admin2"])).status_code == 200
    history = db_session.query(RecordEvent).filter(RecordEvent.kind == "userScreens").one()
    assert history.text == "Telas bloqueadas de Ana: Contas a receber, Cadastros"
    assert history.user_id == team["admin"].id


@pytest.mark.parametrize(
    ("screen", "method", "url"),
    [
        ("contas-a-pagar", "get", "/payables"),
        ("conferencia-bancaria", "get", "/bank-accounts/1/statements"),
        ("divergencias", "get", "/finance/divergences"),
        ("relatorio-projeto", "get", "/reports/projects"),
        ("fluxo-de-caixa", "get", "/reports/cash-flow?start=2026-11-01&end=2026-11-30"),
        ("dre", "get", "/reports/dre?start=2026-11-01&end=2026-11-30"),
        ("fluxo-mensal", "get", "/reports/monthly-flow?start=2026-11-01&end=2026-11-30"),
        ("recebimentos-projetos", "get", "/reports/project-receipts?year=2026"),
        ("notas-e-rpa", "get", "/fiscal/pending-invoices"),
    ],
)
def test_each_screen_guards_its_own_routes(
    client: TestClient, team: dict[str, User], screen: str, method: str, url: str
) -> None:
    block(client, team["admin"], team["user"], [screen])
    response = getattr(client, method)(url, headers=bearer(team["user"]))
    assert response.status_code == 403


def test_unblocking_gives_the_screen_back(client: TestClient, team: dict[str, User]) -> None:
    block(client, team["admin"], team["user"], ["contas-a-pagar"])
    assert client.get("/payables", headers=bearer(team["user"])).status_code == 403
    assert block(client, team["admin"], team["user"], []).json()["blockedScreens"] == []
    assert client.get("/payables", headers=bearer(team["user"])).status_code == 200


@pytest.mark.parametrize(
    ("editor", "person", "detail"),
    [
        ("admin", "admin", "Peça a outro administrador para mudar as suas telas"),
        ("admin", "admin2", "Você não pode mudar as telas desta pessoa"),
        ("admin", "super", "Você não pode mudar as telas desta pessoa"),
        ("super", "super", "Peça a outro administrador para mudar as suas telas"),
    ],
)
def test_who_may_not_change_the_screens(
    client: TestClient, team: dict[str, User], editor: str, person: str, detail: str
) -> None:
    response = block(client, team[editor], team[person], ["cadastros"])
    assert (response.status_code, response.json()["detail"]) == (409, detail)


def test_super_admin_blocks_screens_of_an_admin(client: TestClient, team: dict[str, User]) -> None:
    assert block(client, team["super"], team["admin"], ["divergencias"]).status_code == 200
    assert client.get("/finance/divergences", headers=bearer(team["admin"])).status_code == 403


def test_unknown_screen_and_person_are_refused(client: TestClient, team: dict[str, User]) -> None:
    response = block(client, team["admin"], team["user"], ["acessos"])
    assert (response.status_code, response.json()["detail"]) == (422, "Tela desconhecida")
    response = client.put(
        "/admin/pessoas/9999/telas", json={"blocked": []}, headers=bearer(team["admin"])
    )
    assert (response.status_code, response.json()["detail"]) == (404, "Pessoa não encontrada")
    response = block(client, team["user"], team["user"], [])
    assert response.status_code == 403


def test_search_hides_the_groups_of_a_blocked_screen(
    client: TestClient, team: dict[str, User], world: dict[str, Any]
) -> None:
    def keys() -> set[str]:
        response = client.get("/search", params={"q": "Consumo"}, headers=bearer(team["user"]))
        return {group["key"] for group in response.json()["groups"]}

    assert "units" in keys()
    block(client, team["admin"], team["user"], ["cadastros"])
    assert "units" not in keys()


def test_admin_approves_the_computer_of_the_super_admin(
    client: TestClient, team: dict[str, User], db_session: Session
) -> None:
    from models.trusted_browser import TrustedBrowser

    request = TrustedBrowser(
        user_id=team["super"].id, tokenHash="x" * 64, label="Chrome no Windows", status="pendente"
    )
    db_session.add(request)
    db_session.commit()
    response = client.post(
        f"/admin/navegadores/{request.id}/liberar", headers=bearer(team["admin"])
    )
    assert response.status_code == 200


# ---- demandas


def open_demand(client: TestClient, user: User, **overrides: Any) -> Any:
    fields = {"kind": "bug", "description": "O total não bate", "page": "/contas-a-pagar"}
    fields.update({k: v for k, v in overrides.items() if k != "file"})
    file = overrides.get("file", ("print.png", PNG, "image/png"))
    files = {"file": file} if file else None
    return client.post("/demands", data=fields, files=files, headers=bearer(user))


def test_anyone_opens_a_demand_and_only_the_super_admin_reads_it(
    client: TestClient, team: dict[str, User], vault: MemoryFileStore, db_session: Session
) -> None:
    response = open_demand(client, team["user"], kind="regra")
    assert response.status_code == 201
    assert response.json()["kindLabel"] == "Correção de regra"
    assert (
        open_demand(
            client, team["admin"], kind="nova", file=("a.pdf", PDF, "application/pdf")
        ).status_code
        == 201
    )
    # o super admin recebe o aviso no sino; o admin não
    notices = db_session.query(Notification).filter(Notification.type == "demanda").all()
    assert {n.user_id for n in notices} == {team["super"].id}

    listed = client.get("/demands", headers=bearer(team["super"]))
    assert [row["kindLabel"] for row in listed.json()] == [
        "Abrir nova demanda",
        "Correção de regra",
    ]
    assert listed.json()[1]["sender"] == "Ana"
    assert listed.json()[1]["page"] == "/contas-a-pagar"
    for who in ("admin", "user"):
        refused = client.get("/demands", headers=bearer(team[who]))
        assert (refused.status_code, refused.json()["detail"]) == (
            403,
            "Esta tela é só do super admin",
        )

    demand_id = listed.json()[1]["id"]
    download = client.get(f"/demands/{demand_id}/anexo", headers=bearer(team["super"]))
    assert download.status_code == 200
    assert download.content == PNG
    assert download.headers["content-type"] == "image/png"
    assert "attachment" in download.headers["content-disposition"]
    assert (
        client.get(f"/demands/{demand_id}/anexo", headers=bearer(team["admin"])).status_code == 403
    )
    # cifrado no cofre: o que está guardado não é o print
    stored = db_session.get(Demand, demand_id)
    assert stored is not None and stored.fileKey.startswith(f"demand/{demand_id}/")
    assert PNG not in vault.get(stored.fileKey)[0]


@pytest.mark.parametrize(
    ("overrides", "status", "detail"),
    [
        (
            {"kind": "", "description": " ", "file": None},
            422,
            "Falta preencher: tipo, descrição, anexo.",
        ),
        ({"kind": "melhoria"}, 422, "Falta preencher: tipo."),
        (
            {"description": "x" * 4001},
            422,
            "A descrição passa de 4.000 caracteres. Resuma um pouco.",
        ),
        (
            {"file": ("print.png", b"<svg></svg>", "image/png")},
            422,
            "Anexe uma imagem (PNG, JPG ou WEBP) ou um PDF.",
        ),
        (
            {"file": ("grande.pdf", b"%PDF-" + b"0" * (10 * 1024 * 1024), "application/pdf")},
            413,
            "O anexo passa de 10 MB. Envie um arquivo menor.",
        ),
    ],
)
def test_a_demand_without_what_it_needs_is_refused_in_plain_words(
    client: TestClient,
    team: dict[str, User],
    vault: MemoryFileStore,
    db_session: Session,
    overrides: dict[str, Any],
    status: int,
    detail: str,
) -> None:
    response = open_demand(client, team["user"], **overrides)
    assert (response.status_code, response.json()["detail"]) == (status, detail)
    assert db_session.query(Demand).count() == 0


def test_the_attachment_name_follows_the_content_not_the_name_sent(
    client: TestClient, team: dict[str, User], vault: MemoryFileStore
) -> None:
    response = open_demand(client, team["user"], file=("..\\pasta\\tela.exe", PNG, "image/png"))
    assert response.json()["fileName"] == "tela.png"


def test_demands_need_login(client: TestClient) -> None:
    assert client.get("/demands").status_code == 401
    assert client.post("/demands", data={"kind": "bug"}).status_code == 401


def test_the_super_admin_concludes_a_demand_and_the_author_is_notified(
    client: TestClient, team: dict[str, User], vault: MemoryFileStore, db_session: Session
) -> None:
    demand_id = open_demand(client, team["user"]).json()["id"]
    response = client.post(f"/demands/{demand_id}/concluir", headers=bearer(team["super"]))
    assert response.status_code == 200
    assert response.json()["doneBy"] == "Ana"  # o make_user dá o nome Ana a todos
    assert response.json()["doneAt"] is not None
    listed = client.get("/demands", headers=bearer(team["super"])).json()
    assert listed[0]["doneAt"] is not None
    # quem abriu recebe o aviso, com o tipo e a data, sem a descrição (texto livre)
    notice = (
        db_session.query(Notification)
        .filter(Notification.type == "demanda_concluida", Notification.user_id == team["user"].id)
        .one()
    )
    assert notice.title == "Sua demanda foi concluída: Correção de bugs"
    assert notice.body is not None and "O total não bate" not in notice.body
    assert notice.body.startswith("Aberta em ")

    again = client.post(f"/demands/{demand_id}/concluir", headers=bearer(team["super"]))
    assert (again.status_code, again.json()["detail"]) == (409, "Esta demanda já foi concluída")


def test_only_the_super_admin_concludes_and_a_missing_demand_is_404(
    client: TestClient, team: dict[str, User], vault: MemoryFileStore
) -> None:
    demand_id = open_demand(client, team["user"]).json()["id"]
    for who in ("admin", "user"):
        refused = client.post(f"/demands/{demand_id}/concluir", headers=bearer(team[who]))
        assert refused.status_code == 403
    missing = client.post("/demands/9999/concluir", headers=bearer(team["super"]))
    assert (missing.status_code, missing.json()["detail"]) == (404, "Demanda não encontrada")
