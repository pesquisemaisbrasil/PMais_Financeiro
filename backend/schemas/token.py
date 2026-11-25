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
    # senha inicial de primeiro acesso: a senha nova vem antes do autenticador
    password_change_required: bool = False


class InitialPassword(BaseModel):
    # a regra de força (schemas/user.validate_password_strength) é conferida na rota, para a
    # mensagem sair em uma frase só; aqui, só o teto, antes do hash
    password: str = Field(max_length=200)


class MfaSetup(BaseModel):
    secret: str
    otpauth_uri: str


class MfaCode(BaseModel):
    # 6 dígitos do app ou um código de recuperação, com ou sem hífens
    code: str = Field(pattern=r"^[A-Za-z0-9 -]{6,32}$")
