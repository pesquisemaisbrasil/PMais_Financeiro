// Relatório do projeto: orçamento, lançado, pago, a pagar, saldo, os lançamentos de Contas a pagar do projeto e todos os anexos.
// Serve para fechar relatório e responder "quanto foi gasto no 1804". Aqui não se paga: o pagamento é feito em Contas a pagar.

ponto("tela-projetos", "Relatório do projeto", "Tela de consulta por projeto: orçamento, lançado, pago, a pagar, saldo, os lançamentos de Contas a pagar do projeto e todos os anexos. Serve para fechar relatório e responder \"quanto foi gasto no projeto\".");
ponto("regra-relatorio-projeto", "Relatório do projeto", "Mudança de 03/11: a tela por projeto deixou de ser onde se paga. Ela soma tudo o que foi lançado em Contas a pagar para o projeto (a parte de cada conta) e junta os anexos de todos os lançamentos. Para pagar, vá em Contas a pagar.");

function entrevistasDoProjeto(id) { return S.entrevistas.filter((e) => e.projeto === id); }
function lancadoProjeto(id) { return soma(entrevistasDoProjeto(id), (e) => e.lancadas * e.valor); }
function pagoProjeto(id) { return soma(entrevistasDoProjeto(id), (e) => e.pagas * e.valor); }
function aPagarPessoa(e) { return (e.lancadas - e.pagas) * e.valor; }

// Contas a pagar que têm parte neste projeto (sem provisão, cancelada ou substituída).
function contasDoProjeto(id) {
  return S.contasPagar
    .filter((c) => c.tipo === "real" && !c.cancelado && !c.substituidaPor && c.rateio.some((r) => r.projeto === id))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}
// Provisões do projeto (vêm de Contas a pagar, do orçamento por itens do Connect): abertas e já substituídas pelo valor real.
function provisoesDoProjeto(id) {
  return S.contasPagar
    .filter((c) => c.tipo === "provisao" && !c.cancelado && c.rateio.some((r) => r.projeto === id))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
}
const parteDoProjeto = (c, id) => soma(c.rateio.filter((r) => r.projeto === id), (r) => r.valor);
function pagoDaParte(c, id) { return c.valor ? Math.round((Math.max(0, pagoConta(c)) * parteDoProjeto(c, id)) / c.valor) : 0; }

function badgeProjeto(sit) {
  return badge(sit, { Ativo: "verde", Pausado: "ambar", Encerrado: "cinza" }[sit] || "cinza");
}
function badgeNfConnect(nf, modelo) {
  if (modelo === "RPA") return badge("RPA", "azul");
  if (nf === "Recebida") return badge("NF recebida", "verde", "file-check");
  if (nf === "Pendente") return badge("NF pendente", "ambar", "file-clock");
  return '<span class="muted pequeno">—</span>';
}
function textoIncentivo(p) {
  return p.temIncentivo ? `incentivo pago em ${plural(p.prazoIncentivo, "dia útil", "dias úteis")} após a resposta` : "sem incentivo";
}

function usoOrcamento(p) {
  const lancado = lancadoProjeto(p.id);
  if (!p.orcamento) return `<p class="pequeno muted" style="margin:0">Sem orçamento definido · ${brl(lancado)} em entrevistas lançadas</p>`;
  const pct = Math.round((lancado / p.orcamento) * 100);
  return `<div>
    <div class="uso"><span>${brl(lancado)} de ${brl(p.orcamento)} usados</span><span class="${pct > 100 ? "vermelho forte" : ""}">${pct}%</span></div>
    ${barraProgresso(pct)}
    ${pct > 100 ? `<p class="pequeno vermelho forte" style="margin:6px 0 0">Orçamento estourado</p>` : ""}
  </div>`;
}

// ---- Telas ----

function renderListaProjetos() {
  const ui = (UI.projetos ??= { busca: "" });
  const termo = (ui.busca || "").trim().toLowerCase();
  const ordem = { Ativo: 0, Pausado: 1, Encerrado: 2 };
  const lista = S.projetos
    .filter((p) => !termo || p.titulo.toLowerCase().includes(termo) || codigoProjeto(p.id).toLowerCase().includes(termo))
    .sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || b.id - a.id);
  const aPagar = soma(S.entrevistas, aPagarPessoa);
  const doConnect = S.contasPagar.filter((c) => c.origem === "connect" && emAberto(c));

  return `
    ${cabecalho({ titulo: "Relatório do projeto", icone: "chart-column", tela: "tela-projetos",
      subtitulo: "Escolha um projeto para ver orçamento, lançado, pago, a pagar, saldo, os lançamentos e os anexos. Para pagar, use Contas a pagar." })}
    <div class="kpis">
      ${kpi({ rotulo: "A pagar no total", valor: brl(aPagar), detalhe: `${plural(new Set(S.entrevistas.filter((e) => aPagarPessoa(e) > 0).map((e) => e.pessoa)).size, "pessoa", "pessoas")} · entrevistas`, ic: "clock", cor: "cor-ambar" })}
      ${kpi({ rotulo: "Pago no total", valor: brl(soma(S.entrevistas, (e) => e.pagas * e.valor)), detalhe: "entrevistas", ic: "circle-check", cor: "cor-verde" })}
      ${kpi({ rotulo: "Lançamentos do Connect em aberto", valor: String(doConnect.length), detalhe: "pagos em Contas a pagar", ic: "link", cor: "cor-roxo" })}
      ${kpi({ rotulo: "NF pendente no Connect", valor: String(S.entrevistas.filter((e) => e.nf === "Pendente" && aPagarPessoa(e) > 0).length), detalhe: "aviso, não bloqueia", ic: "file-clock", cor: "cor-ambar" })}
    </div>
    <div class="mb">${campoBusca("projetos", ui.busca || "", "Buscar projeto pelo nome ou código…")}</div>
    ${lista.length ? `<div class="grade grade-3">${lista.map((p) => {
      const falta = soma(entrevistasDoProjeto(p.id), aPagarPessoa);
      return `<div class="card projeto">
        <div class="topo">
          <div style="min-width:0"><div class="codigo">${codigoProjeto(p.id)}</div><h3 title="${esc(p.titulo)}">${esc(p.titulo)}</h3></div>
          ${badgeProjeto(p.situacao)}
        </div>
        ${usoOrcamento(p)}
        <div class="flex entre pequeno">
          <span>${falta ? `<span class="ambar forte">${brl(falta)}</span> a pagar` : '<span class="verde forte">Tudo pago</span>'}</span>
          <span class="muted">${esc(p.tipoProjeto)}</span>
        </div>
        <a class="btn btn-outline w-full" href="#/projetos/${p.id}">${icone("chart-column")}Abrir relatório</a>
      </div>`;
    }).join("")}</div>` : `<p class="vazio">${termo ? "Nenhum projeto encontrado com essa busca." : "Nenhum projeto ainda."}</p>`}`;
}

function renderProjeto(id) {
  const p = achar("projetos", id);
  if (!p) return `<div class="card card-pad vazio"><p>Projeto inválido.</p><a class="btn" href="#/projetos">Voltar para projetos</a></div>`;
  const pessoas = entrevistasDoProjeto(p.id);
  const lancado = lancadoProjeto(p.id), pago = pagoProjeto(p.id);
  const contas = contasDoProjeto(p.id);
  const anexos = contas.flatMap((c) => c.anexos.filter((a) => !a.excluido).map((a) => ({ a, c })));
  const historico = S.envios.filter((e) => e.projeto === p.id && e.situacao === "Confirmado").reverse();
  const provisoes = provisoesDoProjeto(p.id);
  const provisoesAbertas = provisoes.filter((c) => !c.substituidaPor);
  const totalContas = soma(contas, (c) => parteDoProjeto(c, p.id));
  const pagoContas = soma(contas, (c) => pagoDaParte(c, p.id));

  return `
    <a class="btn btn-ghost btn-sm" href="#/projetos" style="margin-bottom:12px">${icone("arrow-left")}Projetos</a>
    ${cabecalho({ sobretitulo: codigoProjeto(p.id), titulo: `Relatório · ${esc(p.titulo)}`, icone: "chart-column", tela: "tela-projetos",
      subtitulo: `Cliente: ${esc(nomeCliente(p.cliente))} · Tipo: ${esc(p.tipoProjeto)} · ${textoIncentivo(p)}.`,
      acoes: `<a class="btn" href="#/pagar/p${p.id}">${icone("arrow-up-right")}Pagar em Contas a pagar</a>` })}

    <div class="aviso aviso-azul">${icone("info")}<div><strong>Aqui não se paga</strong>O relatório soma o que foi lançado em Contas a pagar para este projeto e junta os anexos de todos os lançamentos. ${regra("regra-relatorio-projeto")}</div></div>

    <div class="kpis">
      ${kpi({ rotulo: "Orçamento", valor: p.orcamento ? brl(p.orcamento) : "—", detalhe: "de entrevistas, definido no Connect", ic: "gauge" })}
      ${kpi({ rotulo: "Lançado", valor: brl(lancado), detalhe: plural(soma(pessoas, (e) => e.lancadas), "entrevista", "entrevistas"), ic: "list-checks" })}
      ${kpi({ rotulo: "Pago", valor: brl(pago), detalhe: "entrevistas", ic: "circle-check", cor: "cor-verde" })}
      ${kpi({ rotulo: "A pagar", valor: brl(lancado - pago), detalhe: "entrevistas", ic: "clock", cor: "cor-ambar" })}
      ${kpi({ rotulo: "Saldo do orçamento", valor: p.orcamento ? brl(p.orcamento - lancado) : "—", ic: "piggy-bank", cor: p.orcamento && lancado > p.orcamento ? "cor-vermelho" : "cor-azul" })}
      ${kpi({ rotulo: "Gasto total do projeto", valor: brl(totalContas), detalhe: `${brl(pagoContas)} já pago · todas as contas`, ic: "wallet", cor: "cor-roxo" })}
      ${kpi({ rotulo: "Provisionado a pagar", valor: brl(soma(provisoesAbertas, (c) => parteDoProjeto(c, p.id))), detalhe: `${plural(provisoesAbertas.length, "provisão em aberto", "provisões em aberto")} · ainda não é gasto`, ic: "piggy-bank", cor: "cor-ambar" })}
    </div>

    <div class="card projeto secao">${usoOrcamento(p)}</div>

    <div class="card secao">
      <div class="card-titulo"><div><h2>Lançamentos de Contas a pagar</h2><p>Só a parte deste projeto em cada conta</p></div></div>
      ${contas.length ? `<div class="tabela-wrap"><table>
        <thead><tr><th>Vencimento</th><th>Lançamento</th><th>Categoria</th><th class="num">Neste projeto</th><th class="num">Pago</th><th class="num">A pagar</th><th>Situação</th><th class="num">Anexos</th></tr></thead>
        <tbody>${contas.map((c) => {
          const parte = parteDoProjeto(c, p.id), pagoParte = pagoDaParte(c, p.id);
          return `<tr>
            <td>${fmtDia(c.vencimento)}</td>
            <td><a class="link-projeto" href="#/pagar/${c.id}" title="Abrir em Contas a pagar">${esc(c.descricao)}</a> ${c.origem === "connect" ? badge("Do Connect", "azul", "link") : ""}<span class="sub">${esc(quemRecebe(c))}</span></td>
            <td>${esc(nomeCategoria(c.categoria))}</td>
            <td class="num forte">${brl(parte)}</td>
            <td class="num verde">${pagoParte ? brl(pagoParte) : "—"}</td>
            <td class="num">${parte - pagoParte ? `<span class="ambar forte">${brl(parte - pagoParte)}</span>` : "—"}</td>
            <td>${badgeSituacao(situacaoPagar(c))}</td>
            <td class="num">${c.anexos.filter((a) => !a.excluido).length || "—"}</td>
          </tr>`;
        }).join("")}</tbody>
        <tfoot><tr class="total-linha"><td colspan="3">${plural(contas.length, "lançamento", "lançamentos")}</td><td class="num">${brl(totalContas)}</td><td class="num">${brl(pagoContas)}</td><td class="num">${brl(totalContas - pagoContas)}</td><td colspan="2"></td></tr></tfoot>
      </table></div>` : `<p class="vazio">Nenhum lançamento de Contas a pagar neste projeto ainda.</p>`}
    </div>

    <div class="card secao">
      <div class="card-titulo"><div><h2>Provisões do projeto</h2><p>Previsto no orçamento por itens do Connect; vem de Contas a pagar. Quando o real chega, ele substitui a provisão.</p></div>${regra("regra-provisao")}</div>
      ${provisoes.length ? `<div class="tabela-wrap"><table>
        <thead><tr><th>Data estimada</th><th>Item</th><th class="num">Provisionado</th><th>Situação</th><th class="num">Real</th><th class="num">Diferença</th></tr></thead>
        <tbody>${provisoes.map((c) => {
          const real = c.substituidaPor ? achar("contasPagar", c.substituidaPor) : null;
          const parte = parteDoProjeto(c, p.id);
          const dif = real ? real.valor - c.valor : null;
          return `<tr>
            <td>${fmtDia(c.vencimento)}</td>
            <td><a class="link-projeto" href="#/pagar/${real ? real.id : c.id}" title="Abrir em Contas a pagar">${esc(c.descricao)}</a></td>
            <td class="num">${brl(parte)}</td>
            <td>${real ? badge("Substituída pelo real", "verde", "circle-check") : badge("Provisionada", "roxo", "piggy-bank")}</td>
            <td class="num">${real ? brl(real.valor) : "—"}</td>
            <td class="num ${dif > 0 ? "vermelho" : dif < 0 ? "verde" : ""}">${dif == null ? "—" : dif === 0 ? "igual" : `${dif > 0 ? "+" : "−"}${brl(Math.abs(dif))}`}</td>
          </tr>`;
        }).join("")}</tbody>
        <tfoot><tr class="total-linha"><td colspan="2">${plural(provisoes.length, "provisão", "provisões")}</td><td class="num">${brl(soma(provisoes, (c) => parteDoProjeto(c, p.id)))}</td><td colspan="3"></td></tr></tfoot>
      </table></div>` : `<p class="vazio">Nenhuma provisão para este projeto. Elas nascem do orçamento por itens do Connect, em Contas a pagar.</p>`}
    </div>

    <div class="card secao">
      <div class="card-titulo"><div><h2>Anexos do projeto</h2><p>Planilhas, comprovantes e notas de todos os lançamentos</p></div></div>
      ${anexos.length ? `<div class="tabela-wrap"><table>
        <thead><tr><th>Arquivo</th><th>Tipo</th><th>Lançamento</th></tr></thead>
        <tbody>${anexos.map(({ a, c }) => `<tr>
          <td class="nome">${icone("paperclip")} ${esc(a.nome)}</td><td>${esc(a.tipo)}</td>
          <td><a class="link-projeto" href="#/pagar/${c.id}">${esc(c.descricao)}</a></td>
        </tr>`).join("")}</tbody>
      </table></div>` : `<p class="vazio">Nenhum anexo nos lançamentos deste projeto.</p>`}
    </div>

    <div class="card secao">
      <div class="card-titulo"><h2>Por entrevistador</h2>${regra("regra-nf-entrevistador")}</div>
      ${pessoas.length ? `<div class="tabela-wrap"><table>
        <thead><tr><th>Nome</th><th>Chave Pix</th><th>Nota (Connect)</th><th class="num">Lançadas</th><th class="num">Valor lançado</th><th class="num">Pagas</th><th class="num">Valor pago</th><th class="num">A pagar</th></tr></thead>
        <tbody>${pessoas.map((e) => {
          const pessoa = achar("pessoas", e.pessoa);
          return `<tr>
            <td class="nome">${esc(pessoa.nome)}</td>
            <td class="mono">${pessoa.chave ? esc(pessoa.chave) : '<span class="ambar">Sem chave cadastrada</span>'}</td>
            <td>${badgeNfConnect(e.nf, pessoa.modelo)}</td>
            <td class="num">${e.lancadas}</td>
            <td class="num">${brl(e.lancadas * e.valor)}</td>
            <td class="num">${e.pagas}</td>
            <td class="num verde">${brl(e.pagas * e.valor)}</td>
            <td class="num">${aPagarPessoa(e) ? `<span class="ambar forte">${brl(aPagarPessoa(e))}</span>` : badge("Pago", "verde", "circle-check")}</td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>` : `<p class="vazio">Nenhuma entrevista lançada neste projeto ainda.</p>`}
    </div>

    <div class="card">
      <div class="card-titulo"><h2>Histórico de envios de comprovantes</h2></div>
      ${historico.length ? `<div class="tabela-wrap"><table>
        <thead><tr><th>Data</th><th>Lançamento</th><th>Situação</th><th class="num">Comprovantes</th><th class="num">Fora do lançamento</th><th class="num">Total pago</th></tr></thead>
        <tbody>${historico.map((e) => `<tr>
          <td>${fmtDia(e.data)}</td>
          <td>${e.lancamento ? `<a class="link-projeto" href="#/pagar/${e.lancamento}">${esc(achar("contasPagar", e.lancamento)?.descricao ?? "Lançamento")}</a>` : "—"}</td>
          <td>${badge("Confirmado", "verde", "circle-check")}</td>
          <td class="num">${e.comprovantes}</td><td class="num ${e.fora ? "ambar forte" : ""}">${e.fora}</td><td class="num forte">${brl(e.totalPago)}</td>
        </tr>`).join("")}</tbody>
      </table></div>` : `<p class="vazio">Nenhum comprovante enviado neste projeto ainda.</p>`}
    </div>`;
}

registrarTela({
  rota: "projetos",
  titulo: "Relatório do projeto",
  icone: "chart-column",
  grupo: "Relatórios",
  render: (param) => (param ? renderProjeto(Number(param)) : renderListaProjetos()),
});
