"""Leitor de extrato bancário: OFX (o padrão dos bancos) e CSV (as colunas comuns do Itaú).

Só lê o arquivo e devolve as linhas: nada vai ao banco aqui. O OFX é lido por expressão regular, não
por um parser de XML, então não há entidade externa para abrir. O CSV não tem layout garantido
(Q44): acha o cabeçalho pelos nomes das colunas e recusa o que não entende.
"""

import csv
import html
import io
import re
import unicodedata
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation

UNREADABLE = "Não foi possível ler o extrato — envie OFX ou CSV do banco"
MAX_AMOUNT = Decimal(10) ** 12  # a coluna é Numeric(14,2): menos de R$ 1 trilhão por linha
MAX_LINES = 20_000
MAX_DESCRIPTION = 500


class StatementError(ValueError):
    """O arquivo não é um extrato que dê para ler. A mensagem já é a que o usuário vê."""


@dataclass(frozen=True)
class StatementLine:
    posted_on: date
    amount: Decimal  # entrada positiva, saída negativa
    description: str
    external_id: str | None = None


@dataclass(frozen=True)
class ParsedStatement:
    file_format: str  # ofx ou csv
    lines: list[StatementLine]
    # Só os dígitos da conta que o OFX diz ser dele, para a tela avisar se parece de outra conta.
    account_digits: str | None = None


def _decode(content: bytes) -> str:
    if content.startswith(b"\xef\xbb\xbf"):
        content = content[3:]
    for encoding in ("utf-8", "cp1252"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("latin-1")  # nunca falha: todo byte tem uma letra


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(text)).strip()[:MAX_DESCRIPTION]


def _two_places(value: Decimal) -> Decimal:
    rounded = value.quantize(Decimal("0.01"))
    if rounded != value:
        raise StatementError(UNREADABLE)  # valor com mais de duas casas: nunca arredonda calado
    if abs(rounded) >= MAX_AMOUNT:
        raise StatementError(UNREADABLE)  # não cabe na coluna do banco de dados: seria erro 500
    return rounded


def parse_amount(raw: str) -> Decimal:
    """Valor como o banco escreve: 1.234,56, -1234.56, (1.234,56), 1.234,56- ou R$ 50,00."""
    text = raw.replace("R$", "").replace("\xa0", "").replace(" ", "")
    negative = False
    if text.startswith("(") and text.endswith(")"):
        negative, text = True, text[1:-1]
    if text.endswith("-"):
        negative, text = True, text[:-1]
    if text.startswith("-"):
        negative, text = True, text[1:]
    elif text.startswith("+"):
        text = text[1:]
    if "," in text and "." in text:
        # o último separador é o decimal
        if text.rfind(",") > text.rfind("."):
            text = text.replace(".", "").replace(",", ".")
        else:
            text = text.replace(",", "")
    elif "," in text:
        text = text.replace(",", ".")
    elif "." in text and re.fullmatch(r"\d{1,3}(\.\d{3})+", text):
        text = text.replace(".", "")  # 1.234 é mil duzentos e trinta e quatro
    if not re.fullmatch(r"\d+(\.\d+)?", text):
        raise StatementError(UNREADABLE)
    try:
        value = _two_places(Decimal(text))
    except InvalidOperation as exc:
        raise StatementError(UNREADABLE) from exc
    return -value if negative else value


def _parse_date(raw: str) -> date | None:
    """dd/mm/aaaa (ou aa), aaaa-mm-dd, dd-mm-aaaa e dd.mm.aaaa. Qualquer outra coisa não é data."""
    text = raw.strip()
    match = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", text)
    if match:
        year, month, day = (int(part) for part in match.groups())
    else:
        match = re.fullmatch(r"(\d{2})[/.-](\d{2})[/.-](\d{4}|\d{2})", text)
        if not match:
            return None
        day, month, year = (int(part) for part in match.groups())
        if year < 100:
            year += 2000
    try:
        return date(year, month, day)
    except ValueError:
        return None


# ---------------------------------------------------------------------------------------- OFX

_BLOCK = re.compile(r"<STMTTRN>(.*?)(?=</STMTTRN>|<STMTTRN>|</BANKTRANLIST>|$)", re.I | re.S)
_TAG = re.compile(r"<([A-Za-z0-9.]+)>([^<\r\n]*)")


def _tags(block: str) -> dict[str, str]:
    found: dict[str, str] = {}
    for name, value in _TAG.findall(block):
        found.setdefault(name.upper(), value.strip())
    return found


def _parse_ofx(text: str) -> ParsedStatement:
    lines: list[StatementLine] = []
    for block in _BLOCK.findall(text):
        tags = _tags(block)
        posted = re.match(r"(\d{4})(\d{2})(\d{2})", tags.get("DTPOSTED", ""))
        if posted is None or "TRNAMT" not in tags:
            raise StatementError(UNREADABLE)
        try:
            day = date(*(int(part) for part in posted.groups()))
            amount = _two_places(Decimal(tags["TRNAMT"].replace(",", ".")))
        except (ValueError, InvalidOperation) as exc:
            raise StatementError(UNREADABLE) from exc
        names = [_clean(tags[key]) for key in ("NAME", "MEMO") if _clean(tags.get(key, ""))]
        description = " ".join(dict.fromkeys(names)) or _clean(tags.get("TRNTYPE", "")) or "—"
        lines.append(StatementLine(day, amount, description, tags.get("FITID") or None))
        if len(lines) > MAX_LINES:
            raise StatementError(_too_many())
    account = re.search(r"<ACCTID>([^<\r\n]*)", text, re.I)
    digits = re.sub(r"\D", "", account.group(1)) if account else ""
    return ParsedStatement("ofx", lines, digits or None)


# ---------------------------------------------------------------------------------------- CSV


def _plain(text: str) -> str:
    """Cabeçalho sem acento, em minúsculas e sem pontuação: "Lançamento" vira "lancamento"."""
    base = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9 ]", "", base.lower()).strip()


def _delimiter(text: str) -> str:
    sample = [line for line in text.splitlines() if line.strip()][:20]
    counts = {mark: sum(line.count(mark) for line in sample) for mark in (";", ",", "\t")}
    return max(counts, key=lambda mark: counts[mark])


def _column(headers: list[str], *names: str, skip: tuple[str, ...] = ()) -> int | None:
    for index, header in enumerate(headers):
        if header.startswith(names) and not header.startswith(skip):
            return index
    return None


def _parse_csv(text: str) -> ParsedStatement:
    rows = list(csv.reader(io.StringIO(text), delimiter=_delimiter(text)))
    for number, row in enumerate(rows):
        headers = [_plain(cell) for cell in row]
        when = _column(headers, "data")
        what = _column(headers, "lancamento", "historico", "descricao", "memo", "detalhe")
        value = _column(headers, "valor", skip=("saldo",))
        credit = _column(headers, "credito")
        debit = _column(headers, "debito")
        has_amount = value is not None or credit is not None or debit is not None
        if when is not None and what is not None and has_amount:
            return _csv_lines(rows[number + 1 :], when, what, value, credit, debit)
    raise StatementError(UNREADABLE)


def _cell(row: list[str], index: int | None) -> str:
    return row[index].strip() if index is not None and index < len(row) else ""


def _csv_lines(
    rows: list[list[str]],
    when: int,
    what: int,
    value: int | None,
    credit: int | None,
    debit: int | None,
) -> ParsedStatement:
    lines: list[StatementLine] = []
    for row in rows:
        day = _parse_date(_cell(row, when))
        if day is None:  # título, rodapé e linhas em branco
            continue
        amount: Decimal | None = None
        if value is not None:
            raw = _cell(row, value)
            amount = parse_amount(raw) if raw else None
        else:  # colunas separadas de crédito e débito: o crédito entra, o débito sai
            entry, exit_ = _cell(row, credit), _cell(row, debit)
            if entry or exit_:
                amount = Decimal("0")
                if entry:
                    amount += parse_amount(entry).copy_abs()
                if exit_:
                    amount -= parse_amount(exit_).copy_abs()
        if amount is None:  # linha de saldo: tem data, mas não tem valor
            continue
        lines.append(StatementLine(day, amount, _clean(_cell(row, what)) or "—"))
        if len(lines) > MAX_LINES:
            raise StatementError(_too_many())
    return ParsedStatement("csv", lines)


def _too_many() -> str:
    return f"O extrato tem mais de {MAX_LINES:,} linhas — importe por períodos menores".replace(
        ",", "."
    )


def parse_statement(content: bytes) -> ParsedStatement:
    """O extrato inteiro, ou `StatementError`. O formato vem do conteúdo, não do nome do arquivo."""
    text = _decode(content)
    parsed = _parse_ofx(text) if "<OFX" in text.upper() else _parse_csv(text)
    if not parsed.lines:
        raise StatementError(UNREADABLE)
    return parsed
