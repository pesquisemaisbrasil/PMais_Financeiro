// Planilhas e provisões, dentro de Contas a pagar (decisão K10 de 03/11: tudo o que se paga fica em Contas a pagar).
// Importar planilha de folha de campo ou de incentivos (cronograma por data de pagamento, com a data já informada na planilha
// ou calculada pela data da pesquisa + prazo do projeto), itens de um lançamento agrupado e provisões do orçamento do Connect.

const TELA_PLANILHAS = "Contas a pagar · planilhas e provisões";

ponto("tela-folha", TELA_PLANILHAS, "Folha de campo e incentivos entram como um lançamento com um item por pessoa, importado da planilha, direto em Contas a pagar.");
ponto("regra-lancamento-agrupado", TELA_PLANILHAS, "Importar a planilha cria um lançamento só, com um item por pessoa (não uma conta por pessoa). A planilha fica anexada e a soma dos itens é o valor do lançamento.");
ponto("regra-incentivo", TELA_PLANILHAS, "Incentivo ao respondente não tem nota fiscal: o item fica \"incentivo · sem documento\".");
ponto("regra-incentivo-planilha", TELA_PLANILHAS, "Mudança de 03/11: o incentivo ao respondente chega por e-mail, em planilha tirada do banco de respondentes. O Connect ainda não tem os respondentes, então por enquanto o Financeiro importa a planilha (pode ter 5 nomes ou mais de 200).");
ponto("regra-incentivo-prazo", TELA_PLANILHAS, "O prazo do incentivo depende do tipo de projeto e conta em dias úteis a partir da data da resposta (Health ≈ 10 dias úteis; o tipo que a reunião chamou de \"CLT\", 3 a 4; sábado, domingo e feriado não contam). O prazo fica no cadastro do projeto.");
ponto("regra-incentivo-por-data", TELA_PLANILHAS, "Uma planilha traz respostas de várias datas. O sistema lê a coluna \"data da pesquisa\" e cria um lançamento para cada data de pagamento, e mostra o cronograma para devolver ao projeto (hoje isso é calculado à mão).");
ponto("regra-incentivo-data-pagamento", TELA_PLANILHAS, "Mudança de 03/11: a planilha de incentivo pode já trazer a data de pagamento (ex.: \"200 incentivos, valor unitário R$ 50, total R$ 10.000, pagar dia 30\"). Quando a coluna \"data de pagamento\" vem preenchida, o sistema usa essa data; quando vem vazia, calcula pela data da pesquisa + prazo do tipo de projeto.");
ponto("regra-provisao", TELA_PLANILHAS, "A provisão nasce do orçamento por itens do Connect, com a data estimada. Quando o valor real chega, ele substitui a provisão, sem contar duas vezes.");

// Planilhas de exemplo que a pessoa pode "importar" (nada sai do computador).
// Incentivos: colunas nome, chave Pix, valor, data da pesquisa e, opcional, data de pagamento (modelo proposto, pergunta F24). Folha de campo: nome, documento, valor, nº da NF, emissão.
const datasPesquisa = (...pares) => pares.flatMap(([data, qtd]) => Array(qtd).fill(data));
const PLANILHAS_EXEMPLO = [
  {
    nome: "incentivos-PRJ-1811-health-outubro.xlsx", tipo: "Incentivos", projeto: 1811, categoria: 2,
    linhas: datasPesquisa(["2026-10-22", 5], ["2026-10-23", 4], ["2026-10-26", 3], ["2026-10-27", 3])
      .map((data, i) => [`Respondente H${String(i + 1).padStart(2, "0")}`, chaveFicticia(100 + i).chaveCompleta, "120,00", data]),
  },
  {
    nome: "incentivos-PRJ-1804-cati-outubro.xlsx", tipo: "Incentivos", projeto: 1804, categoria: 2,
    linhas: [
      ...datasPesquisa(["2026-10-26", 3], ["2026-10-27", 3], ["2026-10-28", 2]).map((data, i) => [`Respondente C${String(i + 1).padStart(2, "0")}`, chaveFicticia(200 + i).chaveCompleta, "200,00", data]),
      ["Respondente C09", chaveFicticia(209).chaveCompleta, "200,00", ""],
    ],
  },
  {
    // Caso "CLT" da reunião: a planilha já diz quanto pagar e em que dia ("200 incentivos, R$ 50 cada, total R$ 10.000, pagar dia 30").
    nome: "incentivos-PRJ-1804-cati-200-pagar-dia-30.xlsx", tipo: "Incentivos", projeto: 1804, categoria: 2,
    resumo: "200 incentivos · R$ 50,00 cada · total R$ 10.000,00 · pagar em 30/10",
    linhas: Array.from({ length: 200 }, (_, i) => [`Respondente CLT ${String(i + 1).padStart(3, "0")}`, chaveFicticia(300 + i).chaveCompleta, "50,00", "", "2026-10-30"]),
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
        <td class="num">${i.doc === "NF" && !i.nf ? `<button class="btn btn-ghost btn-sm" data-acao="item-nf" data-id="${c.id}" data-item="${i.id}" data-volta="1">Registrar NF</button>` : ""}</td>
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
    corpo: `<input type="hidden" name="id" value="${c.id}"><input type="hidden" name="item" value="${it.id}"><input type="hidden" name="volta" value="${d.volta || ""}">
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
  if (f.volta) abrirDetalhe(c.id, "itens");
  else fecharDialogo();
};

// Depois de criar lançamentos, a lista de Contas a pagar passa a mostrá-los (sem filtro escondendo e sem o período do dia).
function mostrarNoCP(visao, abrir = []) {
  Object.assign(UI.pagar, { aba: visao, modo: "tudo", indicador: "total", filtros: {}, busca: "", pagina: 1, sel: new Set() });
  abrir.forEach((id) => UI.pagar.abertos.add(id));
  if (abrir[0]) UI.pagar.foco = abrir[0];
}

// ---- Importar planilha (exemplo) ----

function lerPlanilha(p) {
  if (p.tipo === "Incentivos") return lerPlanilhaIncentivos(p);
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

function lerPlanilhaIncentivos(p) {
  return p.linhas.map(([nome, chaveCompleta, valorTxt, data, pagamento], i) => {
    const erros = [];
    if (!nome.trim()) erros.push("Nome vazio");
    if (/r\$|[a-z]/i.test(valorTxt)) erros.push("Use só números no valor");
    const valor = paraCentavos(valorTxt);
    if (!valor && !erros.length) erros.push("Valor inválido");
    const formato = /^\d{4}-\d{2}-\d{2}$/;
    if (pagamento && !formato.test(pagamento)) erros.push("Data de pagamento inválida");
    else if (!pagamento && !formato.test(data || "")) erros.push("Sem data de pagamento e sem data da pesquisa");
    else if (!pagamento && data && !formato.test(data)) erros.push("Data da pesquisa inválida");
    if (pagamento && data && formato.test(data) && pagamento < data) erros.push("Pagamento antes da data da pesquisa");
    return { linha: i + 2, nome, chaveCompleta, chave: mascararChave(chaveCompleta), valor, data: data || "", pagamento: pagamento || "", erros };
  });
}

// Cronograma: a data de pagamento vem da planilha, quando ela já traz (caso "CLT"); senão é a data da pesquisa + o prazo do projeto
// (em dias úteis, do cadastro). Sai um grupo por data de pagamento.
function cronogramaIncentivos(p, boas) {
  const projeto = achar("projetos", p.projeto);
  const prazo = projeto.temIncentivo ? projeto.prazoIncentivo : null;
  if (!prazo && boas.some((l) => !l.pagamento)) return { projeto, prazo: null, faltaPrazo: true, grupos: [] };
  const porPagamento = {};
  for (const l of boas) {
    const pagar = l.pagamento || somarDiasUteis(l.data, prazo);
    const g = (porPagamento[pagar] ??= { pagar, itens: [], datas: new Set(), informadas: 0 });
    g.itens.push(l);
    if (l.data) g.datas.add(l.data);
    if (l.pagamento) g.informadas++;
  }
  const grupos = Object.values(porPagamento).sort((a, b) => a.pagar.localeCompare(b.pagar))
    .map((g) => ({ ...g, datas: [...g.datas].sort(), total: soma(g.itens, (l) => l.valor) }));
  return { projeto, prazo, faltaPrazo: false, grupos };
}
const origemDataGrupo = (g) => (g.informadas === g.itens.length ? "informada na planilha" : g.informadas ? "informada em parte, o resto calculado" : "calculada pelo prazo");
const textoDatasPesquisa = (datas) => (datas.length ? datas.map((d) => fmtDia(d).slice(0, 5)).join(" e ") : "sem data da pesquisa");

ACOES["folha-importar"] = () => { UI.planilha = null; abrirImportarPlanilha(); };
ACOES["folha-planilha-ler"] = (d) => { UI.planilha = d.nome; abrirImportarPlanilha(); };
ACOES["folha-planilha-voltar"] = () => { UI.planilha = null; abrirImportarPlanilha(); };

ACOES["folha-copiar-cronograma"] = () => {
  const p = PLANILHAS_EXEMPLO.find((x) => x.nome === UI.planilha);
  const { projeto, prazo, grupos } = cronogramaIncentivos(p, lerPlanilha(p).filter((l) => !l.erros.length));
  const linhas = [
    `Cronograma de pagamento dos incentivos · ${codigoProjeto(projeto.id)} ${projeto.titulo}`,
    prazo ? `Prazo: ${plural(prazo, "dia útil", "dias úteis")} depois da data da pesquisa (${projeto.tipoProjeto}), quando a planilha não traz a data de pagamento.` : "Datas de pagamento informadas na planilha.",
    "",
    ...grupos.map((g) => `- ${g.datas.length ? `Pesquisas de ${textoDatasPesquisa(g.datas)}` : "Pesquisas"}: ${plural(g.itens.length, "incentivo", "incentivos")} → pagar ${fmtDia(g.pagar).slice(0, 5)} · ${brl(g.total)} (data ${origemDataGrupo(g)})`),
    "",
    `Total: ${plural(soma(grupos, (g) => g.itens.length), "incentivo", "incentivos")} · ${brl(soma(grupos, (g) => g.total))}`,
  ];
  navigator.clipboard?.writeText(linhas.join("\n")).then(() => toast("Cronograma copiado. Cole no e-mail ou no grupo do projeto."), () => toast("Não deu para copiar.", true));
};

function abrirImportarPlanilha() {
  const p = PLANILHAS_EXEMPLO.find((x) => x.nome === UI.planilha);
  if (!p) {
    return abrirDialogo({
      titulo: "Importar planilha",
      descricao: "Folha de campo ou incentivos. No sistema real você escolhe o .xlsx; aqui, uma planilha de exemplo.",
      largo: true,
      corpo: PLANILHAS_EXEMPLO.map((x) => `
        <div class="candidato">
          <div><strong>${x.nome}</strong><span>${x.tipo} · ${codigoProjeto(x.projeto)} · ${achar("projetos", x.projeto).tipoProjeto} · ${plural(x.linhas.length, "linha", "linhas")}${x.resumo ? ` · ${x.resumo}` : ""}</span></div>
          <button type="button" class="btn btn-outline btn-sm" data-acao="folha-planilha-ler" data-nome="${x.nome}">Ler planilha</button>
        </div>`).join("") + `<p class="pequeno muted" style="margin:0">Folha de campo: nome, documento (NF, RPA, Incentivo, Sem NF), valor, número da NF, emissão. ${regra("regra-lancamento-agrupado")}</p>
        <p class="pequeno muted" style="margin:6px 0 0">Incentivos: nome, chave Pix, valor, data da pesquisa e, se a planilha já trouxer, a data de pagamento. ${regra("regra-incentivo-planilha")} ${regra("regra-incentivo-data-pagamento")}</p>`,
    });
  }
  const linhas = lerPlanilha(p);
  const boas = linhas.filter((l) => !l.erros.length);
  const incentivos = p.tipo === "Incentivos";
  const cron = incentivos ? cronogramaIncentivos(p, boas) : null;
  const semPrazo = incentivos && cron.faltaPrazo;
  const jaImportada = S.contasPagar.some((c) => c.anexos.some((a) => a.nome === p.nome && !a.excluido));
  const nLanc = incentivos ? cron.grupos.length : 1;
  const nInformadas = incentivos ? boas.filter((l) => l.pagamento).length : 0;
  abrirDialogo({
    titulo: "Conferir antes de importar",
    descricao: `${p.nome} · ${p.tipo} · ${codigoProjeto(p.projeto)}`,
    largo: true,
    corpo: `
      ${jaImportada ? `<div class="aviso aviso-ambar">${icone("triangle-alert")}<div><strong>Esta planilha já foi importada</strong>Já existe lançamento com este arquivo anexado. Importar de novo cria lançamentos repetidos.</div></div>` : ""}
      <div class="kpis" style="margin-bottom:14px">
        ${kpi({ rotulo: "Linhas lidas", valor: String(linhas.length), ic: "file-spreadsheet" })}
        ${kpi({ rotulo: "Entram", valor: String(boas.length), detalhe: brl(soma(boas, (l) => l.valor)), ic: "circle-check", cor: "cor-verde" })}
        ${kpi({ rotulo: "Com erro", valor: String(linhas.length - boas.length), detalhe: "ficam de fora", ic: "circle-x", cor: linhas.length - boas.length ? "cor-vermelho" : "cor-verde" })}
        ${incentivos ? kpi({ rotulo: "Lançamentos", valor: String(nLanc), detalhe: "um por data de pagamento", ic: "calendar-range", cor: "cor-roxo" }) : ""}
      </div>
      ${incentivos ? (semPrazo
        ? `<div class="aviso aviso-vermelho">${icone("ban")}<div><strong>Este projeto não tem incentivo ou prazo marcado</strong>Marque o tipo, o incentivo e o prazo em Cadastros &gt; Projetos antes de importar. ${regra("regra-projeto-incentivo")}</div></div>`
        : `<div class="aviso aviso-azul">${icone("calendar-range")}<div><strong>Cronograma de pagamento: ${nInformadas === boas.length && boas.length ? "datas informadas na planilha" : `${esc(cron.projeto.tipoProjeto)}, ${plural(cron.prazo, "dia útil", "dias úteis")} depois da data da pesquisa${nInformadas ? " (onde a planilha não traz a data)" : ""}`}</strong>
            ${nInformadas ? `A planilha já traz a data de pagamento em ${plural(nInformadas, "linha", "linhas")}: essa data é usada. ${regra("regra-incentivo-data-pagamento")} ` : ""}${cron.prazo ? `Quando não traz, o prazo vem do cadastro do projeto e sábado, domingo e feriado não contam. ${regra("regra-incentivo-prazo")} ` : ""}${regra("regra-incentivo-por-data")}</div></div>
          <div class="card mb"><div class="tabela-wrap"><table>
            <thead><tr><th>Pagar em</th><th>Pesquisas de</th><th>Data de pagamento</th><th class="num">Incentivos</th><th class="num">Valor</th></tr></thead>
            <tbody>${cron.grupos.map((g) => `<tr><td class="nome">${fmtDia(g.pagar)}</td><td>${textoDatasPesquisa(g.datas)}</td><td class="pequeno muted">${origemDataGrupo(g)}</td><td class="num">${g.itens.length}</td><td class="num forte">${brl(g.total)}</td></tr>`).join("")}</tbody>
            <tfoot><tr class="total-linha"><td colspan="3">${plural(nLanc, "lançamento", "lançamentos")}</td><td class="num">${boas.length}</td><td class="num">${brl(soma(boas, (l) => l.valor))}</td></tr></tfoot>
          </table></div></div>`) : ""}
      <div class="card"><div class="tabela-wrap rolagem" style="max-height:300px"><table>
        ${incentivos ? `<thead><tr><th>Linha</th><th>Pessoa</th><th>Chave Pix</th><th>Data da pesquisa</th><th>Pagar em</th><th class="num">Valor</th><th></th></tr></thead>
        <tbody>${linhas.map((l) => `<tr>
          <td>${l.linha}</td><td class="nome">${esc(l.nome) || "—"}</td><td class="mono">${esc(l.chave) || "—"}</td>
          <td>${l.data ? fmtDia(l.data) : "—"}</td>
          <td>${l.erros.length || semPrazo ? "—" : l.pagamento ? `${fmtDia(l.pagamento)}<span class="sub">informada</span>` : `${fmtDia(somarDiasUteis(l.data, cron.prazo))}<span class="sub">calculada</span>`}</td>
          <td class="num">${l.valor ? brl(l.valor) : "—"}</td>
          <td>${l.erros.length ? `<span class="vermelho pequeno">${esc(l.erros.join("; "))}</span>` : badge("Ok", "verde")}</td>
        </tr>`).join("")}</tbody>`
        : `<thead><tr><th>Linha</th><th>Pessoa</th><th>Documento</th><th class="num">Bruto</th><th class="num">A pagar</th><th></th></tr></thead>
        <tbody>${linhas.map((l) => `<tr>
          <td>${l.linha}</td><td class="nome">${esc(l.nome) || "—"}</td>
          <td>${esc(l.doc)}${l.doc === "NF" ? `<span class="sub">${l.nf ? `nº ${esc(l.nf.numero)}` : "NF pendente (não bloqueia)"}</span>` : ""}</td>
          <td class="num">${l.bruto ? brl(l.bruto) : "—"}</td>
          <td class="num">${l.valor ? brl(l.valor) : "—"}${l.doc === "RPA" && l.bruto ? `<span class="sub">−${ALIQUOTA_INSS}% INSS</span>` : ""}</td>
          <td>${l.erros.length ? `<span class="vermelho pequeno">${esc(l.erros.join("; "))}</span>` : badge("Ok", "verde")}</td>
        </tr>`).join("")}</tbody>`}
      </table></div></div>`,
    rodape: `<button type="button" class="btn btn-outline" data-acao="folha-planilha-voltar">Voltar</button>
      ${incentivos && !semPrazo ? `<button type="button" class="btn btn-outline" data-acao="folha-copiar-cronograma">${icone("copy")}Copiar cronograma para o projeto</button>` : ""}
      <button type="button" class="btn" data-acao="folha-planilha-confirmar" ${boas.length && !semPrazo ? "" : "disabled"}>${icone("file-up")}Criar ${plural(nLanc, "lançamento", "lançamentos")} com ${plural(boas.length, "item", "itens")}</button>`,
  });
}

ACOES["folha-planilha-confirmar"] = () => {
  const p = PLANILHAS_EXEMPLO.find((x) => x.nome === UI.planilha);
  if (projetoFechado(p.projeto)) return toast("Projeto fechado — peça a reabertura a um administrador.", true);
  const boas = lerPlanilha(p).filter((l) => !l.erros.length);
  if (p.tipo === "Incentivos") return importarIncentivos(p, boas);
  const itens = boas.map((l, i) => item(i + 1, l.nome, l.doc, l.valor, { bruto: l.bruto, nf: l.nf, nfStatus: l.doc === "NF" ? (l.nf ? "Recebida" : "Pendente") : null }));
  const total = soma(itens, (i) => i.valor);
  const c = tituloPagar({
    id: proximoId(S.contasPagar), origem: "folha", unidade: achar("projetos", p.projeto).unidade, centroCusto: 1, favorecido: `${p.tipo} (${plural(itens.length, "pessoa", "pessoas")})`,
    categoria: p.categoria, forma: 1, data: HOJE, descricao: p.descricao, vencimento: somarDias(HOJE, 10), valor: total, rateio: [{ projeto: p.projeto, valor: total }],
    documento: { tipo: "Sem documento", numero: "", emissao: "", motivo: "Ver itens" }, docsRecebidosEm: HOJE,
    anexos: [{ id: 1, nome: p.nome, tipo: "Planilha", excluido: false }], itens,
  });
  S.contasPagar.push(c);
  auditar(`pagar:${c.id}`, `Criado pela planilha ${p.nome}: ${plural(itens.length, "item", "itens")}, ${brl(total)}`);
  fecharDialogo();
  mostrarNoCP("agrupados", [c.id]);
  salvar();
  toast(`${plural(itens.length, "item importado", "itens importados")} em 1 lançamento (${brl(total)}), vence ${fmtDia(c.vencimento)}. A planilha ficou anexada. Ele está aberto na lista de Contas a pagar.`);
};

// Incentivos: um lançamento por data de pagamento, cada um com os itens daquela data e a planilha anexada.
function importarIncentivos(p, boas) {
  const { projeto, grupos } = cronogramaIncentivos(p, boas);
  if (!grupos.length) return toast("Este projeto não tem incentivo ou prazo marcado.", true);
  const criados = grupos.map((g) => {
    const itens = g.itens.map((l, i) => item(i + 1, l.nome, "Incentivo", l.valor, { chave: l.chave, chaveCompleta: l.chaveCompleta, dataPesquisa: l.data }));
    const c = tituloPagar({
      id: proximoId(S.contasPagar), origem: "incentivo", unidade: projeto.unidade, centroCusto: 1, favorecido: `Incentivos (${plural(itens.length, "pessoa", "pessoas")})`,
      categoria: p.categoria, forma: 1, data: HOJE, competencia: (g.datas[0] || g.pagar).slice(0, 7), descricao: `Incentivos · ${codigoProjeto(p.projeto)} · pagar ${fmtDia(g.pagar).slice(0, 5)}`,
      vencimento: g.pagar, valor: g.total, rateio: [{ projeto: p.projeto, valor: g.total }],
      documento: { tipo: "Sem documento", numero: "", emissao: "", motivo: "Incentivo" }, anexos: [{ id: 1, nome: p.nome, tipo: "Planilha", excluido: false }], itens,
    });
    S.contasPagar.push(c);
    auditar(`pagar:${c.id}`, `Criado pela planilha ${p.nome}: ${plural(itens.length, "incentivo", "incentivos")} ${g.datas.length ? `das pesquisas de ${textoDatasPesquisa(g.datas)}` : ""}, ${brl(g.total)}, vence ${fmtDia(g.pagar)} (data ${origemDataGrupo(g)})`);
    return c;
  });
  fecharDialogo();
  mostrarNoCP("agrupados", [criados[0].id]);
  salvar();
  toast(`${plural(criados.length, "lançamento criado", "lançamentos criados")}, um por data de pagamento (${plural(boas.length, "incentivo", "incentivos")}, ${brl(soma(criados, (c) => c.valor))}). A planilha ficou anexada em cada um. Veja na lista de Contas a pagar.`);
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
  // Se o real não aparece com os filtros de agora (outro mês, outra visão), a lista passa a mostrá-lo.
  if (!filtrarPagar(UI.pagar).some((c) => c.id === real.id)) Object.assign(UI.pagar, { aba: "todas", modo: "tudo", indicador: "total", filtros: {}, busca: "", pagina: 1 });
  UI.pagar.foco = real.id;
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
  if (n) Object.assign(UI.pagar, { aba: "provisoes", modo: "tudo", indicador: "total", filtros: {}, busca: "", pagina: 1 });
  salvar();
  toast(n ? `${plural(n, "provisão criada", "provisões criadas")} a partir do orçamento do Connect.` : "Todos os itens do orçamento já têm provisão ou lançamento real.");
};
