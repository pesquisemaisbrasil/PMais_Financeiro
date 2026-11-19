import re
import unicodedata
from datetime import UTC, date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

# zoneinfo precisa do pacote `tzdata` (requirements.txt) em Windows e imagens slim,
# que não trazem o banco de fusos do sistema operacional.
SAO_PAULO_TZ = ZoneInfo("America/Sao_Paulo")


def format_brl(value: Decimal | float | int) -> str:
    """'R$ 1.234,56'."""
    quantized = Decimal(value).quantize(Decimal("0.01"))
    sign = "-" if quantized < 0 else ""
    formatted = f"{abs(quantized):,.2f}"
    formatted = formatted.replace(",", "_").replace(".", ",").replace("_", ".")
    return f"{sign}R$ {formatted}"


def format_brl_plain(value: Decimal | float | int) -> str:
    """'1.234,56', para colunas de CSV tituladas 'Valor (R$)'."""
    return format_brl(value).removeprefix("R$ ")


def format_date_br(value: date | datetime) -> str:
    """'dd/mm/aaaa'."""
    return value.strftime("%d/%m/%Y")


def format_datetime_br(value: datetime) -> str:
    """'dd/mm/aaaa HH:MM:SS' em America/Sao_Paulo. Um `value` sem fuso é tratado como UTC."""
    aware = value if value.tzinfo is not None else value.replace(tzinfo=UTC)
    return aware.astimezone(SAO_PAULO_TZ).strftime("%d/%m/%Y %H:%M:%S")


def launch_date(dt: datetime) -> date:
    """Dia em São Paulo de um instante. Perto da meia-noite UTC ainda é o dia anterior."""
    aware = dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)
    return aware.astimezone(SAO_PAULO_TZ).date()


def normalize(value: str | None) -> str:
    """Sem acento, sem caixa e sem espaços nas pontas, para comparar texto livre. '' se vazio."""
    if not value:
        return ""
    stripped = unicodedata.normalize("NFKD", value)
    without_accents = "".join(ch for ch in stripped if not unicodedata.combining(ch))
    return without_accents.casefold().strip()


def matches_words(text: str | None, search: str | None) -> bool:
    """A regra de toda busca do sistema (Bruno, 18/11/2026): cada palavra digitada aparece no
    texto, em qualquer pedaço e em qualquer ordem, sem acento e sem diferença de maiúscula
    ("certo PON" acha "Gráfica Ponto Certo"; "itau" acha "Itaú"). Busca vazia acha tudo."""
    haystack = normalize(text)
    return all(word in haystack for word in normalize(search).split())


_AMOUNT_BR = re.compile(r"^\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?$|^\d+(?:,\d{1,2})?$")
_AMOUNT_DOT = re.compile(r"^\d+\.\d{1,2}$")


def parse_search_amount(text: str) -> Decimal | None:
    """O valor que alguém digitou na busca ('588,22', 'R$ 1.200', '1200.5'), ou None se não é um
    valor. Ponto com três casas é milhar ('1.200' = 1200); com uma ou duas, é centavo ('1.20')."""
    cleaned = text.strip().removeprefix("R$").replace(" ", "")
    if _AMOUNT_BR.match(cleaned):
        return Decimal(cleaned.replace(".", "").replace(",", ".")).quantize(Decimal("0.01"))
    if _AMOUNT_DOT.match(cleaned):
        return Decimal(cleaned).quantize(Decimal("0.01"))
    return None


def csv_cell(value: str) -> str:
    """Célula que começa com = + - @ (ou TAB e CR) vira texto: a planilha não executa fórmula."""
    return f"'{value}" if value[:1] in ("=", "+", "-", "@", "\t", "\r") else value
