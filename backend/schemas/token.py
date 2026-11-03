from pydantic import BaseModel, Field


class Token(BaseModel):
    """Só o access token: o refresh vai em cookie HttpOnly, nunca no corpo."""

    access_token: str
    token_type: str


class TokenWithRecoveryCodes(Token):
    recovery_codes: list[str]


class MfaChallenge(BaseModel):
    """Senha certa ainda não é login: este token só serve para terminar o segundo fator."""

    mfa_token: str
    token_type: str
    setup_required: bool


class MfaSetup(BaseModel):
    secret: str
    otpauth_uri: str


class MfaCode(BaseModel):
    # 6 dígitos do app ou um código de recuperação, com ou sem hífens
    code: str = Field(pattern=r"^[A-Za-z0-9 -]{6,32}$")
