// Folha, incentivos e notas: lançamento agrupado com itens (NF, RPA, incentivo), lista de RPA para a contabilidade,
// conferência das notas recebidas e provisões vindas do orçamento do Connect.

ponto("tela-folha", "Folha, incentivos e notas", "Folha de campo e incentivos entram como um lançamento com um item por pessoa, importado da planilha.");
ponto("regra-lancamento-agrupado", "Folha, incentivos e notas", "Importar a planilha cria um lançamento só, com um item por pessoa (não uma conta por pessoa). A planilha fica anexada e a soma dos itens é o valor do lançamento.");
ponto("regra-nf-nao-bloqueia", "Folha, incentivos e notas", "Mudança de 28/10: a NF do prestador chega pelo Connect, mas NÃO é mais obrigatória para pagar. \"NF pendente\" é só aviso; a pessoa entra no pagamento.");
ponto("regra-rpa", "Folha, incentivos e notas", "RPA: o INSS (11%, em configuração) é calculado, nunca digitado. Paga-se o líquido. A lista de RPA vai para a contabilidade emitir os recibos.");
ponto("regra-incentivo", "Folha, incentivos e notas", "Incentivo ao respondente não tem nota fiscal: o item fica \"incentivo · sem documento\".");
ponto("regra-conferencia-notas", "Folha, incentivos e notas", "Conferência de notas: o arquivo exportado do portal (prefeitura / Emissor Nacional) é cruzado com as notas lançadas. Mostra as que faltam e as canceladas.");
ponto("regra-nota-cancelada", "Folha, incentivos e notas", "Nota cancelada na prefeitura gera alerta na conta já paga com ela.");
ponto("regra-provisao", "Folha, incentivos e notas", "A provisão nasce do orçamento por itens do Connect, com a data estimada. Quando o valor real chega, ele substitui a provisão, sem contar duas vezes.");

// Planilhas de exemplo que a pessoa pode "importar" (nada sai do computador).
const PLANILHAS_EXEMPLO = [
  {
    nome: "incentivos-PRJ-1790-novembro.xlsx", tipo: "Incentivos", projeto: 1790, categoria: 2, descricao: "Incentivos aos entrevistados · PRJ-1790 · novembro",
    linhas: Array.from({ length: 14 }, (_, i) => [`Entrevistado ${String(i + 1).padStart(2, "0")}`, "Incentivo", "200,00", "", ""]),
  },
  {
    nome: "folha-campo-PRJ-1804-novembro.xlsx", tipo: "Folha de campo", projeto: 1804, categoria: 1, descricao: "Equipe de campo · PRJ-1804 · novembro",
    linhas: [
      ["Ana Ribeiro", "NF", "600,00", "58", "2026-10-27"],
      ["Bruno Lima", "NF", "600,00", "", ""],
      ["Carla Mendes", "RPA", "1.000,00", "", ""],
      ["Fábio Nunes", "RPA", "800,00", "", ""],
      ["Respondente 03", "Incentivo", "100,00", "", ""],
      ["", "NF", "350,00", "", ""],
      ["Elisa Prado", "NF", "R$ 400", "", ""],
    ],
  },
];

// Notas emitidas contra o CNPJ, como viriam do portal da prefeitura / Emissor Nacional.
const NOTAS_PORTAL = [
  { numero: "4521", emitente: "Gráfica Ponto Certo", emissao: "2026-10-20", valor: 125000, situacao: "Válida" },
  { numero: "889", emitente: "Hotel Central Curitiba", emissao: "2026-10-18", valor: 198000, situacao: "Válida" },
  { numero: "1203", emitente: "Contabilidade Exata", emissao: "2026-10-26", valor: 280000, situacao: "Válida" },
  { numero: "4470", emitente: "Gráfica Ponto Certo", emissao: "2026-10-08", valor: 48000, situacao: "Cancelada" },
  { numero: "312", emitente: "Transportes JK", emissao: "2026-10-19", valor: 54000, situacao: "Válida" },
];

function lancamentosAgrupados() { return S.contasPagar.filter((c) => c.itens && !c.cancelado); }
function composicao(c) {
  const n = (f) => c.itens.filter(f).length;
  return [
    [n((i) => i.doc === "NF" && i.nf), "NF", "verde"], [n((i) => i.doc === "NF" && !i.nf), "NF pendente", "ambar"],
    [n((i) => i.doc === "RPA"), "RPA", "azul"], [n((i) => i.doc === "Incentivo"), "incentivo", "roxo"], [n((i) => i.doc === "Sem NF"), "sem NF", "cinza"],
  ].filter(([q]) => q).map(([q, r, cor]) => badge(`${q} ${r}`, cor)).join(" ");
}

// Nota da conta que aparece cancelada no portal (depois de importar as notas).
function notaCanceladaDe(c) {
  if (!S.notasPortal || c.documento.tipo !== "NF") return null;
  return S.notasPortal.find((n) => n.situacao === "Cancelada" && n.numero === c.documento.numero && sem(n.emitente) === sem(quemRecebe(c)));
}

// Itens de um lançamento agrupado (usado também no detalhe da conta a pagar).
function tabelaItens(c) {
  const somaItens = soma(c.itens, (i) => i.valor);
  return `
    <div class="aviso aviso-azul">${icone("info")}<div><strong>NF pendente não bloqueia mais o pagamento</strong>A nota sobe no Connect; aqui é só aviso. ${regra("regra-nf-nao-bloqueia")}</div></div>
    <div class="card"><div class="tabela-wrap"><table>
      <thead><tr><th>Pessoa</th><th>Documento</th><th class="num">Bruto</th><th class="num">INSS</th><th class="num">A pagar</th><th>Pagamento</th><th></th></tr></thead>
      <tbody>${c.itens.map((i) => `<tr>
        <td class="nome">${esc(i.nome)}</td>
        <td>${i.doc === "NF" ? (i.nf ? `${badge("NF", "verde", "file-check")} <span class="sub">nº ${esc(i.nf.numero)} · emitida ${fmtDia(i.nf.emissao)}</span>` : `${badge("NF pendente no Connect", "ambar", "file-clock")}`)
          : i.doc === "RPA" ? badge("RPA", "azul") : i.doc === "Incentivo" ? `${badge("Incentivo", "roxo")}<span class="sub">sem documento</span>` : badge(i.doc, "cinza")}</td>
        <td class="num">${brl(i.bruto)}</td>
        <td class="num muted">${i.doc === "RPA" ? `− ${brl(i.bruto - i.valor)}` : "—"}</td>
        <td class="num forte">${brl(i.valor)}</td>
        <td>${i.pago ? `${badge("Pago", "verde", "circle-check")}<span class="sub">${fmtDia(i.pago.data)}</span>` : '<span class="muted pequeno">Em aberto</span>'}</td>
        <td class="num">${i.doc === "NF" && !i.nf ? `<button class="btn btn-ghost btn-sm" data-acao="item-nf" data-id="${c.id}" data-item="${i.id}">Registrar NF</button>` : ""}</td>
      </tr>`).join("")}</tbody>
      <tfoot><tr class="total-linha"><td colspan="4">${plural(c.itens.length, "item", "itens")} · ${plural(c.itens.filter((i) => i.pago).length, "pago", "pagos")}</td><td class="num">${brl(somaItens)}</td><td colspan="2" class="${somaItens === c.valor ? "verde" : "vermelho"}">${somaItens === c.valor ? "Bate com o lançamento" : `Os itens somam ${brl(somaItens)}, mas o lançamento é de ${brl(c.valor)}`}</td></tr></tfoot>
    </table></div></div>
    <p class="pequeno muted">${regra("regra-rpa")} ${regra("regra-incentivo")}</p>`;
}

ACOES["item-nf"] = (d) => {
  const c = achar("contasPagar", d.id);
  const it = c.itens.find((i) => i.id === Number(d.item));
  abrirDialogo({
    titulo: `NF de ${esc(it.nome)}`,
    descricao: "No sistema real a nota chega pelo Connect. Aqui você simula a chegada.",
    form: "item-nf",
    corpo: `<input type="hidden" name="id" value="${c.id}"><input type="hidden" name="item" value="${it.id}">
      <div class="linha-campos">
        <div class="campo"><label for="nf-num">Número da NF</label><input class="input" id="nf-num" name="numero" autofocus></div>
        <div class="campo"><label for="nf-em">Data de emissão</label><input class="input" id="nf-em" name="emissao" type="date" value="${HOJE}"></div>
      </div>`,
    rodape: `<button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Cancelar</button><button type="submit" class="btn">Registrar</button>`,
  });
};
FORMS["item-nf"] = (f) => {
  if (!f.numero.trim() || !f.emissao) return toast("Informe o número e a data de emissão da nota.", true);
  const c = achar("contasPagar", f.id);
  const it = c.itens.find((i) => i.id === Number(f.item));
  it.nf = { numero: f.numero.trim(), emissao: f.emissao };
  it.nfStatus = "Recebida";
  auditar(`pagar:${c.id}`, `NF ${it.nf.numero} de ${it.nome} recebida`);
  salvar();
  toast(`NF ${it.nf.numero} registrada para ${it.nome}.`);
  if (dialogo().open && UI.folha?.aba !== "notas") abrirDetalhe(c.id, "itens");
};

ACOES["folha-ver"] = (d) => abrirDetalhe(Number(d.id), "itens");

// ---- Importar planilha (exemplo) ----

function lerPlanilha(p) {
  return p.linhas.map(([nome, doc, valorTxt, nfNum, nfEm], i) => {
    const erros = [];
    if (!nome.trim()) erros.push("Nome vazio");
    if (/r\$|[a-z]/i.test(valorTxt)) erros.push("Use só números no valor");
    const bruto = paraCentavos(valorTxt);
    if (!bruto && !erros.length) erros.push("Valor inválido");
    const valor = doc === "RPA" && bruto ? liquidoRpa(bruto) : bruto;
    return { linha: i + 2, nome, doc, bruto, valor, nf: nfNum ? { numero: nfNum, emissao: nfEm } : null, erros };
  });
}

ACOES["folha-importar"] = () => { UI.planilha = null; abrirImportarPlanilha(); };
ACOES["folha-planilha-ler"] = (d) => { UI.planilha = d.nome; abrirImportarPlanilha(); };
ACOES["folha-planilha-voltar"] = () => { UI.planilha = null; abrirImportarPlanilha(); };

function abrirImportarPlanilha() {
  const p = PLANILHAS_EXEMPLO.find((x) => x.nome === UI.planilha);
  if (!p) {
    return abrirDialogo({
      titulo: "Importar planilha",
      descricao: "Folha de campo ou incentivos. No sistema real você escolhe o .xlsx; aqui, uma planilha de exemplo.",
      largo: true,
      corpo: PLANILHAS_EXEMPLO.map((x) => `
        <div class="candidato">
          <div><strong>${x.nome}</strong><span>${x.tipo} · ${codigoProjeto(x.projeto)} · ${plural(x.linhas.length, "linha", "linhas")}</span></div>
          <button type="button" class="btn btn-outline btn-sm" data-acao="folha-planilha-ler" data-nome="${x.nome}">Ler planilha</button>
        </div>`).join("") + `<p class="pequeno muted" style="margin:0">Colunas: nome, documento (NF, RPA, Incentivo, Sem NF), valor, número da NF, emissão. ${regra("regra-lancamento-agrupado")}</p>`,
    });
  }
  const linhas = lerPlanilha(p);
  const boas = linhas.filter((l) => !l.erros.length);
  abrirDialogo({
    titulo: "Conferir antes de importar",
    descricao: `${p.nome} · ${p.tipo} · ${codigoProjeto(p.projeto)}`,
    largo: true,
    corpo: `
      <div class="kpis" style="margin-bottom:14px">
        ${kpi({ rotulo: "Linhas lidas", valor: String(linhas.length), ic: "file-spreadsheet" })}
        ${kpi({ rotulo: "Entram", valor: String(boas.length), detalhe: brl(soma(boas, (l) => l.valor)), ic: "circle-check", cor: "cor-verde" })}
        ${kpi({ rotulo: "Com erro", valor: String(linhas.length - boas.length), detalhe: "ficam de fora", ic: "circle-x", cor: linhas.length - boas.length ? "cor-vermelho" : "cor-verde" })}
      </div>
      <div class="card"><div class="tabela-wrap" style="max-height:300px;overflow:auto"><table>
        <thead><tr><th>Linha</th><th>Pessoa</th><th>Documento</th><th class="num">Bruto</th><th class="num">A pagar</th><th></th></tr></thead>
        <tbody>${linhas.map((l) => `<tr>
          <td>${l.linha}</td><td class="nome">${esc(l.nome) || "—"}</td>
          <td>${esc(l.doc)}${l.doc === "NF" ? `<span class="sub">${l.nf ? `nº ${esc(l.nf.numero)}` : "NF pendente (não bloqueia)"}</span>` : ""}</td>
          <td class="num">${l.bruto ? brl(l.bruto) : "—"}</td>
          <td class="num">${l.valor ? brl(l.valor) : "—"}${l.doc === "RPA" && l.bruto ? `<span class="sub">−${ALIQUOTA_INSS}% INSS</span>` : ""}</td>
          <td>${l.erros.length ? `<span class="vermelho pequeno">${esc(l.erros.join("; "))}</span>` : badge("Ok", "verde")}</td>
        </tr>`).join("")}</tbody>
      </table></div></div>`,
    rodape: `<button type="button" class="btn btn-outline" data-acao="folha-planilha-voltar">Voltar</button>
      <button type="button" class="btn" data-acao="folha-planilha-confirmar" ${boas.length ? "" : "disabled"}>${icone("file-up")}Criar 1 lançamento com ${plural(boas.length, "item", "itens")}</button>`,
  });
}

ACOES["folha-planilha-confirmar"] = () => {
  const p = PLANILHAS_EXEMPLO.find((x) => x.nome === UI.planilha);
  if (projetoFechado(p.projeto)) return toast("Projeto fechado — peça a reabertura a um administrador.", true);
  const boas = lerPlanilha(p).filter((l) => !l.erros.length);
  const itens = boas.map((l, i) => item(i + 1, l.nome, l.doc, l.valor, { bruto: l.bruto, nf: l.nf, nfStatus: l.doc === "NF" ? (l.nf ? "Recebida" : "Pendente") : null }));
  const total = soma(itens, (i) => i.valor);
  const c = tituloPagar({
    id: proximoId(S.contasPagar), unidade: achar("projetos", p.projeto).unidade, centroCusto: 1, favorecido: `${p.tipo} (${plural(itens.length, "pessoa", "pessoas")})`,
    categoria: p.categoria, forma: 1, data: HOJE, descricao: p.descricao, vencimento: somarDias(HOJE, 10), valor: total, rateio: [{ projeto: p.projeto, valor: total }],
    documento: { tipo: "Sem documento", numero: "", emissao: "", motivo: "Ver itens" }, docsRecebidosEm: HOJE,
    anexos: [{ id: 1, nome: p.nome, tipo: "Planilha", excluido: false }], itens,
  });
  S.contasPagar.push(c);
  auditar(`pagar:${c.id}`, `Criado pela planilha ${p.nome}: ${plural(itens.length, "item", "itens")}, ${brl(total)}`);
  fecharDialogo();
  salvar();
  toast(`${plural(itens.length, "item importado", "itens importados")} em 1 lançamento (${brl(total)}). A planilha ficou anexada.`);
};

// ---- Lista de RPA e notas ----

ACOES["rpa-exportar"] = () => {
  const linhas = lancamentosAgrupados().flatMap((c) => c.itens.filter((i) => i.doc === "RPA").map((i) => [i.nome, c.rateio.map((r) => codigoProjeto(r.projeto)).join(" "), c.descricao, centavosParaCampo(i.bruto), centavosParaCampo(i.bruto - i.valor), centavosParaCampo(i.valor)]));
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

// ---- Provisões ----

ACOES["provisao-real"] = (d) => {
  const p = achar("contasPagar", d.id);
  const projeto = p.rateio[0]?.projeto;
  const reais = S.contasPagar.filter((c) => c.tipo === "real" && !c.cancelado && c.rateio.some((r) => r.projeto === projeto) && !S.contasPagar.some((x) => x.substituidaPor === c.id));
  abrirDialogo({
    titulo: "Substituir provisão pelo valor real",
    descricao: `${esc(p.descricao)} · provisão de ${brl(p.valor)} para ${fmtDia(p.vencimento)}`,
    form: "provisao-real",
    corpo: `<input type="hidden" name="id" value="${p.id}">
      <div class="campo"><label for="pr-qual">Qual é o valor real?</label>
        <select class="input" id="pr-qual" name="real" autofocus>
          ${reais.map((c) => `<option value="${c.id}">Conta já lançada: ${esc(c.descricao)} · ${brl(c.valor)}</option>`).join("")}
          <option value="novo">Lançar o valor real agora</option>
        </select></div>
      <div class="linha-campos">
        <div class="campo"><label for="pr-valor">Valor real (R$), se for lançar agora</label><input class="input" id="pr-valor" name="valor" inputmode="decimal" placeholder="${centavosParaCampo(p.valor)}"></div>
        <div class="campo"><label for="pr-forn">Fornecedor</label><select class="input" id="pr-forn" name="fornecedor">${opcoes(S.fornecedores.filter((f) => f.ativo), null, (f) => f.apelido)}</select></div>
      </div>
      <p class="pequeno muted" style="margin:0">A provisão sai do previsto e o real entra no lugar. ${regra("regra-provisao")}</p>`,
    rodape: `<button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Cancelar</button><button type="submit" class="btn">Substituir</button>`,
  });
};
FORMS["provisao-real"] = (f) => {
  const p = achar("contasPagar", f.id);
  let real;
  if (f.real === "novo") {
    const valor = paraCentavos(f.valor);
    if (!valor) return toast("Informe o valor real.", true);
    real = tituloPagar({ id: proximoId(S.contasPagar), unidade: p.unidade, centroCusto: p.centroCusto, fornecedor: Number(f.fornecedor), categoria: p.categoria, forma: p.forma, data: HOJE, descricao: p.descricao, vencimento: p.vencimento, valor, rateio: p.rateio.map((r) => ({ ...r, valor })), itemOrcamento: p.itemOrcamento });
    S.contasPagar.push(real);
    auditar(`pagar:${real.id}`, `Lançada como valor real da provisão "${p.descricao}"`);
  } else {
    real = achar("contasPagar", f.real);
  }
  p.substituidaPor = real.id;
  auditar(`pagar:${p.id}`, `Provisão de ${brl(p.valor)} substituída pelo real "${real.descricao}" (${brl(real.valor)})`);
  fecharDialogo();
  salvar();
  const dif = real.valor - p.valor;
  toast(`Provisão de ${brl(p.valor)} substituída pelo real de ${brl(real.valor)}${dif ? ` (${brl(Math.abs(dif))} ${dif > 0 ? "acima" : "abaixo"})` : ""}. Saiu do previsto.`);
};
ACOES["provisao-gerar"] = () => {
  let n = 0;
  for (const p of S.projetos.filter((x) => !projetoFechado(x.id))) for (const it of p.itens) {
    const existe = S.contasPagar.some((c) => c.itemOrcamento?.projeto === p.id && c.itemOrcamento?.item === it.item);
    if (existe) continue;
    S.contasPagar.push(tituloPagar({ id: proximoId(S.contasPagar), tipo: "provisao", unidade: p.unidade, centroCusto: 1, favorecido: "Provisão", categoria: it.categoria, forma: 1, descricao: `${it.item} · ${codigoProjeto(p.id)}`, vencimento: it.data, valor: it.valor, rateio: [{ projeto: p.id, valor: it.valor }], itemOrcamento: { projeto: p.id, item: it.item } }));
    n++;
  }
  salvar();
  toast(n ? `${plural(n, "provisão criada", "provisões criadas")} a partir do orçamento do Connect.` : "Todos os itens do orçamento já têm provisão ou lançamento real.");
};

// ---- Tela ----

registrarTela({
  rota: "folha",
  titulo: "Folha, incentivos e notas",
  icone: "layers",
  grupo: "Dia a dia",
  contador: () => S.contasPagar.filter((c) => c.tipo === "provisao" && !c.substituidaPor && c.vencimento <= somarDias(HOJE, 10)).length,
  render() {
    const ui = (UI.folha ??= { aba: "lancamentos" });
    const agrupados = lancamentosAgrupados();
    const itens = agrupados.flatMap((c) => c.itens.map((i) => ({ ...i, c })));
    const nfPendentes = itens.filter((i) => i.doc === "NF" && !i.nf);
    const rpas = itens.filter((i) => i.doc === "RPA");
    const provisoes = S.contasPagar.filter((c) => c.tipo === "provisao");
    const abertas = provisoes.filter((p) => !p.substituidaPor);

    let corpo;
    if (ui.aba === "notas") {
      const lancadas = notasLancadas();
      const portal = S.notasPortal || [];
      const cruzadas = portal.map((n) => ({ n, lanc: lancadas.find((l) => l.numero === n.numero && sem(l.emitente) === sem(n.emitente)) }));
      const entrevistasPendentes = S.entrevistas.filter((e) => e.nf === "Pendente");
      corpo = `
        <div class="grade grade-2" style="padding:16px">
          <div class="card">
            <div class="card-titulo"><div><h2>Lista de RPA</h2><p>Para a contabilidade emitir os recibos</p></div><button class="btn btn-outline btn-sm" data-acao="rpa-exportar">${icone("download")}Exportar</button></div>
            ${rpas.length ? `<table><thead><tr><th>Pessoa</th><th class="num">Bruto</th><th class="num">INSS</th><th class="num">Líquido</th></tr></thead>
              <tbody>${rpas.map((i) => `<tr><td class="nome">${esc(i.nome)}<span class="sub">${esc(i.c.descricao)}</span></td><td class="num">${brl(i.bruto)}</td><td class="num muted">− ${brl(i.bruto - i.valor)}</td><td class="num forte">${brl(i.valor)}</td></tr>`).join("")}</tbody></table>` : `<p class="vazio">Nenhum RPA no período.</p>`}
            <p class="pequeno muted" style="padding:0 16px 12px;margin:0">${regra("regra-rpa")}</p>
          </div>
          <div class="card">
            <div class="card-titulo"><div><h2>NF pendente</h2><p>Só aviso: não tira ninguém do pagamento</p></div>${regra("regra-nf-nao-bloqueia")}</div>
            <ul class="lista">
              ${nfPendentes.map((i) => `<li><span class="icone cor-ambar">${icone("file-clock")}</span><div class="texto"><strong>${esc(i.nome)}</strong><span>${esc(i.c.descricao)} · ${brl(i.valor)}</span></div>
                <button class="btn btn-ghost btn-sm" data-acao="item-nf" data-id="${i.c.id}" data-item="${i.id}">Registrar NF</button></li>`).join("")}
              ${entrevistasPendentes.map((e) => `<li><span class="icone cor-ambar">${icone("file-clock")}</span><div class="texto"><strong>${esc(nomePessoa(e.pessoa))}</strong><span>Entrevistas do ${codigoProjeto(e.projeto)} · nota pendente no Connect</span></div>
                <button class="btn btn-ghost btn-sm" data-acao="nf-lembrar" data-nome="${esc(nomePessoa(e.pessoa))}">Lembrar</button></li>`).join("")}
              ${nfPendentes.length + entrevistasPendentes.length ? "" : '<li class="muted">Nenhuma nota pendente.</li>'}
            </ul>
          </div>
        </div>
        <div class="card" style="margin:0 16px 16px">
          <div class="card-titulo"><div><h2>Conferência de notas recebidas</h2><p>Notas emitidas contra os CNPJs do Grupo × notas lançadas nas contas</p></div>
            <div class="flex">${regra("regra-conferencia-notas")}<button class="btn btn-sm" data-acao="notas-importar">${icone("file-up")}${portal.length ? "Importar de novo" : "Importar notas do portal (exemplo)"}</button></div></div>
          ${portal.length ? `<div class="tabela-wrap"><table>
            <thead><tr><th>NF</th><th>Emitente</th><th>Emissão</th><th class="num">Valor</th><th>No portal</th><th>No sistema</th></tr></thead>
            <tbody>${cruzadas.map(({ n, lanc }) => `<tr>
              <td class="mono">${esc(n.numero)}</td><td class="nome">${esc(n.emitente)}</td><td>${fmtDia(n.emissao)}</td><td class="num">${brl(n.valor)}</td>
              <td>${n.situacao === "Cancelada" ? badge("Cancelada", "vermelho", "ban") : badge("Válida", "verde")}</td>
              <td>${lanc ? (n.situacao === "Cancelada" && pagoConta(lanc.c) > 0 ? `${badge("Conta já paga!", "vermelho", "triangle-alert")}<span class="sub">${esc(lanc.c.descricao)} ${regra("regra-nota-cancelada")}</span>` : `${badge("Lançada", "verde", "link")}<span class="sub">${esc(lanc.c.descricao)}</span>`)
                : badge("Falta lançar", "ambar", "circle-help")}</td>
            </tr>`).join("")}</tbody>
          </table></div>` : `<p class="vazio">Importe o arquivo exportado do portal da prefeitura / Emissor Nacional para cruzar com as contas.</p>`}
        </div>`;
    } else if (ui.aba === "provisoes") {
      corpo = `
        <div style="padding:16px 16px 0"><div class="aviso aviso-azul">${icone("info")}<div>
          <strong>Provisões vêm do orçamento por itens do Connect</strong>Cada item com valor e data estimada vira provisão no fluxo de caixa. Quando o real chega, ele substitui a provisão. ${regra("regra-provisao")}
        </div></div></div>
        <div class="tabela-wrap"><table>
          <thead><tr><th>Projeto · item</th><th>Data estimada</th><th class="num">Provisionado</th><th>Situação</th><th class="num">Real</th><th class="num">Diferença</th><th></th></tr></thead>
          <tbody>${provisoes.map((p) => {
            const real = p.substituidaPor ? achar("contasPagar", p.substituidaPor) : null;
            const dif = real ? real.valor - p.valor : null;
            return `<tr>
              <td class="nome">${esc(p.descricao)}<span class="sub">${esc(achar("projetos", p.rateio[0]?.projeto)?.titulo)}</span></td>
              <td>${fmtDia(p.vencimento)}</td>
              <td class="num">${brl(p.valor)}</td>
              <td>${real ? badge("Substituída", "verde", "circle-check") : badge("Provisionada", "roxo", "piggy-bank")}</td>
              <td class="num">${real ? brl(real.valor) : "—"}</td>
              <td class="num ${dif > 0 ? "vermelho" : dif < 0 ? "verde" : ""}">${dif == null ? "—" : dif === 0 ? "igual" : `${dif > 0 ? "+" : "−"}${brl(Math.abs(dif))}`}</td>
              <td class="num">${real ? "" : `<button class="btn btn-outline btn-sm" data-acao="provisao-real" data-id="${p.id}">${icone("replace")}Substituir por real</button>`}</td>
            </tr>`;
          }).join("")}</tbody>
        </table></div>`;
    } else {
      corpo = agrupados.length ? `<div class="tabela-wrap"><table>
        <thead><tr><th>Lançamento</th><th>Projeto</th><th>Composição</th><th class="num">Total</th><th>Itens pagos</th><th>Situação</th><th></th></tr></thead>
        <tbody>${agrupados.map((c) => {
          const pagos = c.itens.filter((i) => i.pago).length;
          return `<tr>
            <td><span class="nome">${esc(c.descricao)}</span><span class="sub">${esc(c.anexos.find((a) => a.tipo === "Planilha" && !a.excluido)?.nome || "sem planilha")}${documentacaoAtrasada(c) ? ' · <span class="ambar forte">documentação atrasada</span>' : ""}</span></td>
            <td>${textoRateio(c.rateio)}</td>
            <td>${composicao(c)}</td>
            <td class="num forte">${brl(c.valor)}</td>
            <td style="min-width:120px"><div class="pequeno muted">${pagos} de ${c.itens.length}</div><div class="progresso verde"><span style="width:${Math.round((pagos / c.itens.length) * 100)}%"></span></div></td>
            <td>${badgeSituacao(situacaoPagar(c))}</td>
            <td class="num"><button class="btn btn-outline btn-sm" data-acao="folha-ver" data-id="${c.id}">${icone("list")}Ver itens</button></td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>` : `<p class="vazio">Nenhum lançamento agrupado. Importe uma planilha para começar.</p>`;
    }

    return `
      ${cabecalho({ titulo: "Folha, incentivos e notas", icone: "layers", tela: "tela-folha",
        subtitulo: "Folha de campo e incentivos entram de uma vez, com um item por pessoa. Notas, RPA e provisões ficam aqui também.",
        acoes: `${ui.aba === "provisoes" ? `<button class="btn btn-outline" data-acao="provisao-gerar">${icone("refresh-cw")}Atualizar do orçamento do Connect</button>` : ""}<button class="btn" data-acao="folha-importar">${icone("file-up")}Importar planilha</button>` })}
      <div class="kpis">
        ${kpi({ rotulo: "Lançamentos agrupados", valor: String(agrupados.length), detalhe: `${plural(itens.length, "item", "itens")} · ${brl(soma(agrupados, saldoPagar))} em aberto`, ic: "layers" })}
        ${kpi({ rotulo: "NF pendente", valor: String(nfPendentes.length), detalhe: "aviso, não bloqueia", ic: "file-clock", cor: "cor-ambar" })}
        ${kpi({ rotulo: "RPA no período", valor: String(rpas.length), detalhe: `${brl(soma(rpas, (i) => i.bruto - i.valor))} de INSS`, ic: "receipt", cor: "cor-azul" })}
        ${kpi({ rotulo: "Provisionado em aberto", valor: brl(soma(abertas, (p) => p.valor)), detalhe: plural(abertas.length, "provisão", "provisões"), ic: "piggy-bank", cor: "cor-roxo" })}
      </div>
      <div class="card">
        <div class="barra">${abas("folha", [{ id: "lancamentos", rotulo: "Lançamentos agrupados", n: agrupados.length }, { id: "notas", rotulo: "Notas e RPA", n: nfPendentes.length || null }, { id: "provisoes", rotulo: "Provisões", n: abertas.length }], ui.aba)}</div>
        ${corpo}
      </div>`;
  },
});
