"""Anexos das contas a pagar, dos títulos a receber e dos clientes (spec
baixas-recorrencia-e-anexos, regra 6).

O arquivo é conferido pelo conteúdo (não só pela extensão), cifrado e guardado no cofre
(`core/file_vault.py`). Ficam na trilha da conta (ou do título) quem incluiu, quem baixou, quem
renomeou e quem removeu, e por quê. Remover é lógico: o arquivo continua no cofre.

Ainda não existe: antivírus (a spec pede) e prazo de guarda (Q5, DPO). Está em `scan()`, que hoje
não recusa nada, para o dia em que houver um scanner.
"""

import hashlib
import io
import re
import zipfile
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from defusedxml import ElementTree
from sqlalchemy.orm import Session

from core import file_vault
from models.payable import PayableAttachment
from models.receivable import ReceivableAttachment
from models.reference import Customer, CustomerAttachment
from models.user import User
from services import payable as payable_service
from services import receivable as receivable_service
from services import records as records_service
from services.payable import PayableConflict, PayableInvalid, PayableNotFound

MAX_BYTES = 20 * 1024 * 1024
MAX_PER_OWNER = 50
MAX_UNZIPPED_BYTES = 100 * 1024 * 1024
INVALID_FILE = "Envie PDF, imagem, planilha, documento ou XML de até 20 MB"

# O tipo do documento, para achar a nota ou o boleto sem abrir um por um.
# O que não se sabe é "outro".
KINDS = {
    "nota": "Nota fiscal",
    "boleto": "Boleto",
    "contrato": "Contrato",
    "comprovante": "Comprovante",
    "recibo": "Recibo",
    "planilha": "Planilha",
    "outro": "Outro",
}
DEFAULT_KIND = "outro"

ALLOWED = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xml": "application/xml",
}
_OFFICE_MARKER = {".xlsx": "xl/workbook.xml", ".docx": "word/document.xml"}


class AttachmentNotFound(PayableNotFound):
    pass


@dataclass(frozen=True)
class Target:
    """A quem o documento pertence: a conta a pagar, o título a receber ou o cliente."""

    # prefixo da chave no cofre; amarra o arquivo ao dono (copiar para outro dono não abre)
    vault_kind: str
    get: Callable[..., Any]
    audit: Callable[[Session, Any, User, str], None]
    model: type
    foreign_key: str
    # as palavras das mensagens
    this: str
    to_this: str


PAYABLE = Target(
    "payable",
    payable_service._get,
    payable_service.audit,
    PayableAttachment,
    "payable_id",
    "Esta conta",
    "a esta conta",
)
RECEIVABLE = Target(
    "receivable",
    receivable_service._get,
    receivable_service.audit,
    ReceivableAttachment,
    "receivable_id",
    "Este título",
    "a este título",
)


def _customer(db: Session, customer_id: int, lock: bool = False) -> Customer:
    query = db.query(Customer).filter(Customer.id == customer_id)
    if lock:
        query = query.with_for_update()
    customer = query.first()
    if customer is None:
        raise records_service.RecordNotFound
    return customer


def _audit_customer(db: Session, customer: Customer, user: User, text: str) -> None:
    records_service._log(db, "customers", customer.id, user, text)


CUSTOMER = Target(
    "customer",
    _customer,
    _audit_customer,
    CustomerAttachment,
    "customer_id",
    "Este cliente",
    "a este cliente",
)


def listing(owner: Any) -> list[dict[str, Any]]:
    """Os documentos que estão valendo (o removido some da lista, mas fica no cofre)."""
    return [
        {
            "id": a.id,
            "name": a.name,
            "kind": a.kind,
            "size": a.size,
            "contentType": a.contentType,
            "uploadedBy": a.uploaded_by.name,
            "createdAt": a.createdAt,
        }
        for a in owner.attachments
        if a.deletedAt is None
    ]


def _clean_name(filename: str) -> str:
    """Só o nome do arquivo, sem pasta nem caractere de controle, em até 200 letras."""
    name = re.split(r"[\\/]", filename)[-1]
    name = re.sub(r"[\x00-\x1f\x7f]", "", name)
    name = re.sub(r"\s+", " ", name).strip().strip(".")
    if len(name) > 200:
        stem, dot, ext = name.rpartition(".")
        name = (stem[: 200 - len(ext) - 1] + dot + ext) if dot and len(ext) < 10 else name[:200]
    return name


def _renamed(new: str, current: str) -> str:
    """O nome novo, limpo e com a extensão que o arquivo já tem: renomear não troca o tipo dele."""
    dot = current.rfind(".")
    extension = current[dot:].lower() if dot >= 0 else ""
    name = _clean_name(new)
    if not name:
        raise PayableInvalid("Informe o nome do documento")
    if not name.lower().endswith(extension):
        name = _clean_name(name + extension)
    return name


def _check_kind(kind: str) -> None:
    if kind not in KINDS:
        raise PayableInvalid("Escolha o tipo do documento")


def _is_xml(data: bytes) -> bool:
    try:
        ElementTree.fromstring(data)
    except Exception:  # defusedxml recusa entidades e DTD; qualquer falha é arquivo ruim
        return False
    return True


def _is_office(data: bytes, marker: str) -> bool:
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            # Arquivo pequeno que vira gigabytes ao abrir não passa.
            if sum(entry.file_size for entry in archive.infolist()) > MAX_UNZIPPED_BYTES:
                return False
            return marker in archive.namelist()
    except zipfile.BadZipFile:
        return False


def _matches(extension: str, data: bytes) -> bool:
    """O conteúdo é o que a extensão diz: um .exe renomeado para .pdf não passa."""
    if extension == ".pdf":
        return data.startswith(b"%PDF-")
    if extension in (".jpg", ".jpeg"):
        return data.startswith(b"\xff\xd8\xff")
    if extension == ".png":
        return data.startswith(b"\x89PNG\r\n\x1a\n")
    if extension in _OFFICE_MARKER:
        return data.startswith(b"PK\x03\x04") and _is_office(data, _OFFICE_MARKER[extension])
    if extension == ".xml":
        return _is_xml(data)
    return False


def scan(data: bytes) -> None:
    """Gancho do antivírus. Hoje não há scanner, então não recusa nada: ver o docstring do módulo.
    Com um, levantar `PayableInvalid("Arquivo bloqueado por segurança")` aqui."""


def validate_upload(filename: str, data: bytes) -> tuple[str, str]:
    """(nome limpo, tipo do conteúdo). Recusa o que não é permitido, vazio ou acima de 20 MB."""
    name = _clean_name(filename)
    extension = "." + name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if extension not in ALLOWED or not 0 < len(data) <= MAX_BYTES or not _matches(extension, data):
        raise PayableInvalid(INVALID_FILE)
    scan(data)
    return name, ALLOWED[extension]


def _size_text(size: int) -> str:
    return f"{size / 1024:.0f} KB" if size < 1024 * 1024 else f"{size / 1024 / 1024:.1f} MB"


def _active(owner: Any, attachment_id: int) -> Any:
    for attachment in owner.attachments:
        if attachment.id == attachment_id and attachment.deletedAt is None:
            return attachment
    raise AttachmentNotFound


def add(
    db: Session,
    target: Target,
    owner_id: int,
    filename: str,
    data: bytes,
    kind: str,
    user: User,
) -> None:
    """Anexa o arquivo, cifrado, e registra na trilha."""
    owner = target.get(db, owner_id, lock=True)
    _check_kind(kind)
    name, content_type = validate_upload(filename, data)
    current = [a for a in owner.attachments if a.deletedAt is None]
    if len(current) >= MAX_PER_OWNER:
        raise PayableConflict(f"{target.this} já tem {MAX_PER_OWNER} documentos")
    digest = hashlib.sha256(data).hexdigest()
    if any(a.fileSha256 == digest for a in current):
        raise PayableConflict(f"Este arquivo já está anexado {target.to_this}")
    # shortcut: a conta fica travada durante o envio ao cofre (até ~30 s com o MinIO lento) e um
    # commit que falhe depois deixa um objeto cifrado órfão; enviar antes da trava se incomodar.
    stored = file_vault.store_file(target.vault_kind, owner.id, data)
    db.add(
        target.model(
            **{target.foreign_key: owner.id},
            name=name,
            kind=kind,
            contentType=content_type,
            size=stored.size,
            fileKey=stored.key,
            fileSha256=stored.sha256,
            uploaded_by_user_id=user.id,
        )
    )
    target.audit(db, owner, user, f"Documento incluído: {name} ({_size_text(stored.size)})")
    db.commit()


def download(
    db: Session, target: Target, owner_id: int, attachment_id: int, user: User
) -> tuple[str, str, bytes]:
    """(nome, tipo, conteúdo) do documento. Cada download fica na trilha."""
    owner = target.get(db, owner_id)
    attachment = _active(owner, attachment_id)
    data = file_vault.read_file(
        target.vault_kind, owner.id, attachment.fileKey, attachment.fileSha256
    )
    target.audit(db, owner, user, f"Documento baixado: {attachment.name}")
    db.commit()
    return attachment.name, attachment.contentType, data


def update(
    db: Session,
    target: Target,
    owner_id: int,
    attachment_id: int,
    name: str | None,
    kind: str | None,
    user: User,
) -> None:
    """Renomeia e/ou muda o tipo. Quem mudou e o que mudou ficam na trilha; o arquivo não muda."""
    if name is None and kind is None:
        raise PayableInvalid("Mude o nome ou o tipo do documento")
    owner = target.get(db, owner_id, lock=True)
    attachment = _active(owner, attachment_id)
    new_name = _renamed(name, attachment.name) if name is not None else attachment.name
    if kind is not None:
        _check_kind(kind)
    if new_name != attachment.name:
        target.audit(db, owner, user, f"Documento renomeado: {attachment.name} → {new_name}")
        attachment.name = new_name
    if kind is not None and kind != attachment.kind:
        target.audit(
            db,
            owner,
            user,
            f"Tipo do documento mudou: {attachment.name} "
            f"({KINDS[attachment.kind]} → {KINDS[kind]})",
        )
        attachment.kind = kind
    db.commit()


def remove(
    db: Session, target: Target, owner_id: int, attachment_id: int, reason: str, user: User
) -> None:
    """Remove (lógico): o arquivo fica no cofre, e a trilha guarda quem tirou e por quê."""
    owner = target.get(db, owner_id, lock=True)
    attachment = _active(owner, attachment_id)
    attachment.deletedAt = datetime.now(UTC)
    attachment.deleted_by_user_id = user.id
    attachment.deletedReason = reason
    target.audit(db, owner, user, f"Documento removido: {attachment.name} — {reason}")
    db.commit()
