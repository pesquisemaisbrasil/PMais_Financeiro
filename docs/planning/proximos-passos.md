# Próximos passos

**Posição em 27/11/2026** (pedidos da reunião de testes de 26/11 feitos; ver o [roadmap](roadmap.md)). O trabalho novo vai na `homolog` por enquanto (pedido do Bruno, 25/11). A `development` é a versão do servidor local, que se atualiza sozinha às 22h, e a `homolog` chega a ela por um PR que o Bruno abre. Merge na `main` só com o João. A fonte do que está aberto é o Jira (projeto PF); este documento explica a ordem e o porquê. Decisões de produto continuam em [perguntas-abertas](perguntas-abertas.md), e o que foi construído e como testar está no [roadmap](roadmap.md).

## Onde estamos

| Área | Estado |
|---|---|
| Login (senha, autenticador, códigos de recuperação, computador liberado, senha inicial de primeiro acesso) | Entregue. A tela oferece só e-mail e senha; o Google e a Microsoft estão desligados até as contas da empresa existirem |
| Contas a pagar e a receber | Entregue, com importação do sistema antigo, acréscimos, descontos e impostos, recorrência, baixa e recebimento, busca e exportação com o número da conta |
| Cadastros | Entregue, com as listas e os campos do SGE4B |
| Comprovantes e baixa | Entregue com o Connect simulado. Pagar de verdade depende das entregas 1 e 2 do Connect |
| Conferência bancária | Entregue (importar extrato, conciliar, extrato × sistema exportável, saldo do mês, fechamento). Fica "Em breve" no menu, a pedido do Bruno, até a Vivi validar |
| Relatórios | Relatório do projeto, Fluxo de caixa e DRE (25/11); **Fluxo mensal**, **Recebimentos × ano** e os **favoritos** nas listas e nos relatórios (26/11). Os quatro relatórios novos ficam "Em breve" no menu, a pedido do Bruno, e abrem pelo endereço. Faltam o Resultado por projeto e o previsto × realizado, que esperam o Connect |
| Notas e RPA | **NF pendente** (com Registrar NF) e **RPA do mês** (26/11), com o INSS em Cadastros. Faltam a conferência das notas do portal (arquivo de exemplo), o status da NF vindo do Connect e o CPF/PIS para o RPA (Q15) |
| Servidor local | Pronto para o João instalar com `make subir-projeto` e o pacote do banco local ([DEPLOY.md](../../DEPLOY.md), [ADR 0026](../architecture/adr/0026-banco-local-no-servidor-e-atualizacao-as-22h.md)) |
| Dados reais | Importados do SGE4B só na máquina do Bruno; vão para o servidor no pacote do banco |

## O que depende de outra pessoa

| # | O que | Quem | Destrava | Jira |
|---|---|---|---|---|
| 1 | **Instalar o servidor** com o pacote do banco local (o Bruno entrega o pacote por um canal seguro) | João | A equipe usar o Financeiro com os dados reais | — |
| 2 | **Datas e responsáveis das entregas do Connect** ([entregas-do-connect](../specs/entregas-do-connect.md)) e a conta `financeiro-dev` | João e o time do Connect | Pagar de verdade, Notas e RPA, adiantamento, o orçamento dos relatórios | PF-58, PF-77, PF-81 |
| 3 | **Repositório e demonstração públicos?** (Q47) | João | Fechar ou manter o repositório | PF-78 |
| 4 | **Adiantamento:** como o Financeiro registra (Q63) | João e Vivi | Mostrar o adiantamento e o saldo negativo na tela de pagamento | PF-102, PF-101 |
| 5 | **Perguntas da Conferência bancária** (Q44, Q45, Q46) e um extrato de exemplo sem dado real | Vivi | Voltar a tela ao menu; o teto da conciliação | PF-79, PF-70 |
| 6 | **LGPD:** prazos de guarda (Q26, Q36), o PDF do comprovante (Q19), a chave Pix (Q22) | DPO | Ligar a limpeza dos registros de login; guardar ou não o PDF | PF-80 |
| 7 | **Verificação em duas etapas** obrigatória nas contas da empresa, se o Google e a Microsoft voltarem | João | O login por SSO | PF-51 |
| 8 | **Validação das telas** de Contas a receber, Fluxo de caixa e DRE, e o vínculo das contas com as linhas do DRE | Vivi | Fechar a PF-65 e a parte do DRE | PF-65, PF-76 |
| 9 | **Acesso por empresa** (Q65): quem vê quais empresas | Vivi | Limitar cada conta às empresas dela (hoje só a empresa preferida) | — |
| 10 | **Conferência dos lançamentos do Connect** antes de virar conta a pagar, NF repetida e data de pagamento (Q66) | João e Vivi | O desenho da entrega do Connect | — |
| 11 | **Começar a usar só o sistema novo** (Q68): zerar e importar de novo, ou completar as baixas | Bruno, João e Marco | Atualizar os dados desde 23/11 e a equipe largar o sistema antigo | — |

## O que dá para fazer sem esperar ninguém

1. **Notas e RPA, a conferência das notas do portal** (PF-68): importar o arquivo exportado do portal, quando o Bruno mandar um (fica em `importar/`, fora do git; os testes usam dados inventados).
2. **Débitos pequenos:** a API da Conferência bancária ainda importa extrato de outra conta sem a confirmação que a tela exige; os anexos ainda não têm antivírus nem a rotina de troca da `FILES_MASTER_KEY`.

## Riscos e limites que precisam ficar à vista

- **Sem o Connect, ninguém é pago de verdade pelo Financeiro.** A tela de comprovantes funciona com o Connect simulado.
- **As chaves do pacote do banco** (`ENCRYPTION_KEY`, `PIX_SECRET_KEY` e `FILES_MASTER_KEY`) abrem o autenticador, a busca por chave Pix e os anexos. Perdê-las perde esses dados; o pacote vai por canal seguro e a cópia do `deploy/.env` fica num cofre fora do servidor.
- **O DRE usa os grupos do SGE4B** como linhas e o valor principal dos títulos: é provisório até a Vivi definir o DRE completo (F3).
- **Dado pessoal:** nada de PDF, planilha, dump ou `.env` reais no repositório; chave Pix nunca copiada do Connect; CPF nunca guardado.
