"""Anexos das contas a pagar (spec baixas-recorrencia-e-anexos, regra 6).

O arquivo é conferido pelo conteúdo (não só pela extensão), cifrado e guardado no cofre
(`core/file_vault.py`). Ficam na trilha da conta quem incluiu, quem baixou e quem removeu,
e por quê. Remover é lógico: o arquivo continua no cofre.

Ainda não existe: antivírus (a spec pede) e prazo de guarda (Q5, DPO). Está em `scan()`, que hoje
não recusa nada, para o dia em que houver um scanner.
"""

import hashlib
import io
import re
import zipfile
from datetime import UTC, datetime

from defusedxml import ElementTree
from sqlalchemy.orm import Session

from core import file_vault
from models.payable import Payable, PayableAttachment
from models.user import User
from services import payable as payable_service
from services.payable import PayableConflict, PayableInvalid, PayableNotFound

MAX_BYTES = 20 * 1024 * 1024
MAX_PER_PAYABLE = 50
MAX_UNZIPPED_BYTES = 100 * 1024 * 1024
INVALID_FILE = "Envie PDF, imagem, planilha, documento ou XML de até 20 MB"

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


def _clean_name(filename: str) -> str:
    """Só o nome do arquivo, sem pasta nem caractere de controle, em até 200 letras."""
    name = re.split(r"[\\/]", filename)[-1]
    name = re.sub(r"[\x00-\x1f\x7f]", "", name)
    name = re.sub(r"\s+", " ", name).strip().strip(".")
    if len(name) > 200:
        stem, dot, ext = name.rpartition(".")
        name = (stem[: 200 - len(ext) - 1] + dot + ext) if dot and len(ext) < 10 else name[:200]
    return name


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


def _active(payable: Payable, attachment_id: int) -> PayableAttachment:
    for attachment in payable.attachments:
        if attachment.id == attachment_id and attachment.deletedAt is None:
            return attachment
    raise AttachmentNotFound


def add(db: Session, payable_id: int, filename: str, data: bytes, user: User) -> None:
    """Anexa o arquivo, cifrado, e registra na trilha da conta."""
    payable = payable_service._get(db, payable_id, lock=True)
    name, content_type = validate_upload(filename, data)
    current = [a for a in payable.attachments if a.deletedAt is None]
    if len(current) >= MAX_PER_PAYABLE:
        raise PayableConflict(f"Esta conta já tem {MAX_PER_PAYABLE} documentos")
    digest = hashlib.sha256(data).hexdigest()
    if any(a.fileSha256 == digest for a in current):
        raise PayableConflict("Este arquivo já está anexado a esta conta")
    stored = file_vault.store_file("payable", payable.id, data)
    db.add(
        PayableAttachment(
            payable_id=payable.id,
            name=name,
            contentType=content_type,
            size=stored.size,
            fileKey=stored.key,
            fileSha256=stored.sha256,
            uploaded_by_user_id=user.id,
        )
    )
    payable_service.audit(
        db, payable, user, f"Documento incluído: {name} ({_size_text(stored.size)})"
    )
    db.commit()


def download(
    db: Session, payable_id: int, attachment_id: int, user: User
) -> tuple[str, str, bytes]:
    """(nome, tipo, conteúdo) do documento. Cada download fica na trilha da conta."""
    payable = payable_service._get(db, payable_id)
    attachment = _active(payable, attachment_id)
    data = file_vault.read_file("payable", payable.id, attachment.fileKey, attachment.fileSha256)
    payable_service.audit(db, payable, user, f"Documento baixado: {attachment.name}")
    db.commit()
    return attachment.name, attachment.contentType, data


def remove(db: Session, payable_id: int, attachment_id: int, reason: str, user: User) -> None:
    """Remove da conta (lógico): o arquivo fica no cofre, e a trilha guarda quem tirou e por quê."""
    payable = payable_service._get(db, payable_id, lock=True)
    attachment = _active(payable, attachment_id)
    attachment.deletedAt = datetime.now(UTC)
    attachment.deleted_by_user_id = user.id
    attachment.deletedReason = reason
    payable_service.audit(db, payable, user, f"Documento removido: {attachment.name} — {reason}")
    db.commit()
