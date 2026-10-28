#!/usr/bin/env python3
"""Read the configured secret only in memory; exercise demo access without printing it."""
import json
import os
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

origin = "http://127.0.0.1:3000"
opener = build_opener(NoRedirect())
jar = {}
csrf = ""
def request(path, method="GET", body=None):
    headers = {"Cookie": "; ".join(f"{key}={value}" for key, value in jar.items()), "Content-Type": "application/json", "X-Pmais-CSRF": csrf}
    req = Request(origin + path, method=method, headers=headers, data=json.dumps(body).encode() if body is not None else None)
    try:
        response = opener.open(req, timeout=15)
    except HTTPError as error:
        response = error
    with response:
        for cookie in response.headers.get_all("Set-Cookie", []):
            name, value = cookie.split(";", 1)[0].split("=", 1)
            if value:
                jar[name] = value
            else:
                jar.pop(name, None)
        return response.code, response.headers, response.read()

assert request("/api/health")[0] == 200, "Servidor não está pronto"
assert request("/")[0] == 302, "Página sem sessão deve redirecionar"
assert request("/login")[0] == 200, "Tela de entrada indisponível"
code, headers, raw = request("/api/demo-access/session")
assert code == 200, "Acesso não configurado no processo"
state = json.loads(raw)
assert state["authenticated"] is False
csrf = state["csrf"]
secret = os.environ.get("PMAIS_DEMO_LOGIN_PASSWORD")
assert secret, "Senha não disponível neste ambiente; confirme o formulário protegido"
code, headers, raw = request("/api/demo-access/login", "POST", {"username": "adm", "password": secret})
assert code == 200 and json.loads(raw)["ok"] is True, "Credencial configurada não validou"
assert all(attr in " ".join(headers.get_all("Set-Cookie", [])) for attr in ["HttpOnly", "Secure", "SameSite=None", "Partitioned"])
code, _, raw = request("/api/demo-access/session")
state = json.loads(raw)
assert code == 200 and state["authenticated"] is True and state["scope"] == "demo_only"
csrf = state["csrf"]
assert request("/demo/contas")[0] == 200, "Página não abriu com sessão validada"
assert request("/api/admin/users")[0] == 503, "Acesso demo não pode conceder administração real"
assert request("/api/payments", "POST", {})[0] == 503, "Acesso demo não pode habilitar pagamento real"
assert request("/api/demo-access/logout", "POST", {})[0] == 200, "Logout não concluiu"
assert json.loads(request("/api/demo-access/session")[2])["authenticated"] is False, "Sessão não foi encerrada"
# Never show secret/response bodies/cookies. Check only for absence in client artifacts.
for directory in [Path("client/src"), Path("dist/public")]:
    for path in directory.rglob("*"):
        if path.is_file() and path.suffix in {".js", ".ts", ".tsx", ".css", ".html", ".json"}:
            assert secret.encode() not in path.read_bytes(), "Credencial indevidamente presente em artefato de cliente"
print("Acesso configurado: login, sessão, páginas, logout e bloqueios reais verificados.")
print("Cookies HTTPS/iframe verificados nos headers; senha ausente do código/bundle cliente.")
print("Esta é uma checagem HTTP local; não certifica políticas de cookies do navegador ou autenticação financeira.")
