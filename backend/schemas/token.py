from pydantic import BaseModel


class Token(BaseModel):
    """Só o access token: o refresh vai em cookie HttpOnly, nunca no corpo."""

    access_token: str
    token_type: str
