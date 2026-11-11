# Publicar a versão de teste no mesmo site do protótipo

Pedido do Bruno em 11/11/2026: a versão real do Financeiro em teste (a da branch `homolog`) abrir a partir do **mesmo site do protótipo**, para dar para alternar entre as duas.

## Como está hoje

- O **protótipo** (HTML puro, dados fictícios) é publicado no Netlify a partir da pasta `prototipo/financeiro` (`netlify.toml`, `publish`).
- O protótipo tem, no menu, abaixo de "Restaurar dados de exemplo", o botão **Abrir para teste de produção**. Ele abre `teste/` **no mesmo site**, em outra aba.
- Enquanto não houver nada publicado em `teste/`, o site mostra a página `404.html`, que explica isso e volta ao protótipo.
- O **Financeiro real** (frontend Next.js, API FastAPI, Postgres e cofre de arquivos) só roda na máquina de quem desenvolve. **Nada dele está publicado.**

## O que falta para `teste/` funcionar

1. **Onde roda a API.** O Netlify serve o frontend, mas não roda a API (Python), o Postgres nem o cofre de arquivos. É preciso escolher a hospedagem deles (e o que substitui o MinIO: Q18), com as chaves e senhas do `backend/.env.example` guardadas no cofre do provedor, e nunca no repositório.
2. **Mesmo endereço para tudo.** O cookie de renovação da sessão é `SameSite=Strict`: a API tem de responder no **mesmo site** da tela. A saída é o Netlify encaminhar (`[[redirects]]`, `status = 200`) `/teste/api/*` para a API e `/teste/*` para o frontend publicado, e o frontend ser gerado com `basePath: "/teste"`.
3. **Só dados fictícios (decidido pelo Bruno em 11/11/2026).** O ambiente de teste do site usa o `seed_demo.py`. Os testes com dados reais ficam **só na máquina do Bruno**. Nada de dado real, de comprovante real nem de chave Pix real no ambiente publicado; o Connect fica simulado (`CONNECT_MODE=simulated`) ou aponta para o Connect de teste, se o João liberar.
4. **Entrada.** O login pede e-mail, senha e código do autenticador (MFA obrigatório): criar os usuários de teste e passar os códigos de recuperação a quem for testar.
5. **LGPD.** Com só dados fictícios, a hospedagem de teste não guarda dado pessoal e não entra no [ROPA](../architecture/seguranca/lgpd/ropa.md). Se um dia for receber dado real, ela vira um operador a mais: aí o ROPA e o inventário de dados mudam no mesmo PR, e a decisão volta ao DPO.
6. **Voltar ao protótipo.** Um link no menu do Financeiro real (endereço em `NEXT_PUBLIC_PROTOTYPE_URL`), para alternar nos dois sentidos. Ainda não feito.

## Quem decide

A escolha da hospedagem, dos custos e das contas é do **João** (infraestrutura e repositório) e do **PO**; a parte dos dados já está decidida (só fictícios, item 3). Pergunta **Q41** em [perguntas-abertas](../planning/perguntas-abertas.md). Nada disto foi publicado, e a `main` do repositório não foi tocada.
