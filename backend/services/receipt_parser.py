"""Leitura de comprovantes Pix do Itaú (Sispag) — "Comprovante de Transferência".

Puro, sem banco (mesmo padrão de lead_import_parser.py): recebe o texto de
cada página do PDF e devolve um ParsedReceipt por comprovante. Um PDF pode ter
vários comprovantes por página ou um comprovante quebrado entre páginas — o
corte é sempre no título "Comprovante de Transferência", não na página.

Só o bloco "dados do recebedor" é lido como recebedor: o bloco "dados do
pagador" traz o CNPJ da própria empresa e nunca pode virar a chave casada.
Nada além do necessário para casar e conciliar sai daqui — o CPF mascarado do
recebedor, a agência e o texto bruto são descartados (minimização, LGPD).
"""

import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

RECEIPT_TITLE = "comprovante de transferencia"


@dataclass(frozen=True)
class ParsedReceipt:
    page: int  # 1-based, página do PDF original onde o comprovante começa
    payee_name: str | None
    pix_key: str | None
    amount: Decimal | None
    paid_at: date | None
    e2e_id: str | None
    auth_code: str | None
    error: str | None = None  # preenchido quando falta campo obrigatório


def _fold(text: str) -> str:
    """Minúsculas sem acento — os rótulos do Itaú variam em acentuação na extração."""
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()


def _split_receipts(pages: list[str]) -> list[tuple[int, list[str]]]:
    """[(página inicial, linhas do comprovante)]. Linhas antes do primeiro título são ignoradas."""
    receipts: list[tuple[int, list[str]]] = []
    for page_number, text in enumerate(pages, start=1):
        for line in text.splitlines():
            if RECEIPT_TITLE in _fold(line):
                receipts.append((page_number, []))
                continue
            if receipts:
                receipts[-1][1].append(line.strip())
    return receipts


def _value_after(
    lines: list[str],
    label: str,
    start: int = 0,
    end: int | None = None,
    *,
    value_on_next_line: bool = False,
) -> str | None:
    """Valor de "label: valor". Com value_on_next_line, rótulo sozinho na linha
    pega a próxima linha não vazia (é assim que o Itaú quebra "ID da transação:"
    e "autenticação") — só para esses: nos demais, rótulo vazio é campo vazio,
    nunca o rótulo seguinte. Se a próxima linha for outro rótulo ("controle:"),
    o campo veio vazio: devolve None em vez de ler o rótulo como valor."""
    end = len(lines) if end is None else end
    for index in range(start, end):
        folded = _fold(lines[index])
        if folded.startswith(label + ":"):
            value = lines[index].split(":", 1)[1].strip()
            if value or not value_on_next_line:
                return value or None
            for next_line in lines[index + 1 : end]:
                if next_line.strip():
                    return None if next_line.strip().endswith(":") else next_line.strip()
            return None
    return None


def _block_bounds(lines: list[str], header: str) -> tuple[int, int]:
    """[início, fim) do bloco que começa no cabeçalho `header` e vai até o próximo "dados ..."."""
    start = next((i for i, line in enumerate(lines) if _fold(line).strip() == header), None)
    if start is None:
        return 0, 0
    end = next(
        (i for i in range(start + 1, len(lines)) if _fold(lines[i]).strip().startswith("dados d")),
        len(lines),
    )
    return start + 1, end


def _fix_email(key: str) -> str:
    """A extração do PDF às vezes troca o ponto do domínio por espaço
    ("fulano@gmail com"). Só mexe em e-mail; outras chaves voltam como vieram."""
    if "@" not in key:
        return key
    local, _, domain = key.partition("@")
    return f"{local.strip()}@{'.'.join(domain.split())}"


def _parse_amount(raw: str | None) -> Decimal | None:
    if not raw:
        return None
    match = re.search(r"([\d.]+,\d{2})", raw)
    if not match:
        return None
    try:
        return Decimal(match.group(1).replace(".", "").replace(",", "."))
    except InvalidOperation:
        return None


def _parse_date(raw: str | None) -> date | None:
    if not raw:
        return None
    match = re.search(r"(\d{2}/\d{2}/\d{4})", raw)
    if not match:
        return None
    try:
        return datetime.strptime(match.group(1), "%d/%m/%Y").date()
    except ValueError:
        return None


def _first_token(raw: str | None) -> str | None:
    return raw.split()[0] if raw and raw.split() else None


def parse_receipt_lines(page: int, lines: list[str]) -> ParsedReceipt:
    payee_start, payee_end = _block_bounds(lines, "dados do recebedor")
    payee_name = _value_after(lines, "nome do recebedor", payee_start, payee_end)
    raw_key = _value_after(lines, "chave", payee_start, payee_end)
    pix_key = _fix_email(" ".join(raw_key.split())) if raw_key else None
    amount = _parse_amount(_value_after(lines, "valor"))
    paid_at = _parse_date(_value_after(lines, "data da transferencia"))
    e2e_id = _first_token(_value_after(lines, "id da transacao", value_on_next_line=True))
    auth_code = _first_token(
        _value_after(lines, "autenticacao no comprovante", value_on_next_line=True)
    )

    missing = [
        label
        for label, value in (("chave", pix_key), ("valor", amount), ("ID da transação", e2e_id))
        if not value
    ]
    return ParsedReceipt(
        page=page,
        payee_name=" ".join(payee_name.split()) if payee_name else None,
        pix_key=pix_key,
        amount=amount,
        paid_at=paid_at,
        e2e_id=e2e_id,
        auth_code=auth_code,
        error=f"Não foi possível ler: {', '.join(missing)}" if missing else None,
    )


def parse_receipts(pages: list[str], page_offset: int = 0) -> list[ParsedReceipt]:
    """`page_offset`: quando o navegador manda o PDF em partes, a parte que
    começa na página 51 chega com page_offset=50 — o nº da página exibido na
    revisão é sempre o do PDF original."""
    return [
        parse_receipt_lines(page + page_offset, lines) for page, lines in _split_receipts(pages)
    ]


def extract_pdf_pages(content: bytes) -> list[str]:
    """Texto de cada página. Levanta UnreadablePdf para arquivo que não é PDF,
    criptografado, ou que o pypdf não consegue abrir."""
    from io import BytesIO

    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    if not content.startswith(b"%PDF"):
        raise UnreadablePdf("O arquivo não é um PDF")
    try:
        reader = PdfReader(BytesIO(content))
        if reader.is_encrypted:
            raise UnreadablePdf("PDF protegido por senha")
        return [page.extract_text() or "" for page in reader.pages]
    except PdfReadError as exc:
        raise UnreadablePdf("Não foi possível abrir o PDF") from exc


class UnreadablePdf(Exception):
    pass
