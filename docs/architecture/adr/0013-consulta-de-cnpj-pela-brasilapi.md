# ADR 0013: Consulta de CNPJ pela BrasilAPI, feita pelo servidor do Financeiro

**Status:** Aceito, provisório (a confirmar com o DPO: Q33)
**Data:** 09/11/2026

## Contexto

O Bruno pediu, em 09/11/2026, que o cadastro de fornecedor, cliente e empresa do Grupo comece pelo **CNPJ**: a pessoa digita, o sistema busca numa API de CNPJ e preenche os campos, e ela edita o que quiser antes de salvar. O sistema antigo tinha o cadastro à mão, com o risco de CNPJ digitado errado e de empresa baixada na Receita.

## Decisão

- **API:** a [BrasilAPI](https://brasilapi.com.br) (`/api/cnpj/v1/{cnpj}`): gratuita, sem chave nem cadastro, com dados públicos da Receita. Escolha do PO entre ela e a ReceitaWS (que tem limite de poucas consultas por minuto).
- **Quem chama é o servidor**, em `GET /lookups/cnpj/{cnpj}`, e não o navegador: a CSP da tela não precisa abrir para um terceiro, o prazo e as falhas ficam sob controle, e a tela nunca fala direto com fora.
- **Só o CNPJ sai**, e só quando a pessoa digita um CNPJ completo ou clica em Buscar. O CNPJ é conferido (forma e dígitos) antes de entrar na URL, o endereço da API é fixo e redirecionamento não é seguido: nada que a pessoa digita escolhe o destino.
- **Volta só o que o cadastro usa:** razão social, apelido sugerido (nome fantasia, ou a razão social) e situação cadastral. A consulta **não grava nada**: o cadastro só existe quando a pessoa salva.
- **CPF nunca entra.** A razão social de MEI costuma vir como "NOME 12345678909"; o número de 11 dígitos é tirado do texto antes de voltar. CPF digitado no lugar do CNPJ é recusado (Q23).
- **A tela não troca o que a pessoa escreveu:** a consulta automática só completa Nome e Apelido vazios (ou ainda iguais ao que a consulta pôs); o botão **Buscar** troca os dois. Empresa que não esteja ATIVA na Receita ganha um aviso, mas pode ser cadastrada.
- Prazo de 3 s para conectar e 6 s para ler, resposta de até 200 KB, limite de 20 consultas por minuto por IP. Falha da API vira "preencha à mão", nunca erro que trave o cadastro.
- **Modo:** `CNPJ_LOOKUP_MODE` = `brasilapi` (padrão), `simulated` (CNPJs inventados, para a tela e os testes, recusado em produção) ou qualquer outro valor para desligar. Nos testes a BrasilAPI nunca é chamada.

## Consequências

- Mais uma dependência externa: se a BrasilAPI cair ou mudar o formato, o cadastro continua à mão. Sem cache: cada consulta vai a ela (`shortcut`: cache quando o volume pedir).
- **Terceiro que recebe dado:** a BrasilAPI vê o CNPJ consultado e o IP do servidor. O CNPJ é dado público, mas o de MEI identifica uma pessoa; por isso ele consta no [ROPA](../seguranca/lgpd/ropa.md) (FIN-R2) e a confirmação com o DPO é a Q33.
- A coluna `companies.name` passou de 100 para 200 letras, porque a razão social cabe mais que o apelido de antes.
- Fica de fora: endereço, telefone, e-mail e sócios que a Receita também devolve (o cadastro não os usa), e a consulta em lote.
