"""O P+ Connect simulado: nos testes do Financeiro ele nunca é o de verdade."""

from services.connect_gateway import ConnectUnavailable, KeyMatch


class FakeConnect:
    """Conhece uma lista de chaves já normalizadas. `calls` guarda o que foi perguntado."""

    def __init__(self, known: dict[str, KeyMatch] | None = None, down: bool = False) -> None:
        self.known = known or {}
        self.down = down
        self.calls: list[tuple[int, dict[str, str]]] = []

    def match_pix_keys(self, connect_project_id: int, keys: dict[str, str]) -> dict[str, KeyMatch]:
        self.calls.append((connect_project_id, dict(keys)))
        if self.down:
            raise ConnectUnavailable
        return {
            ref: self.known.get(key, KeyMatch(interviewer_id=None, in_project=False))
            for ref, key in keys.items()
        }
