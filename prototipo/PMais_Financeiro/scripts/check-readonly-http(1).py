#!/usr/bin/env python3
"""Checks the currently running read-only release; performs no business writes."""
import json
import sys
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError

origin = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:3000").rstrip("/")

def request(path, method="GET"):
    req = Request(origin + path, method=method)
    try:
        with urlopen(req, timeout=12) as response:
            return response.status, response.headers, response.read()
    except HTTPError as error:
        return error.code, error.headers, error.read()

code, headers, raw = request("/api/health")
assert code == 200 and json.loads(raw)["mode"] == "read_only"
policy = headers.get("Content-Security-Policy", "")
assert "default-src 'self'" in policy and "script-src" in policy and "connect-src" in policy
assert not headers.get("X-Frame-Options")
print("Health, CSP e embedding: verificados")

code, _, raw = request("/manus-routes.json")
manifest = json.loads(raw)
expected = json.loads((Path(__file__).resolve().parents[1] / "client/public/manus-routes.json").read_text())
assert code == 200 and manifest == expected
print(f"Manifesto: HTTP 200, {len(manifest['routes'])} rotas atuais")

code, headers, raw = request("/api/deployment/status")
status = json.loads(raw)
assert code == 200 and status["businessDataEnabled"] is False
assert status["security"]["accessEnabled"] is False
assert headers.get("Cache-Control") == "no-store"
print("Status real: banco=" + status["database"]["state"] + "; áreas protegidas bloqueadas")

for path in ["/api/auth", "/api/admin/users", "/api/audit", "/api/payments", "/api/uploads", "/api/trpc/auth.me", "/api/trpc/admin.users", "/api/trpc/finance.summary", "/oauth/token", "/integrations/v1/payments"]:
    code, _, _ = request(path)
    assert code == 503, (path, code)
print("Dez rotas protegidas: HTTP 503")

for path in ["/404", "/404?source=check"]:
    code, _, _ = request(path)
    assert code == 404, (path, code)
print("Página 404: status real confirmado")

code, headers, raw = request("/brand/Logo2025_branco.png")
assert code == 200 and raw.startswith(b"\x89PNG\r\n\x1a\n")
assert headers.get("Content-Type", "").startswith("image/png")
print("Cópia estática do logo oficial: PNG disponível; imagem não exibida")
print("Checagem concluída. Nenhuma operação real de negócio executada; o mockup é apenas local.")
