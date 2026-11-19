from pydantic import BaseModel


class SearchHit(BaseModel):
    title: str
    subtitle: str
    # Para onde o clique leva (a tela já aberta no item, ou o cadastro com a busca aplicada)
    href: str


class SearchGroup(BaseModel):
    key: str
    label: str
    # Quantos acharam no grupo; `hits` traz só os primeiros
    total: int
    # "Ver todos": a tela do grupo com a mesma busca
    moreHref: str
    hits: list[SearchHit]


class SearchResult(BaseModel):
    term: str
    # Só os grupos com resultado, na ordem da tela
    groups: list[SearchGroup]
