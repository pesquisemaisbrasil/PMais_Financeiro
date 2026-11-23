"""Demandas: pedidos de mudança no sistema que qualquer pessoa abre e só o super admin lê (Bruno,
19/11/2026, spec demandas).

O anexo (print da tela ou PDF) é conferido pelos primeiros bytes, não pelo nome, e guardado cifrado
no cofre (`core/file_vault.py`), como os anexos das contas: o print pode mostrar dado real.
"""

import re
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session, aliased

from core import file_vault
from core.permissions import SUPERADMIN
from core.text import format_datetime_br
from models.demand import Demand
from models.notification import Notification
from models.user import User
from services.notifications import notify_admins
from services.payable import PayableConflict, PayableInvalid, PayableNotFound

VAULT_KIND = "demand"
KINDS = {"nova": "Abrir nova demanda", "bug": "Correção de bugs", "regra": "Correção de regra"}
MAX_BYTES = 10 * 1024 * 1024
MAX_DESCRIPTION = 4000
LONG_DESCRIPTION = "A descrição passa de 4.000 caracteres. Resuma um pouco."
INVALID_FILE = "Anexe uma imagem (PNG, JPG ou WEBP) ou um PDF."
TOO_LARGE = "O anexo passa de 10 MB. Envie um arquivo menor."
ALREADY_DONE = "Esta demanda já foi concluída"
EXTENSIONS = {
    "application/pdf": "pdf",
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
}


def _content_type(data: bytes) -> str | None:
    if data.startswith(b"%PDF-"):
        return "application/pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _file_name(filename: str, content_type: str) -> str:
    """Só o nome, sem pasta nem caractere de controle, e com a extensão do conteúdo conferido."""
    base = re.sub(r"[\x00-\x1f\x7f]", "", filename.replace("\\", "/").rsplit("/", 1)[-1]).strip()
    stem = base.rsplit(".", 1)[0].strip() if "." in base else base
    return f"{(stem or 'anexo')[:180]}.{EXTENSIONS[content_type]}"


def _page(page: str) -> str:
    page = (page or "").strip()
    return page[:200] if page.startswith("/") else "/"


def _row(demand: Demand, sender: str, done_by: str | None = None) -> dict[str, Any]:
    return {
        "id": demand.id,
        "kind": demand.kind,
        "kindLabel": KINDS.get(demand.kind, demand.kind),
        "description": demand.description,
        "page": demand.page,
        "sender": sender,
        "createdAt": demand.createdAt,
        "fileName": demand.fileName,
        "contentType": demand.contentType,
        "size": demand.size,
        "doneAt": demand.doneAt,
        "doneBy": done_by,
    }


def create(
    db: Session, user: User, kind: str, description: str, page: str, filename: str, data: bytes
) -> dict[str, Any]:
    description = (description or "").strip()
    missing = [
        label
        for label, ok in (("tipo", kind in KINDS), ("descrição", description), ("anexo", data))
        if not ok
    ]
    if missing:
        raise PayableInvalid(f"Falta preencher: {', '.join(missing)}.")
    if len(description) > MAX_DESCRIPTION:
        raise PayableInvalid(LONG_DESCRIPTION)
    content_type = _content_type(data)
    if content_type is None:
        raise PayableInvalid(INVALID_FILE)
    demand = Demand(
        kind=kind,
        description=description,
        page=_page(page),
        user_id=user.id,
        fileName=_file_name(filename, content_type),
        contentType=content_type,
        size=len(data),
        # a chave do cofre leva o id da demanda: provisória até o flush dar o id
        fileKey=f"pendente/{uuid.uuid4().hex}",
        fileSha256="",
    )
    db.add(demand)
    db.flush()
    # shortcut: um commit que falhe depois deixa um objeto cifrado órfão no cofre, como nos anexos
    # das contas; limpar órfãos se isso incomodar.
    stored = file_vault.store_file(VAULT_KIND, demand.id, data)
    demand.fileKey, demand.fileSha256, demand.size = stored.key, stored.sha256, stored.size
    notify_admins(
        db,
        "demanda",
        f"Nova demanda: {KINDS[kind]}",
        f"{user.name} abriu uma demanda.",
        "/demandas",
        roles=(SUPERADMIN,),
        except_user_id=user.id,
    )
    db.commit()
    return _row(demand, user.name)


def listing(db: Session) -> list[dict[str, Any]]:
    done_by = aliased(User)
    rows = (
        db.query(Demand, User.name, done_by.name)
        .join(User, User.id == Demand.user_id)
        .outerjoin(done_by, done_by.id == Demand.done_by_user_id)
        .order_by(Demand.createdAt.desc(), Demand.id.desc())
        .all()
    )
    return [_row(demand, sender, finisher) for demand, sender, finisher in rows]


def conclude(db: Session, demand_id: int, user: User) -> dict[str, Any]:
    """Marca como concluída e avisa no sino quem abriu. O aviso diz o tipo e quando foi aberta, sem
    a descrição: ela é texto livre e pode citar pessoas."""
    demand = db.query(Demand).filter(Demand.id == demand_id).with_for_update().one_or_none()
    if demand is None:
        raise PayableNotFound
    if demand.doneAt is not None:
        raise PayableConflict(ALREADY_DONE)
    demand.doneAt, demand.done_by_user_id = datetime.now(UTC), user.id
    opened = format_datetime_br(demand.createdAt)[:16].replace(" ", " às ")
    db.add(
        Notification(
            user_id=demand.user_id,
            type="demanda_concluida",
            title=f"Sua demanda foi concluída: {KINDS.get(demand.kind, demand.kind)}",
            body=f"Aberta em {opened}, concluída por {user.name}.",
        )
    )
    db.commit()
    sender = db.get(User, demand.user_id)
    return _row(demand, sender.name if sender else "", user.name)


def download(db: Session, demand_id: int) -> tuple[str, str, bytes]:
    demand = db.get(Demand, demand_id)
    if demand is None:
        raise PayableNotFound
    data = file_vault.read_file(VAULT_KIND, demand.id, demand.fileKey, demand.fileSha256)
    return demand.fileName, demand.contentType, data
