# Segurança e LGPD

O Financeiro guarda e mostra o dado mais sensível da operação: quem recebe, quanto e em qual chave Pix. Ele precisa nascer **no mesmo nível de segurança e LGPD do P+ Connect**, sem as lacunas que o Connect ainda tem. Este documento mostra o que o Connect faz hoje (com trecho real do código), o que o Financeiro copia e o que o Financeiro já deve fazer melhor.

Itens marcados **(proposta)** ainda não existem em nenhum dos dois sistemas.

Fontes no repositório do Connect: `backend/core/{security,crypto,pix,permissions,limiter,config,logging_config,storage}.py`, `backend/api/auth.py`, `backend/services/{auth,user,payment_sheet,finance,export_log,audit}.py`, `backend/models/{pii_access_log,export_log,refresh_token,consent_log}.py`, `.github/workflows/security.yml` e `docs/architecture/seguranca/**`.

## 1. Autenticação

### Como o Connect faz

| Item | Connect hoje | Onde |
|---|---|---|
| Login | `POST /token` (form `username` + `password`, formato OAuth2 password do FastAPI). `username` é o **CPF**; a busca é pelo HMAC do CPF, nunca em claro | `api/auth.py`, `services/auth.py: authenticate_user` |
| Senha | **bcrypt** via `passlib` (`deprecated="auto"` permite trocar de algoritmo depois). 8 a 72 caracteres, maiúscula, minúscula, número, especial, fora de lista de senhas comuns | `core/security.py`, `schemas/user.py: validate_password_strength` |
| Token de acesso | JWT **HS256** com **PyJWT**, assinado com `SECRET_KEY`. Claims: `sub` (id do usuário), `exp`. Validade `ACCESS_TOKEN_EXPIRE_MINUTES` = **15 min** | `services/auth.py: create_access_token` |
| Refresh token | JWT com `sub`, `exp`, `type: "refresh"`, `jti` aleatório. **7 dias**. No banco fica **só o SHA-256** (`refresh_tokens.token_hash`) | `services/auth.py`, `models/refresh_token.py` |
| Rotação | Cada `POST /token/refresh` revoga o refresh usado e emite um par novo | `rotate_refresh_token` |
| Logout | `POST /logout` marca o refresh como `revoked`. O access continua válido até expirar (máx. 15 min) | `api/auth.py` |
| Papel no token | **Não vai no token.** A cada requisição o usuário é lido do banco: promover, rebaixar ou desativar vale na hora | `get_current_user` |
| Conta desativada | Login e refresh devolvem o mesmo 401 genérico; rota autenticada devolve 400 "Usuário inativo" | `authenticate_user`, `get_current_active_user` |
| Rate limit | `slowapi` por IP: `/token` 5/min, `/token/refresh` 10/min, reset de senha 5/h e 10/h | `api/auth.py`, `core/limiter.py` |
| Esqueci a senha | Token de uso único, 1 h, resposta sempre igual (não revela se o e-mail existe), e-mail enviado em segundo plano para o tempo de resposta não denunciar | `api/auth.py`, `services/password_reset.py` |

Trechos reais:

```python
# services/auth.py
def authenticate_user(db: Session, cpf: str, password: str) -> User | None:
    user = get_user_by_cpf_hash(db, hash_cpf(cpf))
    if not user:
        return None
    if not verify_password(password, user.passwordHash):
        return None
    # inativo recebe o mesmo 401 genérico — não revela que a conta existe
    if user.status != "active":
        return None
    return user

def create_refresh_token(data: dict, expires_delta: timedelta | None = None) -> str:
    ...
    to_encode.update({"exp": expire, "type": "refresh", "jti": uuid.uuid4().hex})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

# get_current_user: refresh token nunca serve como token de acesso
if user_id is None or payload.get("type") == "refresh":
    raise credentials_exception
```

### Troca de senha, e-mail e chave Pix

Quando o **próprio dono** troca senha, e-mail ou uma chave Pix já cadastrada, o Connect exige a senha atual, avisa o dono e, na troca de senha, derruba todas as sessões:

```python
# services/user.py: update_user (encurtado)
if actor_id == db_user.id and (user.password is not None or email_changed or pix_changed):
    if not user.currentPassword or not verify_password(
        user.currentPassword, db_user.passwordHash
    ):
        raise CurrentPasswordRequired
if user.password is not None:
    db.query(RefreshToken).filter(
        RefreshToken.user_id == db_user.id, RefreshToken.revoked.is_(False)
    ).update({"revoked": True})
if email_changed or pix_changed:
    notify(db, [db_user.id], type="account_security",
           title=f"Seu {changed} foi alterado", ...)
```

### O que o Financeiro faz

| Item | Financeiro |
|---|---|
| Login | **E-mail** + senha (a equipe do Financeiro não precisa de CPF para entrar; não guardar CPF de usuário interno). Mensagem única "E-mail ou senha incorretos" **(proposta)** |
| Senha | bcrypt com `passlib`, mesma regra de força do Connect (copiar `validate_password_strength`) |
| Tokens | Mesmo par: access 15 min + refresh rotativo com hash no banco. Somar ao que o Connect não tem **(proposta)**: claims `iss` e `aud` validados; `kid` para trocar `SECRET_KEY` sem derrubar todos; `family_id` no refresh para detectar reuso (token revogado reapareceu → revoga a família inteira) |
| Onde o token fica | **Não** em `localStorage` (lacuna A1/R4 do Connect). Refresh em cookie `HttpOnly; Secure; SameSite=Strict; Path=/auth`; access só em memória **(proposta)** |
| Papel | Lido do banco a cada requisição, como no Connect |
| Conta desativada | Login e refresh: 401 genérico. Ao desativar, revogar todos os refresh tokens da conta (o Connect só bloqueia, não revoga: A3) |
| Reautenticação | Trocar senha, e-mail ou MFA exige senha atual; avisar o dono por e-mail e no app; trocar senha revoga sessões |
| Rate limit | `/auth/token` 5/min por IP **e** 10/h por e-mail; storage Redis (o do Connect é em memória e zera no restart: A4) **(proposta)** |
| Último login | Gravar `lastSignedInAt`, IP e user-agent (o Connect não grava: A10) **(proposta)** |

## 2. Autorização (RBAC)

### Como o Connect faz

Papéis fixos em `users.role`: `user` (entrevistador), `supervisor`, `admin`, `financeiro`. Helpers em `core/permissions.py`, chamados no começo de cada rota:

```python
# core/permissions.py (encurtado)
def require_supervisor(current_user: User) -> None:
    if current_user.role not in ("admin", "supervisor"):
        raise HTTPException(403, detail="Acesso de administrador ou supervisor é necessário")

def require_admin(current_user: User) -> None: ...          # só admin

def require_finance(current_user: User) -> None:
    """Área Financeiro do projeto (resumo, comprovantes, baixa)."""
    if current_user.role not in ("admin", "supervisor", "financeiro"):
        raise HTTPException(403, detail="Acesso ao Financeiro é necessário")

def require_payment_sheet(current_user: User) -> None:
    """Planilha de pagamentos (tem a chave Pix completa): só admin e financeiro."""
    if current_user.role not in ("admin", "financeiro"):
        raise HTTPException(403, ...)

def can_edit_budget(current_user: User) -> bool:
    """Admin e financeiro sempre; supervisor só com a permissão ligada pelo admin."""
    return current_user.role in ("admin", "financeiro") or bool(current_user.canEditBudget)
```

- **Permissão por usuário** além do papel: `users.canEditBudget` (ADR 0006).
- **Dono do recurso**: checagem inline `if current_user.id != user_id and current_user.role != "admin": 403`. Hoje o Connect devolve **403** quando o recurso é de outro, e **404** só quando o recurso não existe (`api/user.py`, `api/finance.py: _project_or_404`, `_batch_or_404`).
- Lote de comprovantes de outro projeto devolve 404 (busca por `batch_id` **e** `project_id`), o que já esconde a existência.
- Frontend esconde telas por papel, mas **toda** decisão é refeita no backend.

### O que o Financeiro faz

| Regra | Financeiro |
|---|---|
| Papéis | `financeiro` (usuário principal), `admin`. `supervisor` só se o PO decidir (pergunta aberta no `01`) |
| Onde checar | Como **dependência FastAPI** na assinatura: `Depends(require_role("financeiro", "admin"))`, `Depends(require_permission("approve_payment"))`. O Connect mistura helper e `if` inline (lacuna Z5) **(proposta)** |
| Permissão fina | Tabela `user_permissions(user_id, permission)` em vez de uma coluna booleana por permissão (ADR 0006 já prevê reavaliar). Ex.: `confirm_payment`, `download_payment_sheet`, `manage_service_clients` **(proposta)** |
| Recurso de outro escopo | **404**, nunca 403, quando a pessoa não pode saber que o recurso existe (lote de outro projeto, comprovante de outro lote). 403 só quando ela sabe que existe, mas o papel não permite a ação |
| Segregação de funções | Quem envia o lote não confirma a baixa do mesmo lote, a partir de um valor a definir pelo PO **(proposta, decisão de produto)** |
| Último admin | Bloquear rebaixar/desativar o último admin (lacuna Z4) |
| Troca de papel | Log append-only `role_change_logs` (lacuna Z3) |
| Testes | Toda rota nova: teste com cada papel, sem token, token expirado, conta inativa e recurso de outro escopo |

## 3. Criptografia de campo

### Como o Connect faz

| Dado | Técnica | Código |
|---|---|---|
| CPF | **HMAC-SHA256** com `CPF_SECRET_KEY`, só dígitos. Não existe CPF em claro nem cifrado (ADR 0003) | `core/security.py: hash_cpf` |
| Chave Pix (comparar/unicidade) | **HMAC-SHA256** com `PIX_SECRET_KEY` da chave **normalizada** | `core/security.py: hash_pix`, `core/pix.py: normalize_pix_key` |
| Chave Pix (ler para pagar) | **AES-256-GCM** com `ENCRYPTION_KEY` (32 bytes em base64), nonce de 12 bytes por valor | `core/crypto.py` |
| Nome do recebedor no comprovante | AES-256-GCM (`payeeNameEncrypted`) | `models/payment_receipt.py` |
| Chave Pix para exibir | Máscara (`payeeKeyMasked`, `mask_pix_key`) | `services/finance.py` |
| Token de refresh / reset | SHA-256 | `core/security.py: hash_token` |

```python
# core/crypto.py
def _get_aesgcm() -> AESGCM:
    key = base64.b64decode(ENCRYPTION_KEY)
    if len(key) != 32:
        raise ValueError("ENCRYPTION_KEY precisa decodificar pra 32 bytes (AES-256)")
    return AESGCM(key)

def encrypt_payload(plaintext: str) -> str:
    nonce = os.urandom(_NONCE_SIZE)  # 12 bytes
    ciphertext = _get_aesgcm().encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ciphertext).decode()

# core/security.py
def hash_pix(pix_key: str) -> str:
    normalized = normalize_pix_key(pix_key)
    return hmac.new(PIX_SECRET_KEY.encode(), normalized.encode(), hashlib.sha256).hexdigest()
```

`normalize_pix_key` (`core/pix.py`) põe a chave na forma canônica antes do HMAC, para "123.456.789-09" e "12345678909" darem o mesmo hash:

| Tipo inferido | Forma canônica |
|---|---|
| e-mail (tem `@`) | minúsculas, sem espaço nas pontas |
| chave aleatória (UUID) | minúsculas |
| CNPJ (14 dígitos) | só dígitos |
| CPF (11 dígitos com DV válido) | só dígitos |
| telefone com `+` | `+` + dígitos |
| 12/13 dígitos começando em 55 | `+55...` |
| 10/11 dígitos que não são CPF válido | `+55` + dígitos |
| outro | só `strip()` |

```python
# services/finance.py
def mask_pix_key(normalized: str) -> str:
    """e-mail mantém 3 letras + domínio (`hmo***@gmail.com`);
    o resto mantém 3 no começo e 2 no fim."""
    if "@" in normalized:
        local, _, domain = normalized.partition("@")
        return f"{local[:3]}***@{domain}"
    if len(normalized) <= 5:
        return "***"
    return f"{normalized[:3]}***{normalized[-2:]}"
```

### O que o Financeiro faz

- **Copiar** `core/pix.py` e `mask_pix_key` **idênticos** (com os mesmos testes). Se a normalização divergir, o comprovante deixa de casar com a pessoa.
- **Não guardar a chave Pix completa.** Ela vem do Connect sob demanda (ver `07`), vive só em memória durante a geração da planilha e não vai para o banco, log nem cache.
- Para conciliar o comprovante, o Financeiro guarda `payeeKeyHash` com **a própria** `PIX_SECRET_KEY` (detectar comprovante repetido) e a máscara. Para descobrir **de quem** é a chave lida no PDF, pergunta ao Connect (`POST /integrations/v1/pix-key-matches`, ver `07`): o Connect calcula o hash com a `PIX_SECRET_KEY` dele e devolve só o `interviewerId`. Assim nenhum dos dois precisa compartilhar chave de HMAC nem copiar a base de chaves **(proposta)**.
- **CPF:** o Financeiro não precisa de CPF. Se algum dia precisar (nota fiscal, informe), só HMAC com `CPF_SECRET_KEY` própria, nunca em claro (ADR 0003).
- Campos sensíveis que o Financeiro gerar (nome do recebedor lido no comprovante, observações de divergência) com AES-256-GCM e `ENCRYPTION_KEY` **própria**, diferente da do Connect.
- **(proposta)** Usar o argumento `associated_data` do AES-GCM com `tabela:coluna:id` da linha, para um valor cifrado não poder ser copiado para outra linha. O Connect passa `None`.
- **(proposta)** Prefixo de versão no valor cifrado (`v1:` + base64) para permitir rotação da chave.

## 4. Cofre de arquivos (comprovantes e anexos)

Hoje o Connect **não guarda** o PDF do comprovante (ADR 0002): lê em memória, extrai os campos mínimos e descarta. Se o Financeiro passar a guardar comprovantes ou anexos, **só neste cofre e só depois da decisão do DPO sobre retenção** (pergunta aberta). O desenho abaixo é o mesmo planejado para os contratos assinados do Connect (plano do contrato ZapSign, Fase 2b), ainda **não implementado** em nenhum dos dois: tudo nesta seção é **(proposta)**.

### Duas camadas

| Camada | Onde | Protege contra |
|---|---|---|
| SSE-KMS no MinIO, chaves no **KES** ligado a um cofre de chaves | Servidor MinIO | Disco roubado, snapshot do volume |
| **Envelope encryption** no backend, AES-256-GCM, chave-mestra `FILES_MASTER_KEY` | Backend do Financeiro | Quem tem acesso ao MinIO, ao backup ou ao KES, mas não ao backend |

### Envelope encryption (por arquivo)

1. Gera uma **DEK** nova de 256 bits (`os.urandom(32)`) para cada arquivo.
2. Cifra o arquivo com AES-256-GCM, nonce aleatório de 96 bits.
3. Cifra a DEK com `FILES_MASTER_KEY` (32 bytes em base64, **diferente** da `ENCRYPTION_KEY`), também AES-GCM.
4. Sobe só os bytes cifrados. Nos metadados do objeto: DEK cifrada, nonces, `keyVersion`, `sha256` do arquivo original.
5. No banco: `fileKey`, `fileSha256`, `storedAt`. O arquivo nunca vai para o banco nem para o log.
6. Na leitura: decifra a DEK, decifra o arquivo, **confere o sha256 e falha fechado** se não bater.
7. Rotação: nova `FILES_MASTER_KEY` com `keyVersion` novo; recifra só as DEKs, não os arquivos.

```python
# core/file_vault.py (proposta, esboço)
def store_file(kind: str, owner_id: int, data: bytes) -> StoredFile:
    dek = os.urandom(32)
    nonce = os.urandom(12)
    ciphertext = AESGCM(dek).encrypt(nonce, data, f"{kind}:{owner_id}".encode())
    dek_nonce = os.urandom(12)
    wrapped_dek = AESGCM(_master_key(CURRENT_KEY_VERSION)).encrypt(dek_nonce, dek, None)
    key = f"{kind}/{owner_id}/{uuid.uuid4().hex}.bin"
    _client().put_object(
        Bucket=FILES_BUCKET, Key=key, Body=ciphertext,
        Metadata={
            "dek": b64(wrapped_dek), "dek-nonce": b64(dek_nonce), "nonce": b64(nonce),
            "key-version": str(CURRENT_KEY_VERSION), "sha256": sha256(data).hexdigest(),
        },
    )
    return StoredFile(key=key, sha256=sha256(data).hexdigest())
```

### Leitura

- **Nunca** URL pública nem pré-assinada para arquivo do cofre (diferente de foto do Connect, que usa URL assinada de 5 min).
- Rota que decifra no backend e devolve em streaming, com `Content-Disposition: attachment` e `Cache-Control: no-store`.
- Cada leitura vira linha em `pii_access_logs` (campo `receiptFile`).
- Upload: checar assinatura (`%PDF`), recusar PDF criptografado, limite de tamanho por parte, como o Connect já faz no lote de comprovantes.

### MinIO: bucket próprio, endurecido

Bucket e usuário **próprios** do Financeiro. Credenciais diferentes das do Connect.

```bash
# alias de administração (fora do backend; credencial root só para isso)
mc alias set pf https://minio.interno:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD"

# bucket com Object Lock (exige versionamento; já liga)
mc mb --with-lock pf/financeiro-arquivos
mc version enable pf/financeiro-arquivos
mc retention set --default GOVERNANCE "<prazo do DPO>" pf/financeiro-arquivos

# sem acesso anônimo
mc anonymous set none pf/financeiro-arquivos

# criptografia no servidor com chave do KES
mc encrypt set sse-kms financeiro-arquivos-key pf/financeiro-arquivos

# política mínima do backend: grava e lê, sem apagar, sem listar outros buckets
cat > financeiro-rw.json <<'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject"],
    "Resource": ["arn:aws:s3:::financeiro-arquivos/*"]
  }]
}
EOF
mc admin policy create pf financeiro-rw financeiro-rw.json
mc admin user add pf "$FILES_ACCESS_KEY" "$FILES_SECRET_KEY"
mc admin policy attach pf financeiro-rw --user "$FILES_ACCESS_KEY"
```

Além dos comandos:

- **TLS obrigatório** no MinIO (certificado em `~/.minio/certs`); backend fala `https://`.
- **Auditoria do MinIO** ligada (`MINIO_AUDIT_WEBHOOK_*`) para esse bucket.
- **Backup** do bucket com `mc mirror` para outro servidor. Sai cifrado pela camada do backend.
- **Dev:** o `docker compose` cria o bucket com lock e versionamento. SSE-KMS é opcional em dev; a camada do backend vale sempre.
- Sem `s3:DeleteObject`: arquivo errado é marcado como descartado no banco, não apagado. Expurgo, quando o DPO definir o prazo, roda com outra credencial, por script auditado.

## 5. Logs sem dado pessoal

### Como o Connect faz

- JSON em stdout (`core/logging_config.py`). O middleware de acesso grava só `method`, `path`, `status_code`, `duration_ms`. Sem query string, sem corpo, sem header.
- Engine do SQLAlchemy com `hide_parameters=True` (`db/connection.py`): erro de banco não leva os valores para o log.
- Erro inesperado loga o **tipo** da exceção e o id interno, não o conteúdo: `logger.error("Erro inesperado ao enviar WhatsApp (entrega %s): %s", delivery.id, type(exc).__name__)`.

### Regra para o Financeiro

| Pode logar | Nunca logar |
|---|---|
| ids internos (`batchId`, `receiptId`, `interviewId`, `projectId`) | chave Pix (completa ou mascarada), CPF, nome de pessoa |
| método, rota (sem query), status, duração | texto extraído de PDF, conteúdo de arquivo |
| tipo da exceção, código de erro do fornecedor | corpo de request/response da integração com o Connect |
| `X-Event-Id`, `Idempotency-Key`, `client_id` da conta de serviço | token, senha, segredo, assinatura HMAC, `Authorization` |
| contagens e valores agregados de um lote | e-mail e telefone; e2eId junto com nome |

- Valor de um pagamento individual com id interno pode ir para log de auditoria (banco), não para log técnico.
- Copiar `JsonFormatter` e `hide_parameters=True`. Teste automático **(proposta)**: um teste que roda um fluxo de baixa com dados fictícios e falha se algum dado de teste aparecer no `caplog`.

## 6. Auditoria

### Como o Connect faz

Tabelas **append-only**, com `ondelete="RESTRICT"` no autor para a trilha não sumir:

| Tabela | O que grava | Exemplo de uso |
|---|---|---|
| `pii_access_logs` | `accessed_user_id`, `accessed_by_user_id`, `fields` (ex.: `["pixKey"]`), `accessedAt` | Admin vendo conta de outro; cada chave Pix na planilha de pagamentos |
| `export_logs` | `user_id`, `export_type`, `filters`, `row_count`, `createdAt`. **Uma linha por exportação** | Planilha de pagamentos (`export_type="payment_sheet"`) |
| `consent_logs` | aceite de termos, versão; `SET NULL` ao apagar a conta (prova sobrevive) | Cadastro |
| `budget_change_logs` | orçamento antigo e novo, quem mudou | ADR 0006 |
| `*_status_logs` | transições de ficha, lead, candidatura | — |

```python
# services/payment_sheet.py: build_payment_sheet (encurtado)
for row in rows:
    if row.pix_key and row.user_id != requested_by_user_id:
        db.add(PiiAccessLog(accessed_user_id=row.user_id,
                            accessed_by_user_id=requested_by_user_id, fields=["pixKey"]))
record_export(db, user_id=requested_by_user_id, export_type="payment_sheet",
              filters={"project_id": project.id}, row_count=len(rows))
```

`services/audit.py` junta tudo numa linha do tempo só para admin (`/admin/auditoria`), com cursor estável. Lacuna do Connect: upload e confirmação de lote ainda não entram na linha do tempo; troca de chave Pix só gera notificação, sem log append-only.

### O que o Financeiro registra

| Evento | Tabela | Campos mínimos |
|---|---|---|
| Busca de chave Pix completa no Connect | `pii_access_logs` | `interviewerId` (do Connect), `accessedBy`, `fields=["pixKey"]`, `purpose` (`payment_sheet`), `requestId` |
| Download de planilha | `export_logs` | `userId`, `exportType`, `filters`, `rowCount` |
| Lote: criado, parte enviada, confirmado, descartado | `finance_audit_events` **(proposta)** | `batchId`, `projectId`, ação, autor, totais |
| Baixa pedida ao Connect e resposta | `finance_audit_events` | `Idempotency-Key`, `interviewIds`, valor, status HTTP |
| Cancelamento de baixa | `finance_audit_events` | motivo (texto controlado), autor, aprovador |
| Leitura de arquivo do cofre | `pii_access_logs` | `fields=["receiptFile"]` |
| Troca de papel/permissão | `role_change_logs` | antes, depois, autor |
| Conta de serviço criada/girada/desativada | `service_client_logs` | sem o segredo |

Regras: append-only (sem `UPDATE`/`DELETE` pela aplicação; **(proposta)** `REVOKE UPDATE, DELETE` desses grupos de tabela para o usuário do app no Postgres); autor com `RESTRICT`; tela de auditoria só para admin, com cursor como `services/audit.py`.

## 7. Exportação de planilha

A planilha é o único lugar onde a chave Pix aparece completa. Regras do Connect que o Financeiro copia:

- Só `admin` e `financeiro` baixam (`require_payment_sheet`).
- Cada chave decifrada vira `pii_access_logs`; o download vira `export_logs`.
- **Sem CPF** (ADR 0003). Se a chave for do tipo CPF, o número já é a chave.
- Dinheiro como `Decimal`; datas no fuso de São Paulo (`launch_date`).
- **Injeção de fórmula:** toda célula com texto vindo de usuário (nome, chave, título do projeto) é forçada a texto:

```python
# services/payment_sheet.py
for line in ws.iter_rows(min_row=2):
    # Texto vindo do usuário (nome, chave Pix, título do projeto) fica como
    # texto literal: sem isso, um valor começando com "=" vira fórmula no
    # Excel (injeção de fórmula). Não prefixa com "'" para a chave Pix de
    # celular (+55...) continuar copiável como está.
    for cell in (line[0], line[1], line[2], line[8]):
        if isinstance(cell.value, str):
            cell.data_type = "s"
```

Para **CSV** (não há tipo de célula), o Financeiro prefixa `'` em todo texto que começa com `=`, `+`, `-`, `@`, tab ou CR **(proposta)**. Teste com nome `=HYPERLINK(...)` obrigatório.

- Resposta com `Cache-Control: no-store` e `Content-Disposition: attachment` **(proposta: o Connect não define `no-store`)**.
- Nome do arquivo sem dado pessoal: `pagamentos-projeto-{id}-{data}.xlsx`.

## 8. Segredos

| Variável (Financeiro) | Uso | Se vazar |
|---|---|---|
| `SECRET_KEY` | Assina JWT de usuário | Forja sessão de qualquer pessoa |
| `ENCRYPTION_KEY` | AES-GCM de campo | Com dump, lê nomes e campos cifrados |
| `PIX_SECRET_KEY` | HMAC de chave Pix | Força bruta de chaves contra os hashes |
| `FILES_MASTER_KEY` | Embrulha as DEKs do cofre | Com acesso ao bucket, abre os arquivos |
| `FILES_ACCESS_KEY` / `FILES_SECRET_KEY` | Usuário MinIO do Financeiro | Lê/grava o bucket (sem apagar) |
| `DATABASE_URL` | Usuário Postgres próprio do Financeiro | Lê o banco do Financeiro, não o do Connect |
| `CONNECT_CLIENT_ID` / `CONNECT_CLIENT_SECRET` | Conta de serviço no Connect | Chama a API do Connect com os escopos dela |
| `CONNECT_WEBHOOK_SECRET` | Confere `X-Signature` dos eventos | Forja eventos do Connect |

Regras:

- Tudo por variável de ambiente; o app **não sobe** sem elas (`os.environ["..."]`, como em `core/config.py` do Connect). `.env.example` só com placeholders.
- Cada segredo é **único por sistema e por ambiente**. Nada compartilhado com o Connect, exceto o segredo do webhook (combinado por canal seguro).
- **Gitleaks no CI**, varrendo o histórico inteiro, em todo PR para a `main`. Copiar o job do Connect (CLI, não a action paga; ADR 0007):

```yaml
# .github/workflows/security.yml (Connect)
- name: Gitleaks (segredo commitado no histórico)
  env:
    GITLEAKS_VERSION: "8.30.1"
  run: |
    curl -sSfL "https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_linux_x64.tar.gz" | tar -xz gitleaks
    ./gitleaks git --redact --no-banner --exit-code 1 .
```

- Falso positivo vai para `.gitleaksignore` com comentário do motivo (`commit:arquivo:regra:linha`), nunca desligando a regra.
- **Rotação** **(proposta)**: `SECRET_KEY` com `kid` (duas chaves na transição); segredo de conta de serviço girado a cada 90 dias e na saída de alguém da equipe; `ENCRYPTION_KEY` e `FILES_MASTER_KEY` com versão no valor cifrado. `PIX_SECRET_KEY` não gira sem recalcular os hashes, igual à `CPF_SECRET_KEY` do Connect: tratar como permanente e guardar com backup próprio.
- Sem credencial padrão no `docker-compose.yml` de produção (o Connect ainda tem `POSTGRES_PASSWORD: "1234"` e `minioadmin` no compose de dev: R9).

## 9. Dependências

Copiar o workflow `security.yml` do Connect:

| Job | Comando | Falha quando |
|---|---|---|
| Backend | `pip-audit -r requirements.txt` | Vulnerabilidade conhecida. Ignorar só com `--ignore-vuln ID` e comentário do motivo (o Connect ignora CVEs do starlette travado pelo fastapi) |
| Frontend | `npm audit --omit=dev --audit-level=high` | Nível alto ou crítico em dependência de produção |
| Segredos | Gitleaks CLI | Qualquer segredo no histórico |

Somar **(proposta)**: versões fixas de `ruff`, `mypy` e `pre-commit` (o Connect não fixa); Dependabot ou Renovate semanal; imagem Docker base com tag fixa.

## 10. Headers HTTP e MFA

No Connect, **os dois estão pendentes** (`docs/architecture/seguranca/headers-e-mfa-pendente.md`). O Financeiro já nasce com eles.

### Headers (API e frontend)

| Header | Valor | Onde |
|---|---|---|
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` | API e frontend (só em HTTPS) |
| `X-Content-Type-Options` | `nosniff` | API e frontend |
| `X-Frame-Options` | `DENY` | API e frontend |
| `Referrer-Policy` | `strict-origin-when-cross-origin` (ou `no-referrer` na API) | API e frontend |
| `Content-Security-Policy` | `default-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'` + `connect-src` só para a própria API; nonce para script | Frontend |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Frontend |
| `Cache-Control` | `no-store` em toda rota autenticada da API | API |
| `Cross-Origin-Opener-Policy` | `same-origin` | Frontend |

Esboço do middleware (mesmo padrão do Connect):

```python
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers.setdefault("Cache-Control", "no-store")
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response
```

Também desde o primeiro dia: `/docs` e `/openapi.json` **desligados em produção** (`FastAPI(docs_url=None, openapi_url=None)` quando `ENVIRONMENT=production`; no Connect estão públicos); CORS só com a origem do frontend do Financeiro.

### MFA (TOTP) obrigatório para `admin` e `financeiro`

Quem gera a planilha com chave Pix completa e confirma pagamentos é o alvo mais valioso (R11 do RIPD). Fluxo **(proposta, baseado no desenho pendente do Connect)**:

1. `pyotp`. Campo `totpSecretEncrypted` (AES-GCM, nunca em claro) e `mfaEnabledAt` no usuário.
2. Primeiro login de `admin`/`financeiro` obriga a cadastrar o MFA antes de qualquer outra tela.
3. `POST /auth/token` devolve um token **parcial** (`type: "mfa_pending"`, 5 min) quando há MFA; `POST /auth/token/mfa` recebe o token parcial + código de 6 dígitos e só então emite o par de tokens.
4. Rate limit 5/min em `/auth/token/mfa`; bloqueio temporário após 10 erros seguidos.
5. Códigos de recuperação de uso único, guardados como hash.
6. Reautenticação com MFA para ações críticas: gerar planilha com Pix completo, confirmar baixa, cancelar baixa, criar conta de serviço.
7. Reset de MFA só por outro admin, com log e aviso ao dono.

## 11. Backups

- Postgres do Financeiro com `pg_dump -Fc` automático (diário) e restore **testado** todo mês; cópia cifrada fora do servidor **(proposta)**.
- Bucket do cofre com `mc mirror` para outro servidor.
- **Chaves separadas do backup.** Sem `ENCRYPTION_KEY`, `PIX_SECRET_KEY` e `FILES_MASTER_KEY` originais o backup não serve; com elas junto, o backup vira vazamento. Mesma regra do Connect (`docs/operations/bootstrap.md`).
- Retenção dos backups segue a retenção definida pelo DPO: dado expurgado não pode viver para sempre no backup.

## 12. LGPD

### Bases legais (propostas, validar com o DPO)

| Operação no Financeiro | Base legal proposta | Referência no ROPA do Connect |
|---|---|---|
| Pagar entrevistador (valor, chave Pix sob demanda) | Art. 7 V (execução de contrato) e art. 7 II (obrigação legal/fiscal) | OP-04, OP-08 |
| Conciliação por comprovante (nome do recebedor cifrado, chave como hash) | Art. 7 V e II (prova de pagamento) | Pendente no ROPA (`seguranca/financeiro.md`) |
| Guardar comprovante no cofre (se o DPO aprovar) | Art. 7 II e VI (exercício de direitos em processo) | Nova operação |
| Logs e auditoria | Art. 7 IX + art. 46; Marco Civil art. 15 (6 meses para registro de acesso) | OP-09 |

### Minimização

- Não copiar do Connect: CPF, endereço, documento, telefone, e-mail do entrevistador, chave Pix.
- Espelho mínimo por id (entrevista, pessoa, projeto, valor, data prevista, status) e o nome de exibição, se a tela precisar.
- Do comprovante, só o que o Connect já guarda (ADR 0002): hash e máscara da chave, nome cifrado, valor, data, `e2eId`. Descartar CPF do recebedor, agência/conta e bloco do pagador.
- Campo novo guardado = justificativa de finalidade + inventário de dados + ROPA **no mesmo PR**.

### ROPA e RIPD

- O Financeiro tem **o próprio** inventário de dados, ROPA e RIPD, no mesmo modelo de `docs/architecture/seguranca/` do Connect.
- No ROPA do Connect, a OP-04 passa a citar o Financeiro como destinatário interno da chave Pix (sob demanda, auditado).
- RIPD do Financeiro avalia no mínimo: vazamento de chave Pix pela planilha, conta `financeiro` comprometida, conta de serviço comprometida, evento forjado, pagamento duplicado.

### Retenção

**Pendente com o DPO.** Até a decisão: nada é apagado automaticamente (exceto lote cancelado, apagado na hora, como no Connect); o bucket nasce com Object Lock em *governance*. Referência proposta no ROPA do Connect: 5 anos após o pagamento (CTN art. 173/174) para dados de pagamento; 6 meses para logs HTTP; 5 anos para trilhas de auditoria. Implementar o expurgo num módulo único (`core/retention.py`) quando os prazos forem aprovados.

### Direitos do titular

O entrevistador não usa o Financeiro, mas é titular. **(proposta)**:

- Acesso: o Connect já mostra "Pago em" e ganhos; o Financeiro expõe ao Connect, pela integração, o que precisar para "Meus pagamentos".
- "Quem viu meus dados": o Connect já tem `GET /users/{id}/pii-access-log`. Buscas de chave Pix feitas pelo Financeiro também ficam registradas **no Connect** (a rota de dados de pagamento grava `pii_access_logs` lá), então o titular vê tudo num lugar só.
- Eliminação: pedido chega pelo Connect; o Financeiro mantém só o que tiver obrigação legal (pagamento) e anonimiza o resto.

### Operadores

Provedor de hospedagem, ZapSign (contratos, no Connect), Zenvia (WhatsApp, no Connect), Itaú (banco, fora do sistema). Todo novo operador do Financeiro entra no ROPA com contrato de operador.

## 13. Lacunas conhecidas do Connect: não repetir

| Lacuna no Connect | Referência | No Financeiro |
|---|---|---|
| Tokens em `localStorage` | A1 / R4 | Refresh em cookie `HttpOnly`, access em memória |
| Sem detecção de reuso de refresh | A2 | `family_id` e revogação da família |
| Desativar conta não revoga refresh tokens | A3 | Revogar ao desativar |
| Rate limit em memória, por IP | A4 | Redis + limite por e-mail no login |
| Sem MFA para admin | A5 / R11 | MFA obrigatório para `admin` e `financeiro` |
| JWT sem `iss`/`aud`/`kid` | A7 | Validar `iss`/`aud`; `kid` para rotação |
| `lastSignedIn` nunca gravado | A10 | Gravar último login |
| Supervisor global, sem escopo por projeto | Z1 / R5 | Escopo por projeto desde o início, se o supervisor entrar |
| Troca de papel sem log | Z3 | `role_change_logs` |
| Último admin pode ser rebaixado | Z4 | Bloquear |
| Checagem de permissão espalhada (helper + `if` inline) | Z5 | Sempre `Depends(...)` na assinatura |
| Sem headers de segurança HTTP | `headers-e-mfa-pendente.md` | Middleware desde o primeiro commit |
| `/docs` e `/openapi.json` públicos | `seguranca/financeiro.md` | Desligados em produção |
| Credenciais padrão no compose | R9 | Sem padrão; app não sobe sem segredo |
| Retenção indefinida, sem rotina de expurgo | R7 | Módulo de retenção pronto para receber os prazos do DPO |
| Troca de chave Pix sem log append-only | `resumo.md` | Evento `interviewer.pix_changed` registrado (ver `07`) |
| Upload/confirmação de lote fora da auditoria | `seguranca/financeiro.md` | `finance_audit_events` desde o início |
| `ruff`/`mypy`/`pre-commit` sem versão fixa | `resumo.md` | Versões fixas |

## Checklist

- [ ] Login por e-mail + senha com bcrypt (`passlib`) e a mesma regra de força de senha do Connect.
- [ ] JWT PyJWT HS256 com `exp`, `iss`, `aud` e `kid` validados; access de 15 min; refresh rotativo com só o SHA-256 no banco e `family_id`.
- [ ] Refresh token em cookie `HttpOnly; Secure; SameSite=Strict`; nenhum token em `localStorage`.
- [ ] Conta inativa: login e refresh com 401 genérico; desativar revoga todos os refresh tokens.
- [ ] Troca de senha/e-mail/MFA exige senha atual, avisa o dono e (senha) revoga as sessões.
- [ ] Rate limit com Redis: login por IP e por e-mail; `/auth/token/mfa` 5/min.
- [ ] MFA TOTP obrigatório para `admin` e `financeiro`, com reautenticação em ação crítica.
- [ ] Permissões como `Depends(...)` na assinatura; recurso de outro escopo devolve 404; teste com cada papel + sem token + inativo.
- [ ] `core/pix.py` e `mask_pix_key` copiados idênticos, com os mesmos testes.
- [ ] Chave Pix completa nunca gravada no banco, log ou cache do Financeiro.
- [ ] `ENCRYPTION_KEY`, `PIX_SECRET_KEY`, `SECRET_KEY` próprias, diferentes das do Connect; app não sobe sem elas.
- [ ] Se guardar arquivo: decisão do DPO registrada; envelope AES-256-GCM com DEK por arquivo e sha256 conferido na leitura; bucket próprio com SSE-KMS, lock, versionamento, sem anônimo, usuário sem `DeleteObject`, TLS.
- [ ] Logs em JSON sem dado pessoal; `hide_parameters=True`; teste que falha se dado fictício aparecer no log.
- [ ] `pii_access_logs`, `export_logs`, `finance_audit_events`, `role_change_logs` append-only e com autor `RESTRICT`.
- [ ] Planilha: só `admin`/`financeiro`, células de texto forçadas a texto, CSV com prefixo `'`, `Cache-Control: no-store`, sem CPF.
- [ ] Gitleaks CLI, `pip-audit` e `npm audit --omit=dev --audit-level=high` no CI de todo PR.
- [ ] Headers HTTP da seção 10 no middleware e no frontend; `/docs` e `/openapi.json` desligados em produção.
- [ ] Backup automático do Postgres e do bucket, restore testado, chaves guardadas separadas do backup.
- [ ] Inventário de dados, ROPA e RIPD do Financeiro escritos antes do primeiro dado real; ROPA do Connect atualizado (OP-04).
- [ ] Nenhuma lacuna da seção 13 reproduzida.
