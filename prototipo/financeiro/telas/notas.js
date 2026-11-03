// Notas e RPA: só o que a contabilidade e as notas pedem. NF pendente (aviso, nunca bloqueia o pagamento), lista de RPA e conferência
// das notas do portal. Aqui não se paga nada: folha, incentivos, entrevistadores e provisões ficam em Contas a pagar (decisão K10, 03/11).

ponto("tela-notas", "Notas e RPA", "Tela só de notas e RPA: NF pendente, lista de RPA para a contabilidade e conferência das notas do portal. Quem paga é Contas a pagar.");
ponto("regra-nf-nao-bloqueia", "Notas e RPA", "Mudança de 28/10: a NF do prestador chega pelo Connect, mas NÃO é mais obrigatória para pagar. \"NF pendente\" é só aviso; a pessoa entra no pagamento.");
ponto("regra-rpa", "Notas e RPA", "RPA: o INSS (11%, em configuração) é calculado, nunca digitado. Paga-se o líquido. A lista de RPA vai para a contabilidade emitir os recibos.");
ponto("regra-conferencia-notas", "Notas e RPA", "Conferência de notas: o arquivo exportado do portal (prefeitura / Emissor Nacional) é cruzado com as notas lançadas. Mostra as que faltam e as canceladas.");
ponto("regra-nota-cancelada", "Notas e RPA", "Nota cancelada na prefeitura gera alerta na conta já paga com ela.");

// Notas emitidas contra o CNPJ, como viriam do portal da prefeitura / Emissor Nacional.
const NOTAS_PORTAL = [
  { numero: "4521", emitente: "Gráfica Ponto Certo", emissao: "2026-10-20", valor: 125000, situacao: "Válida" },
  { numero: "889", emitente: "Hotel Central Curitiba", emissao: "2026-10-18", valor: 198000, situacao: "Válida" },
  { numero: "1203", emitente: "Contabilidade Exata", emissao: "2026-10-26", valor: 280000, situacao: "Válida" },
  { numero: "4470", emitente: "Gráfica Ponto Certo", emissao: "2026-10-08", valor: 48000, situacao: "Cancelada" },
  { numero: "312", emitente: "Transportes JK", emissao: "2026-10-19", valor: 54000, situacao: "Válida" },
];

// Nota da conta que aparece cancelada no portal (depois de importar as notas).
function notaCanceladaDe(c) {
  if (!S.notasPortal || c.documento.tipo !== "NF") return null;
  return S.notasPortal.find((n) => n.situacao === "Cancelada" && n.numero === c.documento.numero && sem(n.emitente) === sem(quemRecebe(c)));
}

// ---- Lista de RPA e notas ----

ACOES["rpa-exportar"] = () => {
  const linhas = lancamentosDePlanilha().flatMap((c) => c.itens.filter((i) => i.doc === "RPA").map((i) => [i.nome, c.rateio.map((r) => codigoProjeto(r.projeto)).join(" "), c.descricao, centavosParaCampo(i.bruto), centavosParaCampo(i.bruto - i.valor), centavosParaCampo(i.valor)]));
  baixarCsv(`lista-rpa-${HOJE.slice(0, 7)}.csv`, [["Pessoa", "Projeto", "Lançamento", "Bruto", `INSS (${ALIQUOTA_INSS}%)`, "Líquido"], ...linhas]);
  toast(`Lista de RPA com ${plural(linhas.length, "pessoa", "pessoas")} baixada para a contabilidade.`);
};
ACOES["notas-importar"] = () => {
  S.notasPortal = copiar(NOTAS_PORTAL);
  auditar("notas", `Importou ${NOTAS_PORTAL.length} notas do portal (exemplo)`);
  salvar();
  toast(`${NOTAS_PORTAL.length} notas lidas do portal. Veja o que falta e o que foi cancelado.`);
};
ACOES["nf-lembrar"] = (d) => toast(`Lembrete enviado pelo Connect para ${d.nome} subir a nota (simulado).`);

function notasLancadas() {
  return S.contasPagar.filter((c) => c.documento.tipo === "NF" && !c.cancelado).map((c) => ({ numero: c.documento.numero, emitente: quemRecebe(c), c }));
}

// Lançamentos de folha de campo e incentivos (importados por planilha). Os do Connect não entram: a NF deles vem do Connect.
function lancamentosDePlanilha() { return S.contasPagar.filter((c) => c.itens && !c.cancelado && c.origem !== "connect"); }

// ---- Tela ----

registrarTela({
  rota: "notas",
  titulo: "Notas e RPA",
  icone: "receipt",
  grupo: "Dia a dia",
  render() {
    const planilhas = lancamentosDePlanilha();
    const itens = planilhas.flatMap((c) => c.itens.map((i) => ({ ...i, c })));
    const nfPendentes = itens.filter((i) => i.doc === "NF" && !i.nf);
    const rpas = itens.filter((i) => i.doc === "RPA");
    const entrevistasPendentes = S.entrevistas.filter((e) => e.nf === "Pendente");
    const lancadas = notasLancadas();
    const portal = S.notasPortal || [];
    const cruzadas = portal.map((n) => ({ n, lanc: lancadas.find((l) => l.numero === n.numero && sem(l.emitente) === sem(n.emitente)) }));
    const faltam = cruzadas.filter((x) => !x.lanc).length;
    const canceladas = cruzadas.filter((x) => x.n.situacao === "Cancelada").length;

    return `
      ${cabecalho({ titulo: "Notas e RPA", icone: "receipt", tela: "tela-notas",
        subtitulo: "NF pendente, lista de RPA para a contabilidade e conferência das notas do portal. Para pagar folha, incentivos ou provisões, use Contas a pagar.",
        acoes: `<a class="btn btn-outline" href="#/pagar">${icone("arrow-up-right")}Ir para Contas a pagar</a>` })}
      <div class="kpis">
        ${kpi({ rotulo: "NF pendente", valor: String(nfPendentes.length + entrevistasPendentes.length), detalhe: "aviso, não bloqueia", ic: "file-clock", cor: "cor-ambar" })}
        ${kpi({ rotulo: "RPA no período", valor: String(rpas.length), detalhe: `${brl(soma(rpas, (i) => i.bruto - i.valor))} de INSS`, ic: "receipt", cor: "cor-azul" })}
        ${kpi({ rotulo: "Notas do portal", valor: portal.length ? String(portal.length) : "—", detalhe: portal.length ? `${faltam} falta lançar · ${canceladas} cancelada` : "importe o arquivo do portal", ic: "file-search", cor: "cor-roxo" })}
      </div>
      <div class="grade grade-2 secao">
        <div class="card">
          <div class="card-titulo"><div><h2>Lista de RPA</h2><p>Para a contabilidade emitir os recibos</p></div><button class="btn btn-outline btn-sm" data-acao="rpa-exportar">${icone("download")}Exportar</button></div>
          ${rpas.length ? `<div class="tabela-wrap"><table><thead><tr><th>Pessoa</th><th class="num">Bruto</th><th class="num">INSS</th><th class="num">Líquido</th></tr></thead>
            <tbody>${rpas.map((i) => `<tr><td class="nome">${esc(i.nome)}<span class="sub"><a class="link-projeto" href="#/pagar/${i.c.id}" title="Abrir em Contas a pagar">${esc(i.c.descricao)}</a></span></td><td class="num">${brl(i.bruto)}</td><td class="num muted">− ${brl(i.bruto - i.valor)}</td><td class="num forte">${brl(i.valor)}</td></tr>`).join("")}</tbody></table></div>` : `<p class="vazio">Nenhum RPA no período.</p>`}
          <p class="pequeno muted" style="padding:0 16px 12px;margin:0">${regra("regra-rpa")}</p>
        </div>
        <div class="card">
          <div class="card-titulo"><div><h2>NF pendente</h2><p>Só aviso: não tira ninguém do pagamento</p></div>${regra("regra-nf-nao-bloqueia")}</div>
          <ul class="lista">
            ${nfPendentes.map((i) => `<li><span class="icone cor-ambar">${icone("file-clock")}</span><div class="texto"><strong>${esc(i.nome)}</strong><span><a class="link-projeto" href="#/pagar/${i.c.id}">${esc(i.c.descricao)}</a> · ${brl(i.valor)}</span></div>
              <button class="btn btn-ghost btn-sm" data-acao="item-nf" data-id="${i.c.id}" data-item="${i.id}">Registrar NF</button></li>`).join("")}
            ${entrevistasPendentes.map((e) => `<li><span class="icone cor-ambar">${icone("file-clock")}</span><div class="texto"><strong>${esc(nomePessoa(e.pessoa))}</strong><span>Entrevistas do ${codigoProjeto(e.projeto)} · nota pendente no Connect</span></div>
              <button class="btn btn-ghost btn-sm" data-acao="nf-lembrar" data-nome="${esc(nomePessoa(e.pessoa))}">Lembrar</button></li>`).join("")}
            ${nfPendentes.length + entrevistasPendentes.length ? "" : '<li class="muted">Nenhuma nota pendente.</li>'}
          </ul>
        </div>
      </div>
      <div class="card">
        <div class="card-titulo"><div><h2>Conferência de notas recebidas</h2><p>Notas emitidas contra os CNPJs do Grupo × notas lançadas nas contas</p></div>
          <div class="flex">${regra("regra-conferencia-notas")}<button class="btn btn-sm" data-acao="notas-importar">${icone("file-up")}${portal.length ? "Importar de novo" : "Importar notas do portal (exemplo)"}</button></div></div>
        ${portal.length ? `<div class="tabela-wrap"><table>
          <thead><tr><th>NF</th><th>Emitente</th><th>Emissão</th><th class="num">Valor</th><th>No portal</th><th>No sistema</th></tr></thead>
          <tbody>${cruzadas.map(({ n, lanc }) => `<tr>
            <td class="mono">${esc(n.numero)}</td><td class="nome">${esc(n.emitente)}</td><td>${fmtDia(n.emissao)}</td><td class="num">${brl(n.valor)}</td>
            <td>${n.situacao === "Cancelada" ? badge("Cancelada", "vermelho", "ban") : badge("Válida", "verde")}</td>
            <td>${lanc ? (n.situacao === "Cancelada" && pagoConta(lanc.c) > 0 ? `${badge("Conta já paga!", "vermelho", "triangle-alert")}<span class="sub">${esc(lanc.c.descricao)} ${regra("regra-nota-cancelada")}</span>` : `${badge("Lançada", "verde", "link")}<span class="sub"><a class="link-projeto" href="#/pagar/${lanc.c.id}">${esc(lanc.c.descricao)}</a></span>`)
              : badge("Falta lançar", "ambar", "circle-help")}</td>
          </tr>`).join("")}</tbody>
        </table></div>` : `<p class="vazio">Importe o arquivo exportado do portal da prefeitura / Emissor Nacional para cruzar com as contas.</p>`}
      </div>`;
  },
});
