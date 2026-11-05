"""Normalização e máscara de chave Pix. Cópia da regra do Connect (`core/pix.py`).

A mesma chave pode ser digitada de jeitos diferentes ("123.456.789-09" e "12345678909",
"Fulano@Gmail.com" e "fulano@gmail.com"). Tudo que compara chave passa por aqui antes,
para que formas equivalentes virem o mesmo valor. Mudar esta regra muda os hashes que o
Connect guarda: só com combinação entre os dois sistemas.
"""

import re

_UUID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE
)
# Só dígitos e pontuação comum de documento/telefone.
_NUMERIC_KEY_RE = re.compile(r"^\+?[\d\s().\-/]+$")


def is_valid_cpf(digits: str) -> bool:
    if len(digits) != 11 or not digits.isdigit() or digits == digits[0] * 11:
        return False
    for size in (9, 10):
        total = sum(int(digits[i]) * (size + 1 - i) for i in range(size))
        check = (total * 10) % 11 % 10
        if check != int(digits[size]):
            return False
    return True


def normalize_pix_key(raw: str) -> str:
    """Forma canônica da chave:
    - e-mail: minúsculas, sem espaços nas pontas;
    - chave aleatória (UUID): minúsculas;
    - CPF (11 dígitos com dígito verificador válido) e CNPJ (14 dígitos): só dígitos;
    - telefone: E.164 (+55DDDNÚMERO), com "+" explícito, 12/13 dígitos começando em 55,
      ou 10/11 dígitos que não são CPF válido;
    - qualquer outra coisa: só sem espaços nas pontas.
    """
    key = raw.strip()
    if "@" in key:
        return key.lower()
    if _UUID_RE.match(key):
        return key.lower()
    if _NUMERIC_KEY_RE.match(key):
        digits = "".join(c for c in key if c.isdigit())
        if key.startswith("+"):
            return f"+{digits}"
        if len(digits) == 14:
            return digits  # CNPJ
        if len(digits) == 11 and is_valid_cpf(digits):
            return digits
        if len(digits) in (12, 13) and digits.startswith("55"):
            return f"+{digits}"
        if len(digits) in (10, 11):
            return f"+55{digits}"
        return digits
    return key


def mask_pix_key(normalized: str) -> str:
    """Chave para mostrar sem expor: e-mail mantém 3 letras e o domínio (`hmo***@gmail.com`);
    o resto mantém 3 no começo e 2 no fim; até 5 caracteres vira `***`."""
    if "@" in normalized:
        local, _, domain = normalized.partition("@")
        return f"{local[:3]}***@{domain}"
    if len(normalized) <= 5:
        return "***"
    return f"{normalized[:3]}***{normalized[-2:]}"
