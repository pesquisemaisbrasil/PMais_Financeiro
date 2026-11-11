# ADR 0015: Feriados por cadastro, com os nacionais buscados na BrasilAPI

**Status:** Aceito, provisório (a confirmar com a Vivi: Q42)
**Data:** 11/11/2026

## Contexto

O vencimento dos incentivos é contado em **dias úteis** a partir da data da resposta (kickoff de 03/11, K6), e a recorrência de contas já manda fim de semana e feriado para o próximo dia útil. O código só conhecia os **feriados nacionais fixos e a Páscoa** (`core/business_days.py`): sem Carnaval, sem ponto facultativo e sem feriado estadual ou municipal. Além disso, a data de pagamento que já vem pronta na planilha (K12) podia cair em sábado, domingo ou feriado sem aviso.

O Bruno perguntou, em 11/11/2026, se existe API de feriados e escolheu **BrasilAPI mais cadastro** para cobrir também o que a API não traz.

## Decisão

- **Tabela `holidays`** (data, nome, âmbito nacional/estadual/municipal, UF, cidade e origem `brasilapi` ou `manual`), única por data e nome. É o **cadastro de feriados** do Cadastros: o financeiro acrescenta e exclui os locais e os pontos facultativos.
- **Busca dos nacionais pela [BrasilAPI](https://brasilapi.com.br)** (`GET /api/feriados/v1/{ano}`, sem chave, conferida em 11/11/2026: 14 feriados nacionais em 2026, todos do tipo `national`), pelo **servidor** e só quando a pessoa clica em **Buscar nacionais do ano**. Mesmo desenho do [ADR 0013](0013-consulta-de-cnpj-pela-brasilapi.md): endereço fixo, ano conferido (2000 a 2100) antes de entrar na URL, sem redirecionamento, prazo de 3 s para conectar e 6 s para ler, resposta de até 100 KB, e falha vira "Não foi possível buscar agora" sem travar nada. Só entram os de tipo `national`; o que já existe (mesma data e nome) não se repete.
- **Modo:** `HOLIDAYS_LOOKUP_MODE` = `brasilapi` (padrão), `simulated` (feriados inventados, recusado em produção) ou qualquer outro valor para desligar. Nos testes e no E2E a BrasilAPI nunca é chamada.
- **A tabela do código continua valendo** (nacionais fixos e Páscoa): feriado cadastrado soma a ela (`extra` em `is_business_day`, `next_business_day`, `add_business_days`), nunca a substitui. Sem nada buscado ou cadastrado, tudo funciona como antes.
- **Quem usa:** o prazo do incentivo (`add_business_days`), a data de pagamento da planilha (`next_business_day`, com aviso na prévia) e a simulação das séries a pagar e a receber.

## Consequências

- **Dado público, sem dado pessoal:** a tabela não entra no inventário de dados nem no ROPA. A BrasilAPI só recebe o **ano** (e o IP do servidor).
- O **Carnaval** passa a ser dia não útil nos anos buscados (a tabela do código não o tinha), o que muda vencimentos de recorrência nesses dois dias. Por isso a Q42 pede a confirmação da Vivi.
- Feriado cadastrado vale para o **sistema todo**: ainda não há feriado por unidade ou cidade (Q42).
- Excluir um feriado da BrasilAPI não o apaga para sempre: ele volta se o ano for buscado de novo.
- **Aviso na hora de lançar:** o servidor também responde `GET /business-days/check?date=` (dia útil? motivo, dia útil anterior e próximo), e a tela usa isso para avisar, embaixo do vencimento, "é sábado / é feriado: Nome", com **Antecipar**, **Postergar** ou **Manter**. A decisão de qual dia usar é sempre da pessoa; só a data que vem pronta numa planilha de incentivos vai sozinha para o próximo dia útil, com aviso na prévia.
- Mais uma dependência externa, só de leitura e só sob demanda. Sem agendamento: quem busca é a pessoa, uma vez por ano. (`shortcut`: busca automática quando o volume pedir.)
- Alternativas descartadas: **Nager.Date** e **Calendarific** (também só nacionais, e o Calendarific exige chave); calcular os feriados móveis no código (não cobre o que o governo decreta, como ponto facultativo).
