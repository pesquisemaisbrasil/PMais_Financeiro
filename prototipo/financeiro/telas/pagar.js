// Contas a pagar: painel por período, indicadores, filtros, colunas, lançamento com rateio e recorrência,
// baixa (parcial, lote, estorno, volta), documentos, autorização acima do orçamento e histórico.

ponto("tela-pagar", "Contas a pagar", "O painel mostra as contas do período com indicadores clicáveis, filtros combináveis e ações em lote.");
ponto("regra-rateio", "Contas a pagar", "Rateio: cole uma linha por projeto com \"código;valor\" (só números). A soma tem que dar o valor da conta; a linha que não fecha aparece antes de salvar.");
ponto("regra-baixa-parcial", "Contas a pagar", "Baixa pode ser parcial, nunca passa do pendente (salvo juros/multa declarados). A data é o dia em que o dinheiro saiu; data no passado pede observação.");
ponto("regra-estorno", "Contas a pagar", "Baixa não se edita nem se apaga: corrige com estorno (com motivo) e nova baixa. As duas ficam visíveis.");
ponto("regra-volta-titulo", "Contas a pagar", "Pix devolvido: a conta fica \"Devolvida\" e o valor volta a pendente. O novo pagamento é uma nova baixa com a data real.");
ponto("regra-recorrencia", "Contas a pagar", "Recorrência: dia que não existe no mês vira o último dia; fim de semana e feriado vão para o próximo dia útil. Parcelado põe a diferença de centavos na última parcela.");
ponto("regra-estimada", "Contas a pagar", "Conta fixa de valor variável (luz) é repetida com o valor estimado; todo mês a ocorrência é trocada pelo valor real, sem mexer nas seguintes.");
ponto("regra-serie-escopo", "Contas a pagar", "Mudar uma ocorrência da série pergunta: só esta, esta e as seguintes, ou todas em aberto. Ocorrência paga nunca muda.");
ponto("regra-codigo-barras", "Contas a pagar", "O código de barras do boleto tem campo próprio (não vai mais na observação) e pode ser copiado com um clique.");
ponto("regra-autorizacao", "Contas a pagar", "Conta que passa do orçado para a categoria no projeto fica \"Pendente de autorização\" e não pode ser paga até um administrador liberar.");
ponto("regra-doc-atrasada", "Contas a pagar", "Documentação (nota, folha, planilha) que chega com menos de 3 dias do vencimento fica marcada \"documentação atrasada\".");
ponto("regra-excluir", "Contas a pagar", "Conta com baixa não pode ser excluída: estorne antes. Excluir em lote só aceita contas sem baixa.");
ponto("regra-lote", "Contas a pagar", "Ação em lote mostra antes quantas contas e qual o total, pede confirmação e grava uma linha de auditoria por conta.");
ponto("regra-transferencia", "Contas a pagar", "Transferência entre empresas do Grupo é marcada na conta, para o consolidado não contar duas vezes.");
ponto("regra-projeto-fechado", "Contas a pagar", "Projeto encerrado não aceita conta nova nem mudança de valor; só um administrador reabre o projeto.");
ponto("regra-anexos", "Contas a pagar", "Anexos: PDF, imagem, planilha, documento ou XML até 20 MB, no máximo 50 por conta. Arquivo suspeito é recusado. Excluir é lógico, com motivo.");

const COLUNAS_PAGAR = [
  { id: "vencimento", rotulo: "Vencimento", fixa: true },
  { id: "fornecedor", rotulo: "Fornecedor", fixa: true },
  { id: "documento", rotulo: "Documento" },
  { id: "projeto", rotulo: "Projeto" },
  { id: "categoria", rotulo: "Categoria" },
  { id: "centro", rotulo: "Centro de custo" },
  { id: "forma", rotulo: "Forma" },
  { id: "empresa", rotulo: "Empresa" },
  { id: "situacao", rotulo: "Situação" },
  { id: "valor", rotulo: "Valor", num: true },
  { id: "pago", rotulo: "Pago", num: true },
  { id: "pendente", rotulo: "Pendente", num: true },
];
const COLUNAS_PADRAO = ["vencimento", "fornecedor", "projeto", "categoria", "situacao", "valor", "pendente"];

function textoRateio(rateio) {
  if (!rateio.length) return '<span class="muted">—</span>';
  if (rateio.length === 1) return codigoProjeto(rateio[0].projeto);
  return `<span title="${rateio.map((r) => `${codigoProjeto(r.projeto)}: ${brl(r.valor)}`).join(", ")}">${rateio.length} projetos</span>`;
}
function textoDocumento(doc) {
  if (doc.tipo === "NF") return `NF ${esc(doc.numero)}`;
  return esc(doc.tipo);
}

// ---- Período ----

function intervalo(modo, ref) {
  if (modo === "dia") return [ref, ref];
  if (modo === "semana") { const dow = (new Date(ref + "T12:00:00Z").getUTCDay() + 6) % 7; const ini = somarDias(ref, -dow); return [ini, somarDias(ini, 6)]; }
  if (modo === "mes") return [ref.slice(0, 8) + "01", somarDias(mesesDepois(ref.slice(0, 8) + "01", 1), -1)];
  if (modo === "ano") return [ref.slice(0, 4) + "-01-01", ref.slice(0, 4) + "-12-31"];
  return ["0000-01-01", "9999-12-31"];
}
function rotuloPeriodo(modo, ref) {
  const [a, b] = intervalo(modo, ref);
  if (modo === "dia") return fmtDia(a);
  if (modo === "semana") return `${fmtDia(a)} a ${fmtDia(b)}`;
  if (modo === "mes") return nomeMes(a.slice(0, 7));
  if (modo === "ano") return a.slice(0, 4);
  return "Todo o período";
}
function moverPeriodo(modo, ref, passo) {
  if (modo === "dia") return somarDias(ref, passo);
  if (modo === "semana") return somarDias(ref, 7 * passo);
  if (modo === "mes") return mesesDepois(ref.slice(0, 8) + "01", passo);
  if (modo === "ano") return mesesDepois(ref.slice(0, 8) + "01", 12 * passo);
  return ref;
}

// ---- Filtros ----

const INDICADORES_PAGAR = {
  total: { rotulo: "Total", f: (c) => !c.cancelado && !c.substituidaPor },
  pagos: { rotulo: "Pagos", f: (c) => situacaoPagar(c) === "Paga" },
  pendentes: { rotulo: "Pendentes", f: (c) => emAberto(c) && c.tipo === "real" },
  vencidos: { rotulo: "Vencidos", f: (c) => ["Vencida", "Devolvida"].includes(situacaoPagar(c)) },
  hoje: { rotulo: "Hoje", f: (c) => situacaoPagar(c) === "Vence hoje" },
  avencer: { rotulo: "A vencer", f: (c) => ["A vencer", "Parcial", "Pendente de autorização"].includes(situacaoPagar(c)) && c.tipo === "real" },
  provisoes: { rotulo: "Provisões", f: (c) => c.tipo === "provisao" && !c.substituidaPor },
};

function filtrarPagar(ui) {
  const [ini, fim] = intervalo(ui.modo, ui.ref);
  const termo = (ui.busca || "").trim().toLowerCase();
  const f = ui.filtros;
  return S.contasPagar.filter((c) =>
    c.vencimento >= ini && c.vencimento <= fim &&
    INDICADORES_PAGAR[ui.indicador].f(c) &&
    (!f.fornecedor || String(c.fornecedor) === f.fornecedor) &&
    (!f.projeto || c.rateio.some((r) => String(r.projeto) === f.projeto)) &&
    (!f.categoria || String(c.categoria) === f.categoria) &&
    (!f.empresa || c.empresa === f.empresa) &&
    (!f.centro || String(c.centroCusto) === f.centro) &&
    (!f.forma || String(c.forma) === f.forma) &&
    (!f.tipo || c.tipo === f.tipo) &&
    (!termo || `${quemRecebe(c)} ${c.descricao} ${nomeCategoria(c.categoria)} ${c.documento.numero}`.toLowerCase().includes(termo)));
}

function valorColuna(c, col) {
  switch (col) {
    case "vencimento": return c.vencimento;
    case "fornecedor": return quemRecebe(c);
    case "valor": return c.valor;
    case "pago": return pagoConta(c);
    case "pendente": return saldoPagar(c);
    case "situacao": return situacaoPagar(c);
    case "categoria": return nomeCategoria(c.categoria);
    default: return "";
  }
}

function celula(c, col) {
  switch (col) {
    case "vencimento": return `<td>${fmtDia(c.vencimento)}</td>`;
    case "fornecedor": return `<td><span class="nome">${esc(quemRecebe(c))}</span><span class="sub">${esc(c.descricao)}${c.serie ? ` · ${c.serie.n}/${c.serie.total}` : ""}${c.transferencia ? " · transferência entre empresas" : ""}${documentacaoAtrasada(c) ? ' · <span class="ambar forte">documentação atrasada</span>' : ""}</span></td>`;
    case "documento": return `<td>${textoDocumento(c.documento)}</td>`;
    case "projeto": return `<td>${textoRateio(c.rateio)}</td>`;
    case "categoria": return `<td>${esc(nomeCategoria(c.categoria))}</td>`;
    case "centro": return `<td>${esc(nomeCentro(c.centroCusto))}</td>`;
    case "forma": return `<td>${esc(nomeForma(c.forma))}</td>`;
    case "empresa": return `<td>${nomeEmpresa(c.empresa)}</td>`;
    case "situacao": return `<td>${c.tipo === "provisao" ? badge("Provisão", "roxo", "piggy-bank") + " " : ""}${badgeSituacao(situacaoPagar(c))}</td>`;
    case "valor": return `<td class="num">${brl(c.valor)}</td>`;
    case "pago": return `<td class="num verde">${pagoConta(c) ? brl(pagoConta(c)) : "—"}</td>`;
    case "pendente": return `<td class="num forte">${saldoPagar(c) ? brl(saldoPagar(c)) : "—"}</td>`;
    default: return "<td></td>";
  }
}

ACOES["pagar-indicador"] = (d) => { Object.assign(UI.pagar, { indicador: d.id, pagina: 1, sel: new Set() }); render(); };
ACOES["pagar-modo"] = (d, el) => { Object.assign(UI.pagar, { modo: el.value, pagina: 1 }); render(); };
ACOES["pagar-mover"] = (d) => { UI.pagar.ref = d.p === "0" ? HOJE : moverPeriodo(UI.pagar.modo, UI.pagar.ref, Number(d.p)); UI.pagar.pagina = 1; render(); };
ACOES["pagar-filtro"] = (d, el) => { UI.pagar.filtros[d.campo] = el.value; UI.pagar.pagina = 1; render(); };
ACOES["pagar-limpar"] = () => { Object.assign(UI.pagar, { filtros: {}, busca: "", indicador: "total", pagina: 1 }); render(); };
ACOES["pagar-ordenar"] = (d) => { const ui = UI.pagar; ui.ordem = { col: d.col, dir: ui.ordem.col === d.col ? -ui.ordem.dir : 1 }; render(); };
ACOES["pagar-colunas"] = () => abrirDialogo({
  titulo: "Escolher colunas",
  form: "pagar-colunas",
  corpo: COLUNAS_PAGAR.map((c) => `<label class="flex" style="margin-bottom:8px"><input type="checkbox" class="check" name="col-${c.id}" ${UI.pagar.colunas.includes(c.id) ? "checked" : ""} ${c.fixa ? "disabled" : ""}> ${c.rotulo}${c.fixa ? ' <span class="muted pequeno">(sempre)</span>' : ""}</label>`).join(""),
  rodape: `<button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Cancelar</button><button type="submit" class="btn">Aplicar</button>`,
});
FORMS["pagar-colunas"] = (f) => { UI.pagar.colunas = COLUNAS_PAGAR.filter((c) => c.fixa || f[`col-${c.id}`]).map((c) => c.id); fecharDialogo(); render(); };

ACOES["pagar-exportar"] = () => {
  const ui = UI.pagar;
  const lista = filtrarPagar(ui);
  const filtros = Object.entries(ui.filtros).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(", ") || "nenhum";
  baixarCsv(`contas-a-pagar-${ui.ref}.csv`, [
    [`Contas a pagar · ${rotuloPeriodo(ui.modo, ui.ref)} · ${INDICADORES_PAGAR[ui.indicador].rotulo} · filtros: ${filtros}${ui.busca ? ` · busca: ${ui.busca}` : ""}`],
    ["Vencimento", "Fornecedor", "Descrição", "Documento", "Projeto", "Categoria", "Centro de custo", "Forma", "Empresa", "Situação", "Valor", "Pago", "Pendente"],
    ...lista.map((c) => [fmtDia(c.vencimento), quemRecebe(c), c.descricao, c.documento.tipo === "NF" ? `NF ${c.documento.numero}` : c.documento.tipo, c.rateio.map((r) => codigoProjeto(r.projeto)).join(" "), nomeCategoria(c.categoria), nomeCentro(c.centroCusto), nomeForma(c.forma), nomeEmpresa(c.empresa), situacaoPagar(c), centavosParaCampo(c.valor), centavosParaCampo(pagoConta(c)), centavosParaCampo(saldoPagar(c))]),
  ]);
  toast(`${plural(lista.length, "conta exportada", "contas exportadas")} com os filtros no cabeçalho.`);
};

// ---- Seleção e lote ----

ACOES["pagar-selecionar"] = (d, el) => {
  const ui = UI.pagar;
  if (d.id === "todas") ui.sel = el.checked ? new Set(el.dataset.ids.split(",").filter(Boolean).map(Number)) : new Set();
  else el.checked ? ui.sel.add(Number(d.id)) : ui.sel.delete(Number(d.id));
  render();
};
function selecionadas() { return [...UI.pagar.sel].map((id) => achar("contasPagar", id)).filter(Boolean); }

ACOES["lote-baixa"] = () => {
  const contas = selecionadas().filter((c) => emAberto(c) && c.tipo === "real");
  if (!contas.length) return toast("Nenhuma conta em aberto na seleção.", true);
  abrirDialogo({
    titulo: "Baixa em lote",
    descricao: `${plural(contas.length, "conta", "contas")} · total pendente ${brl(soma(contas, saldoPagar))}. Cada uma é baixada pelo seu pendente.`,
    form: "lote-baixa",
    corpo: `
      <div class="linha-campos-3">
        <div class="campo"><label for="lb-data">Data em que saiu</label><input class="input" id="lb-data" name="data" type="date" value="${HOJE}"></div>
        <div class="campo"><label for="lb-conta">Conta bancária</label><select class="input" id="lb-conta" name="conta">${opcoes(S.contasBancarias.filter((b) => b.ativo))}</select></div>
        <div class="campo"><label for="lb-forma">Forma</label><select class="input" id="lb-forma" name="forma">${opcoes(S.formasPagamento.filter((x) => x.ativo))}</select></div>
      </div>
      <p class="pequeno muted" style="margin:0">${regra("regra-lote")}</p>`,
    rodape: `<button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Cancelar</button><button type="submit" class="btn btn-verde">${icone("check-check")}Baixar ${plural(contas.length, "conta", "contas")}</button>`,
  });
};
FORMS["lote-baixa"] = (f) => {
  const contas = selecionadas().filter((c) => emAberto(c) && c.tipo === "real");
  const bloqueadas = contas.filter((c) => c.autorizacao === "pendente");
  if (bloqueadas.length) return toast(`${plural(bloqueadas.length, "conta está", "contas estão")} acima do orçamento e ainda não ${bloqueadas.length === 1 ? "foi autorizada" : "foram autorizadas"}.`, true);
  for (const c of contas) { const e = erroPeriodo(c.empresa, f.data); if (e) return toast(e, true); }
  const total = soma(contas, saldoPagar);
  for (const c of contas) {
    const v = saldoPagar(c);
    c.baixas.push(baixa(proximoId(c.baixas), f.data, v, Number(f.conta), Number(f.forma), { origem: "Baixa em lote" }));
    auditar(`pagar:${c.id}`, `Baixa em lote: ${brl(v)} em ${fmtDia(f.data)}`);
  }
  UI.pagar.sel = new Set();
  fecharDialogo();
  salvar();
  toast(`Baixa feita em ${plural(contas.length, "conta", "contas")}: ${brl(total)}, todas em ${fmtDia(f.data)} na ${nomeConta(Number(f.conta))}.`);
};

ACOES["lote-reclassificar"] = () => {
  const contas = selecionadas();
  abrirDialogo({
    titulo: "Reclassificar",
    descricao: `${plural(contas.length, "conta selecionada", "contas selecionadas")}. Deixe em branco o que não muda.`,
    form: "lote-reclassificar",
    corpo: `
      <div class="campo"><label for="rc-proj">Projeto</label><select class="input" id="rc-proj" name="projeto"><option value="">Não mudar</option>${opcoes(S.projetos.filter((p) => !projetoFechado(p.id)), null, (p) => `${codigoProjeto(p.id)} · ${p.titulo}`)}</select>
        <span class="dica">Troca o projeto inteiro (a conta fica 100% nesse projeto).</span></div>
      <div class="campo"><label for="rc-cat">Categoria</label><select class="input" id="rc-cat" name="categoria"><option value="">Não mudar</option>${opcoes(S.categorias.filter((c) => c.ativo && c.tipo === "Despesa"), null, (c) => `${c.codigo} ${c.nome}`)}</select></div>
      <div class="campo"><label for="rc-cc">Centro de custo</label><select class="input" id="rc-cc" name="centroCusto"><option value="">Não mudar</option>${opcoes(S.centrosCusto.filter((c) => c.ativo))}</select></div>`,
    rodape: `<button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Cancelar</button><button type="submit" class="btn">Continuar</button>`,
  });
};
FORMS["lote-reclassificar"] = (f) => {
  if (!f.projeto && !f.categoria && !f.centroCusto) return toast("Escolha o que vai mudar.", true);
  const contas = selecionadas();
  confirmar({
    titulo: "Confirmar reclassificação",
    mensagem: `Vamos mudar ${plural(contas.length, "conta", "contas")} (total ${brl(soma(contas, (c) => c.valor))}). Cada mudança fica na auditoria.`,
    botao: "Reclassificar",
    acao: () => {
      const resumo = (c) => `${c.rateio.map((r) => codigoProjeto(r.projeto)).join("+") || "sem projeto"} / ${nomeCategoria(c.categoria)} / ${nomeCentro(c.centroCusto)}`;
      for (const c of contas) {
        const antes = resumo(c);
        if (f.projeto) c.rateio = [{ projeto: Number(f.projeto), valor: c.valor }];
        if (f.categoria) c.categoria = Number(f.categoria);
        if (f.centroCusto) c.centroCusto = Number(f.centroCusto);
        auditar(`pagar:${c.id}`, `Reclassificada: ${antes} → ${resumo(c)}`);
      }
      UI.pagar.sel = new Set();
      salvar();
      toast(`${plural(contas.length, "conta reclassificada", "contas reclassificadas")}. ${plural(contas.length, "linha", "linhas")} na auditoria.`);
    },
  });
};

ACOES["lote-duplicar"] = () => {
  const contas = selecionadas();
  confirmar({
    titulo: "Duplicar",
    mensagem: `Vamos criar uma cópia de ${plural(contas.length, "conta", "contas")} (sem baixas, vencimento um mês depois).`,
    botao: "Duplicar",
    acao: () => {
      for (const c of contas) {
        const venc = mesesDepois(c.vencimento, 1);
        const nova = { ...copiar(c), id: proximoId(S.contasPagar), baixas: [], anexos: [], serie: null, vencimento: venc, competencia: venc.slice(0, 7), autorizacao: null, cancelado: false, substituidaPor: null, itens: c.itens ? c.itens.map((i) => ({ ...i, pago: null })) : null };
        S.contasPagar.push(nova);
        auditar(`pagar:${nova.id}`, `Criada como cópia da conta "${c.descricao}"`);
      }
      UI.pagar.sel = new Set();
      salvar();
      toast(`${plural(contas.length, "conta duplicada", "contas duplicadas")} para o mês seguinte.`);
    },
  });
};

ACOES["lote-excluir"] = () => {
  const contas = selecionadas();
  const comBaixa = contas.filter((c) => c.baixas.length);
  if (comBaixa.length) return toast(`${plural(comBaixa.length, "conta tem", "contas têm")} baixa — estorne antes de excluir.`, true);
  confirmar({
    titulo: "Excluir contas",
    mensagem: `Vamos excluir ${plural(contas.length, "conta", "contas")} (total ${brl(soma(contas, (c) => c.valor))}). Isso não pode ser desfeito.`,
    botao: "Excluir",
    perigo: true,
    acao: () => {
      const ids = new Set(contas.map((c) => c.id));
      contas.forEach((c) => auditar(`pagar:${c.id}`, `Excluída: ${c.descricao} (${brl(c.valor)})`));
      S.contasPagar = S.contasPagar.filter((c) => !ids.has(c.id));
      UI.pagar.sel = new Set();
      salvar();
      toast(`${plural(contas.length, "conta excluída", "contas excluídas")}.`);
    },
  });
};

// ---- Nova conta (com rateio e recorrência simulada) ----

function lerRateio(texto, valorTotal) {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rateio = [], erros = [];
  linhas.forEach((l, i) => {
    const [proj, val] = l.split(/[;\t]/).map((x) => (x ?? "").trim());
    const id = Number(String(proj).replace(/\D/g, ""));
    if (/r\$|[a-z]/i.test(val || "")) return erros.push(`Linha ${i + 1}: use só números no valor`);
    const v = paraCentavos(val);
    if (!achar("projetos", id)) return erros.push(`Projeto ${proj} não encontrado (linha ${i + 1})`);
    if (projetoFechado(id)) return erros.push(`Projeto ${codigoProjeto(id)} fechado — peça a reabertura a um administrador`);
    if (!v) return erros.push(`Linha ${i + 1}: valor inválido`);
    rateio.push({ projeto: id, valor: v });
  });
  const total = soma(rateio, (r) => r.valor);
  if (!erros.length && rateio.length && total !== valorTotal) erros.push(`As partes do rateio somam ${brl(total)}, mas o lançamento é de ${brl(valorTotal)} (diferença de ${brl(Math.abs(total - valorTotal))})`);
  return { rateio, erros };
}

const DIA_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function formNovaConta(v = {}) {
  const ocorrencias = v.ocorrencias || null;
  abrirDialogo({
    titulo: "Nova conta a pagar",
    descricao: "Os campos com * são obrigatórios. O resto fica em \"Mais informações\".",
    form: "salvar-pagar",
    largo: true,
    corpo: `
      <div class="linha-campos-3">
        <div class="campo"><label for="p-data">Data *</label><input class="input" id="p-data" name="data" type="date" value="${v.data || HOJE}"></div>
        <div class="campo"><label for="p-venc">Vencimento *</label><input class="input" id="p-venc" name="vencimento" type="date" value="${v.vencimento || somarDias(HOJE, 7)}"></div>
        <div class="campo"><label for="p-valor">Valor (R$) *</label><input class="input" id="p-valor" name="valor" inputmode="decimal" placeholder="0,00" value="${esc(v.valor)}" autofocus></div>
      </div>
      <div class="linha-campos">
        <div class="campo"><label for="p-forn">Fornecedor *</label><select class="input" id="p-forn" name="fornecedor">${opcoes(S.fornecedores.filter((f) => f.ativo), v.fornecedor, (f) => `${f.apelido} · ${f.nome}`)}</select></div>
        <div class="campo"><label for="p-cat">Categoria *</label><select class="input" id="p-cat" name="categoria">${opcoes(S.categorias.filter((c) => c.ativo && c.tipo === "Despesa"), v.categoria, (c) => `${c.codigo} ${c.nome}`)}</select></div>
      </div>
      <div class="campo"><label for="p-desc">Descrição *</label><input class="input" id="p-desc" name="descricao" value="${esc(v.descricao)}" placeholder="Ex.: Aluguel do escritório · novembro"></div>
      <div class="linha-campos-3">
        <div class="campo"><label for="p-emp">Empresa *</label><select class="input" id="p-emp" name="empresa">${opcoes(S.empresas, v.empresa)}</select></div>
        <div class="campo"><label for="p-uni">Unidade *</label><select class="input" id="p-uni" name="unidade">${opcoes(S.unidades.filter((u) => u.ativo), v.unidade, (u) => `${nomeEmpresa(u.empresa)} · ${u.nome}`)}</select></div>
        <div class="campo"><label for="p-cc">Centro de custo *</label><select class="input" id="p-cc" name="centroCusto">${opcoes(S.centrosCusto.filter((c) => c.ativo), v.centroCusto)}</select></div>
      </div>
      <div class="linha-campos">
        <div class="campo"><label for="p-forma">Forma de pagamento *</label><select class="input" id="p-forma" name="forma">${opcoes(S.formasPagamento.filter((x) => x.ativo), v.forma)}</select></div>
        <div class="campo"><label for="p-proj">Projeto</label><select class="input" id="p-proj" name="projeto"><option value="">Sem projeto</option>${opcoes(S.projetos, v.projeto, (p) => `${codigoProjeto(p.id)} · ${p.titulo}${p.situacao === "Encerrado" ? " (encerrado)" : ""}`)}</select>
          <span class="dica">Ou divida entre projetos logo abaixo.</span></div>
      </div>
      <div class="campo"><label for="p-rateio">Dividir entre projetos (opcional)</label>
        <textarea class="input mono" id="p-rateio" name="rateio" placeholder="1804;600,00&#10;1790;400,00">${esc(v.rateio)}</textarea>
        <span class="dica">Uma linha por projeto: código e valor, só números. Pode colar da planilha. ${regra("regra-rateio")}</span></div>

      <details class="mais" ${v.aberto ? "open" : ""}>
        <summary>Mais informações (documento, código de barras, competência…)</summary>
        <div class="linha-campos-3">
          <div class="campo"><label for="p-doc">Documento</label><select class="input" id="p-doc" name="docTipo">${["Sem documento", "NF", "Boleto", "Fatura", "Recibo", "Contrato"].map((t) => `<option ${v.docTipo === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
          <div class="campo"><label for="p-docn">Número</label><input class="input" id="p-docn" name="docNumero" value="${esc(v.docNumero)}"></div>
          <div class="campo"><label for="p-doce">Emissão</label><input class="input" id="p-doce" name="docEmissao" type="date" value="${esc(v.docEmissao)}"></div>
        </div>
        <div class="campo"><label for="p-barras">Código de barras / linha digitável ${regra("regra-codigo-barras")}</label><input class="input mono" id="p-barras" name="codigoBarras" value="${esc(v.codigoBarras)}" placeholder="Cole a linha digitável do boleto"></div>
        <div class="linha-campos-3">
          <div class="campo"><label for="p-comp">Competência</label><input class="input" id="p-comp" name="competencia" type="month" value="${esc(v.competencia || HOJE.slice(0, 7))}"></div>
          <div class="campo"><label for="p-docrec">Documentação recebida em</label><input class="input" id="p-docrec" name="docsRecebidosEm" type="date" value="${esc(v.docsRecebidosEm)}">
            <span class="dica">${regra("regra-doc-atrasada")}</span></div>
          <div class="campo"><label for="p-contrato">Contrato</label><input class="input" id="p-contrato" name="contrato" value="${esc(v.contrato)}" placeholder="Opcional (a validar)"></div>
        </div>
        <label class="flex pequeno" style="margin-bottom:10px"><input type="checkbox" class="check" name="transferencia" ${v.transferencia ? "checked" : ""}> Transferência entre empresas do Grupo ${regra("regra-transferencia")}</label>
        <div class="campo"><label for="p-obs">Observações</label><textarea class="input" id="p-obs" name="observacao">${esc(v.observacao)}</textarea></div>
      </details>

      <details class="mais" ${v.repetir ? "open" : ""}>
        <summary>Repetir ou parcelar</summary>
        <div class="linha-campos-3">
          <div class="campo"><label for="p-rep">Tipo</label><select class="input" id="p-rep" name="repetir">${[["", "Não repete"], ["Mensal", "Mensal (mesmo valor)"], ["Parcelado", "Parcelado (divide o valor)"], ["Estimada", "Estimada (valor muda todo mês)"]].map(([k, r]) => `<option value="${k}" ${v.repetir === k ? "selected" : ""}>${r}</option>`).join("")}</select></div>
          <div class="campo"><label for="p-qtd">Quantidade</label><input class="input" id="p-qtd" name="quantidade" type="number" min="2" max="36" value="${esc(v.quantidade || 12)}"><span class="dica">Total de ocorrências, contando a primeira.</span></div>
          <div class="campo" style="justify-content:flex-end"><button type="button" class="btn btn-outline" data-acao="pagar-simular">${icone("calendar-range")}Simular</button></div>
        </div>
        ${ocorrencias ? `<p class="pequeno muted" style="margin:0 0 8px">Ajuste datas e valores antes de salvar. ${regra("regra-recorrencia")}</p>
          <div class="card" style="max-height:260px;overflow:auto"><table>
            <thead><tr><th>Nº</th><th>Vencimento</th><th>Valor (R$)</th><th></th></tr></thead>
            <tbody>${ocorrencias.map((o, i) => `<tr><td>${o.n}</td>
              <td><input class="input" type="date" name="oc-venc-${i}" value="${o.vencimento}" aria-label="Vencimento da ocorrência ${o.n}"></td>
              <td><input class="input" name="oc-valor-${i}" value="${centavosParaCampo(o.valor)}" inputmode="decimal" aria-label="Valor da ocorrência ${o.n}"></td>
              <td class="pequeno muted">${o.bruto !== o.vencimento ? `${fmtDia(o.bruto)} é ${FERIADOS.includes(o.bruto) ? "feriado" : DIA_SEMANA[new Date(o.bruto + "T12:00:00Z").getUTCDay()]} → próximo dia útil` : ""}</td></tr>`).join("")}</tbody>
          </table></div>
          <input type="hidden" name="ocorrencias" value="${ocorrencias.length}">` : ""}
      </details>`,
    rodape: `<button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Cancelar</button><button type="submit" class="btn">${ocorrencias ? `Lançar ${ocorrencias.length} ocorrências` : "Lançar conta"}</button>`,
  });
}

ACOES["pagar-nova"] = () => formNovaConta();
ACOES["pagar-simular"] = (d, el) => {
  const f = dadosDoForm(el.closest("form"));
  const valor = paraCentavos(f.valor);
  const qtd = Number(f.quantidade);
  if (!f.repetir) return toast("Escolha o tipo de repetição.", true);
  if (!valor) return toast("Informe o valor antes de simular.", true);
  if (!(qtd >= 2 && qtd <= 36)) return toast("Quantidade entre 2 e 36.", true);
  formNovaConta({ ...f, aberto: true, ocorrencias: simularSerie(f.repetir, f.vencimento, qtd, valor) });
  dialogo().querySelector('[name="oc-venc-0"]')?.scrollIntoView({ block: "center" });
};

FORMS["salvar-pagar"] = (f) => {
  const valor = paraCentavos(f.valor);
  if (!valor) return toast("Informe um valor maior que zero.", true);
  if (!f.descricao.trim()) return toast("Preencha a descrição.", true);
  if (!f.vencimento || !f.data) return toast("Informe a data e o vencimento.", true);
  if (f.docTipo === "NF" && (!f.docNumero.trim() || !f.docEmissao)) return toast("Informe o número e a data de emissão da nota.", true);
  const erroData = erroPeriodo(f.empresa, f.data);
  if (erroData) return toast(erroData, true);
  let rateio = [];
  if (f.rateio.trim()) {
    const r = lerRateio(f.rateio, valor);
    if (r.erros.length) return toast(r.erros[0], true);
    rateio = r.rateio;
  } else if (f.projeto) {
    if (projetoFechado(Number(f.projeto))) return toast("Projeto fechado — peça a reabertura a um administrador.", true);
    rateio = [{ projeto: Number(f.projeto), valor }];
  }
  if (f.repetir && !f.ocorrencias) return toast("Clique em Simular para ver as ocorrências antes de salvar.", true);

  const categoria = Number(f.categoria);
  const estouro = rateio.find((r) => { const orcado = orcadoCategoria(r.projeto, categoria); return orcado && gastoCategoria(r.projeto, categoria) + r.valor > orcado; });
  const base = {
    empresa: f.empresa, unidade: Number(f.unidade), centroCusto: Number(f.centroCusto), fornecedor: Number(f.fornecedor), categoria, forma: Number(f.forma),
    data: f.data, descricao: f.descricao.trim(), codigoBarras: f.codigoBarras.trim(),
    documento: { tipo: f.docTipo, numero: f.docNumero.trim(), emissao: f.docEmissao, motivo: "" }, transferencia: !!f.transferencia,
    docsRecebidosEm: f.docsRecebidosEm || null, observacao: f.observacao.trim(), autorizacao: estouro ? "pendente" : null,
  };
  const n = Number(f.ocorrencias || 0);
  const serieId = n ? Math.max(0, ...S.contasPagar.map((c) => c.serie?.id || 0)) + 1 : null;
  for (let i = 0; i < Math.max(1, n); i++) {
    const v = n ? paraCentavos(f[`oc-valor-${i}`]) : valor;
    const venc = n ? f[`oc-venc-${i}`] : f.vencimento;
    if (!v || !venc) return toast(`Confira a ocorrência ${i + 1}.`, true);
    const c = tituloPagar({ ...base, id: proximoId(S.contasPagar), vencimento: venc, valor: v, competencia: n ? venc.slice(0, 7) : f.competencia,
      rateio: rateio.map((r) => ({ ...r, valor: Math.round((r.valor * v) / valor) })),
      serie: n ? { id: serieId, n: i + 1, total: n, tipo: f.repetir, estimado: f.repetir === "Estimada" ? v : undefined } : null });
    if (f.repetir === "Estimada") c.descricao += " (estimada)";
    S.contasPagar.push(c);
    auditar(`pagar:${c.id}`, `Lançada: ${c.descricao} · ${brl(v)} · vence ${fmtDia(venc)}${c.autorizacao ? " · pendente de autorização" : ""}`);
  }
  fecharDialogo();
  salvar();
  if (estouro) toast(`Conta lançada, mas passa do orçado para ${nomeCategoria(categoria)} no ${codigoProjeto(estouro.projeto)}: fica pendente de autorização.`, true);
  else toast(n ? `${n} ocorrências lançadas (${f.repetir.toLowerCase()}).` : `Conta lançada: ${brl(valor)} para ${nomeFornecedor(f.fornecedor)}, vence em ${fmtDia(f.vencimento)}.`);
};

// ---- Baixa, estorno e volta ----

ACOES["pagar-baixa"] = (d) => {
  const c = achar("contasPagar", d.id);
  if (c.autorizacao === "pendente") return toast("Esse lançamento está acima do orçamento e ainda não foi autorizado.", true);
  if (c.tipo === "provisao") return toast("Provisão não se paga: substitua pelo valor real.", true);
  abrirDialogo({
    titulo: "Dar baixa",
    descricao: `${esc(quemRecebe(c))} · ${esc(c.descricao)}`,
    form: "salvar-baixa-pagar",
    corpo: `
      <input type="hidden" name="id" value="${c.id}">
      <p style="margin:0 0 6px">Pendente: <strong>${brl(saldoPagar(c))}</strong> de ${brl(c.valor)}.</p>
      <div class="progresso verde mb"><span style="width:${Math.min(100, Math.round((pagoConta(c) / c.valor) * 100))}%"></span></div>
      <div class="linha-campos">
        <div class="campo"><label for="b-valor">Valor pago (R$)</label><input class="input" id="b-valor" name="valor" value="${centavosParaCampo(saldoPagar(c))}" inputmode="decimal" autofocus><span class="dica">Menor que o pendente = baixa parcial.</span></div>
        <div class="campo"><label for="b-data">Data em que o dinheiro saiu</label><input class="input" id="b-data" name="data" type="date" value="${HOJE}"></div>
      </div>
      <div class="linha-campos-3">
        <div class="campo"><label for="b-conta">Conta bancária</label><select class="input" id="b-conta" name="conta">${opcoes(S.contasBancarias.filter((b) => b.ativo && b.empresa === c.empresa))}</select></div>
        <div class="campo"><label for="b-forma">Forma</label><select class="input" id="b-forma" name="forma">${opcoes(S.formasPagamento.filter((x) => x.ativo), c.forma)}</select></div>
        <div class="campo"><label for="b-juros">Juros/multa (R$)</label><input class="input" id="b-juros" name="acrescimo" inputmode="decimal" placeholder="0,00"></div>
      </div>
      <div class="linha-campos">
        <div class="campo"><label for="b-trans">ID da transação no banco</label><input class="input mono" id="b-trans" name="transacao" placeholder="Opcional"></div>
        <div class="campo"><label for="b-obs">Observação</label><input class="input" id="b-obs" name="observacao" placeholder="Obrigatória se a data for no passado"></div>
      </div>
      <p class="pequeno muted" style="margin:0">${regra("regra-baixa-parcial")}</p>`,
    rodape: `<button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Cancelar</button><button type="submit" class="btn btn-verde">${icone("check")}Confirmar baixa</button>`,
  });
};
FORMS["salvar-baixa-pagar"] = (f) => {
  const c = achar("contasPagar", f.id);
  const valor = paraCentavos(f.valor);
  const acrescimo = paraCentavos(f.acrescimo) || 0;
  if (!valor) return toast("Informe o valor pago.", true);
  if (!f.data) return toast("Informe a data da baixa.", true);
  if (!f.conta) return toast("Esta empresa não tem conta bancária cadastrada.", true);
  if (valor > saldoPagar(c) + acrescimo) return toast(`O valor passa do saldo pendente (${brl(saldoPagar(c))}). Se teve juros ou multa, informe no campo.`, true);
  if (f.data < HOJE && !f.observacao.trim()) return toast("Baixa com data no passado precisa de observação.", true);
  const erro = erroPeriodo(c.empresa, f.data);
  if (erro) return toast(erro, true);
  c.baixas.push(baixa(proximoId(c.baixas), f.data, valor, Number(f.conta), Number(f.forma), { acrescimo, transacao: f.transacao.trim(), motivo: f.observacao.trim() }));
  auditar(`pagar:${c.id}`, `Baixa de ${brl(valor)} em ${fmtDia(f.data)} (${nomeConta(Number(f.conta))}, ${nomeForma(Number(f.forma))})${acrescimo ? ` com ${brl(acrescimo)} de juros/multa` : ""}`);
  fecharDialogo();
  salvar();
  toast(saldoPagar(c) ? `Baixa parcial de ${brl(valor)}. Ainda faltam ${brl(saldoPagar(c))}.` : `Conta paga: ${brl(valor)} em ${fmtDia(f.data)}.`);
};

ACOES["pagar-estornar"] = (d) => {
  const c = achar("contasPagar", d.id);
  const b = c.baixas.find((x) => x.id === Number(d.baixa));
  const erro = erroPeriodo(c.empresa, HOJE) || erroPeriodo(c.empresa, b.data);
  if (erro) return toast(erro, true);
  pedirMotivo({
    titulo: `Estornar baixa de ${brl(b.valor)}`,
    descricao: "A baixa original continua visível; o estorno a anula e o valor volta a pendente.",
    botao: "Estornar", perigo: true,
    acao: (motivo) => {
      c.baixas.push({ ...b, id: proximoId(c.baixas), tipo: "estorno", ref: b.id, data: HOJE, motivo, origem: "Estorno", acrescimo: 0 });
      if (b.item) c.itens.find((i) => i.id === b.item).pago = null;
      auditar(`pagar:${c.id}`, `Estorno da baixa de ${fmtDia(b.data)} (${brl(b.valor)}): ${motivo}`);
      salvar();
      toast(`Baixa estornada. Pendente agora: ${brl(saldoPagar(c))}.`);
      abrirDetalhe(c.id, "baixas");
    },
  });
};

ACOES["pagar-volta"] = (d) => {
  const c = achar("contasPagar", d.id);
  const b = c.baixas.find((x) => x.id === Number(d.baixa));
  abrirDialogo({
    titulo: "Registrar Pix devolvido",
    descricao: `Pagamento de ${fmtDia(b.data)} · ${brl(b.valor)} · ${esc(quemRecebe(c))}`,
    form: "pagar-volta",
    corpo: `<input type="hidden" name="id" value="${c.id}"><input type="hidden" name="baixa" value="${b.id}">
      <div class="campo"><label for="v-data">Data em que o dinheiro voltou</label><input class="input" id="v-data" name="data" type="date" value="${somarDias(b.data, 1)}" autofocus></div>
      <div class="campo"><label for="v-motivo">Motivo</label><input class="input" id="v-motivo" name="motivo" value="Chave Pix errada"></div>
      <p class="pequeno muted" style="margin:0">A conta fica "Devolvida" e o valor volta a pendente. O supervisor é avisado para corrigir a chave no Connect. ${regra("regra-volta-titulo")}</p>`,
    rodape: `<button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Cancelar</button><button type="submit" class="btn btn-perigo">Registrar devolução</button>`,
  });
};
FORMS["pagar-volta"] = (f) => {
  const c = achar("contasPagar", f.id);
  const b = c.baixas.find((x) => x.id === Number(f.baixa));
  const erro = erroPeriodo(c.empresa, f.data);
  if (erro) return toast(erro, true);
  c.baixas.push({ ...b, id: proximoId(c.baixas), tipo: "devolucao", ref: b.id, data: f.data, motivo: f.motivo.trim() || "Pix devolvido", origem: "Devolução", acrescimo: 0 });
  auditar(`pagar:${c.id}`, `Pix de ${fmtDia(b.data)} devolvido em ${fmtDia(f.data)}: ${f.motivo}`);
  salvar();
  toast(`Devolução registrada. ${quemRecebe(c)} sinalizado para o supervisor corrigir a chave no Connect.`);
  abrirDetalhe(c.id, "baixas");
};

// ---- Outras ações do título ----

ACOES["pagar-autorizar"] = (d) => {
  const c = achar("contasPagar", d.id);
  pedirMotivo({
    titulo: "Autorizar acima do orçamento",
    descricao: "Só administrador. No protótipo, simulamos que você entrou como administrador.",
    botao: "Autorizar como administrador",
    acao: (motivo) => { c.autorizacao = "autorizada"; auditar(`pagar:${c.id}`, `Administrador autorizou acima do orçamento: ${motivo}`); salvar(); toast("Conta autorizada. Já pode ser paga."); },
  });
};
ACOES["pagar-cancelar"] = (d) => {
  const c = achar("contasPagar", d.id);
  if (pagoConta(c) > 0) return toast("Essa conta tem baixa — estorne antes de cancelar.", true);
  pedirMotivo({
    titulo: "Cancelar conta", botao: "Cancelar conta", perigo: true,
    acao: (motivo) => { c.cancelado = true; auditar(`pagar:${c.id}`, `Cancelada: ${motivo}`); salvar(); toast("Conta cancelada."); },
  });
};
ACOES["pagar-editar"] = (d) => {
  const c = achar("contasPagar", d.id);
  abrirDialogo({
    titulo: "Editar conta",
    descricao: "Toda mudança grava antes → depois na auditoria.",
    form: "pagar-editar",
    corpo: `<input type="hidden" name="id" value="${c.id}">
      <div class="campo"><label for="e-desc">Descrição</label><input class="input" id="e-desc" name="descricao" value="${esc(c.descricao)}"></div>
      <div class="linha-campos">
        <div class="campo"><label for="e-valor">Valor (R$)</label><input class="input" id="e-valor" name="valor" value="${centavosParaCampo(c.valor)}" inputmode="decimal" autofocus></div>
        <div class="campo"><label for="e-venc">Vencimento</label><input class="input" id="e-venc" name="vencimento" type="date" value="${c.vencimento}"></div>
      </div>
      <p class="pequeno muted" style="margin:0">${regra("regra-projeto-fechado")}</p>`,
    rodape: `<button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Cancelar</button><button type="submit" class="btn">Salvar</button>`,
  });
};
FORMS["pagar-editar"] = (f) => {
  const c = achar("contasPagar", f.id);
  const valor = paraCentavos(f.valor);
  if (!valor) return toast("Informe o valor.", true);
  if (valor !== c.valor && c.rateio.some((r) => projetoFechado(r.projeto))) return toast("Projeto fechado — peça a reabertura a um administrador.", true);
  if (valor < pagoConta(c)) return toast(`O valor não pode ficar abaixo do que já foi pago (${brl(pagoConta(c))}).`, true);
  const mudou = [];
  if (valor !== c.valor) { mudou.push(`valor ${brl(c.valor)} → ${brl(valor)}`); c.rateio = c.rateio.map((r) => ({ ...r, valor: Math.round((r.valor * valor) / c.valor) })); c.valor = valor; }
  if (f.vencimento !== c.vencimento) { mudou.push(`vencimento ${fmtDia(c.vencimento)} → ${fmtDia(f.vencimento)}`); c.vencimento = f.vencimento; }
  if (f.descricao.trim() !== c.descricao) { mudou.push(`descrição "${c.descricao}" → "${f.descricao.trim()}"`); c.descricao = f.descricao.trim(); }
  if (!mudou.length) return fecharDialogo();
  auditar(`pagar:${c.id}`, `Alterada: ${mudou.join("; ")}`);
  salvar();
  toast("Alterações salvas e registradas.");
  abrirDetalhe(c.id);
};

// Série: mudar valor de uma ocorrência com escopo.
ACOES["serie-editar"] = (d) => {
  const c = achar("contasPagar", d.id);
  abrirDialogo({
    titulo: `Mudar a ocorrência ${c.serie.n}/${c.serie.total}`,
    descricao: `${esc(c.descricao)} · vence ${fmtDia(c.vencimento)}`,
    form: "serie-editar",
    corpo: `<input type="hidden" name="id" value="${c.id}">
      <div class="campo"><label for="s-valor">${c.serie.tipo === "Estimada" ? "Valor real da fatura (R$)" : "Novo valor (R$)"}</label><input class="input" id="s-valor" name="valor" value="${centavosParaCampo(c.valor)}" inputmode="decimal" autofocus></div>
      <div class="campo"><label>Aplicar em</label>
        ${[["so", "Só esta"], ["seguintes", "Esta e as seguintes (em aberto)"], ["todas", "Todas em aberto"]].map(([k, r], i) => `<label class="flex pequeno"><input type="radio" class="check" name="escopo" value="${k}" ${i === 0 ? "checked" : ""}> ${r}</label>`).join("")}
      </div>
      <p class="pequeno muted" style="margin:0">Ocorrência paga nunca muda. ${regra(c.serie.tipo === "Estimada" ? "regra-estimada" : "regra-serie-escopo")}</p>`,
    rodape: `<button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Cancelar</button><button type="submit" class="btn">Aplicar</button>`,
  });
};
FORMS["serie-editar"] = (f) => {
  const c = achar("contasPagar", f.id);
  const valor = paraCentavos(f.valor);
  if (!valor) return toast("Informe o valor.", true);
  const serie = S.contasPagar.filter((x) => x.serie?.id === c.serie.id);
  const alvo = serie.filter((x) => (f.escopo === "so" ? x.id === c.id : f.escopo === "seguintes" ? x.serie.n >= c.serie.n : true) && pagoConta(x) === 0 && !x.cancelado);
  if (!alvo.length) return toast("Ocorrências pagas não são alteradas pela série.", true);
  for (const x of alvo) {
    auditar(`pagar:${x.id}`, `Valor da ocorrência ${x.serie.n}/${x.serie.total}: ${brl(x.valor)} → ${brl(valor)}`);
    x.valor = valor;
    if (c.serie.tipo === "Estimada" && x.id === c.id) x.descricao = x.descricao.replace(" (estimada)", "");
  }
  salvar();
  toast(`${plural(alvo.length, "ocorrência alterada", "ocorrências alteradas")}.`);
  abrirDetalhe(c.id, "repetir");
};

// Documentos (anexos simulados), usados também por contas a receber.
ACOES["doc-anexar"] = (d) => abrirDialogo({
  titulo: "Anexar documento",
  descricao: "No protótipo, nenhum arquivo é enviado: só registramos o nome e o tipo.",
  form: "doc-anexar",
  corpo: `<input type="hidden" name="id" value="${d.id}"><input type="hidden" name="alvo" value="${d.alvo}">
    <div class="linha-campos">
      <div class="campo"><label for="an-tipo">Tipo</label><select class="input" id="an-tipo" name="tipo">${["Nota", "Boleto", "Contrato", "Comprovante", "Recibo", "Planilha", "Outro"].map((t) => `<option>${t}</option>`).join("")}</select></div>
      <div class="campo"><label for="an-nome">Nome do arquivo</label><input class="input" id="an-nome" name="nome" value="${HOJE} documento.pdf" autofocus></div>
    </div>
    <p class="pequeno muted" style="margin:0">Tente "virus.exe.pdf" para ver a recusa. ${regra("regra-anexos")}</p>`,
  rodape: `<button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Cancelar</button><button type="submit" class="btn">${icone("paperclip")}Anexar</button>`,
});
function alvoTitulo(alvo, id) { return achar(alvo === "receber" ? "contasReceber" : "contasPagar", id); }
function reabrirDetalhe(alvo, id, aba) { alvo === "receber" ? abrirDetalheReceber(id, aba) : abrirDetalhe(id, aba); }
FORMS["doc-anexar"] = (f) => {
  const t = alvoTitulo(f.alvo, f.id);
  const nome = f.nome.trim();
  if (/\.(exe|bat|js|cmd|scr)(\.|$)/i.test(nome)) return toast("Arquivo bloqueado por segurança.", true);
  if (!/\.(pdf|jpe?g|png|xlsx?|docx?|xml|csv)$/i.test(nome)) return toast("Envie PDF, imagem, planilha, documento ou XML de até 20 MB.", true);
  if (t.anexos.filter((a) => !a.excluido).length >= 50) return toast("Limite de 50 anexos por conta.", true);
  t.anexos.push({ id: proximoId(t.anexos), nome, tipo: f.tipo, excluido: false });
  auditar(`${f.alvo}:${t.id}`, `Anexou "${nome}" (${f.tipo})`);
  salvar();
  toast("Documento anexado.");
  reabrirDetalhe(f.alvo, t.id, "documentos");
};
ACOES["doc-renomear"] = (d) => {
  const t = alvoTitulo(d.alvo, d.id);
  const a = t.anexos.find((x) => x.id === Number(d.anexo));
  abrirDialogo({
    titulo: "Renomear documento", form: "doc-renomear",
    corpo: `<input type="hidden" name="id" value="${d.id}"><input type="hidden" name="alvo" value="${d.alvo}"><input type="hidden" name="anexo" value="${a.id}">
      <div class="campo"><label for="rn-nome">Nome</label><input class="input" id="rn-nome" name="nome" value="${esc(a.nome)}" autofocus>
      <span class="dica">Padrão de hoje: {data de pagamento} {número da NF} {fornecedor} {valor} {data de emissão}</span></div>`,
    rodape: `<button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Cancelar</button><button type="submit" class="btn">Renomear</button>`,
  });
};
FORMS["doc-renomear"] = (f) => {
  const t = alvoTitulo(f.alvo, f.id);
  const a = t.anexos.find((x) => x.id === Number(f.anexo));
  auditar(`${f.alvo}:${t.id}`, `Renomeou "${a.nome}" → "${f.nome.trim()}"`);
  a.nome = f.nome.trim();
  salvar();
  reabrirDetalhe(f.alvo, t.id, "documentos");
};
ACOES["doc-baixar"] = (d) => {
  const t = alvoTitulo(d.alvo, d.id);
  const a = t.anexos.find((x) => x.id === Number(d.anexo));
  auditar(`${d.alvo}:${t.id}`, `Baixou "${a.nome}"`);
  salvar();
  toast(`Download de "${a.nome}" registrado na auditoria (simulado).`);
  reabrirDetalhe(d.alvo, t.id, "documentos");
};
ACOES["doc-excluir"] = (d) => {
  const t = alvoTitulo(d.alvo, d.id);
  const a = t.anexos.find((x) => x.id === Number(d.anexo));
  pedirMotivo({
    titulo: `Excluir "${esc(a.nome)}"`, descricao: "A exclusão é lógica: o arquivo some da lista, mas o registro fica.", botao: "Excluir", perigo: true,
    acao: (motivo) => { a.excluido = true; auditar(`${d.alvo}:${t.id}`, `Excluiu "${a.nome}": ${motivo}`); salvar(); toast("Documento excluído."); reabrirDetalhe(d.alvo, t.id, "documentos"); },
  });
};

function abaDocumentos(t, alvo) {
  const ativos = t.anexos.filter((a) => !a.excluido);
  return `<div class="flex entre mb"><span class="pequeno muted">${plural(ativos.length, "documento", "documentos")}</span>
      <button class="btn btn-outline btn-sm" data-acao="doc-anexar" data-id="${t.id}" data-alvo="${alvo}">${icone("paperclip")}Anexar</button></div>
    ${ativos.length ? `<div class="card"><table><thead><tr><th>Arquivo</th><th>Tipo</th><th></th></tr></thead><tbody>${ativos.map((a) => `<tr>
      <td class="nome">${esc(a.nome)}</td><td>${esc(a.tipo)}</td>
      <td class="num" style="white-space:nowrap">${botaoIcone("download", "Baixar", "doc-baixar", { id: t.id, alvo, anexo: a.id })}${botaoIcone("pencil", "Renomear", "doc-renomear", { id: t.id, alvo, anexo: a.id })}${botaoIcone("trash-2", "Excluir", "doc-excluir", { id: t.id, alvo, anexo: a.id })}</td>
    </tr>`).join("")}</tbody></table></div>` : `<p class="muted pequeno">Nenhum documento anexado.</p>`}`;
}
function abaHistorico(alvo) {
  const h = historicoDe(alvo);
  return h.length ? `<div class="card"><table><thead><tr><th>Quando</th><th>Quem</th><th>O que mudou</th></tr></thead><tbody>${h.map((a) => `<tr><td class="pequeno" style="white-space:nowrap">${fmtDia(a.quando.slice(0, 10))} ${a.quando.slice(11)}</td><td>${esc(a.quem)}</td><td>${esc(a.texto)}</td></tr>`).join("")}</tbody></table></div>`
    : `<p class="muted pequeno">Nada registrado ainda. Mudanças feitas a partir de agora aparecem aqui.</p>`;
}

// ---- Detalhe do título (abas) ----

ACOES["pagar-ver"] = (d) => abrirDetalhe(Number(d.id));
ACOES["detalhe-aba"] = (d) => reabrirDetalhe(d.alvo, Number(d.id), d.aba);

function abasDetalhe(id, alvo, abasLista, ativa) {
  return `<div class="abas-dialogo" role="tablist">${abasLista.map(([k, r]) => `<button type="button" role="tab" aria-selected="${k === ativa}" class="${k === ativa ? "ativa" : ""}" data-acao="detalhe-aba" data-id="${id}" data-alvo="${alvo}" data-aba="${k}">${r}</button>`).join("")}</div>`;
}

function abrirDetalhe(id, aba = "resumo") {
  const c = achar("contasPagar", id);
  if (!c) return fecharDialogo();
  const sit = situacaoPagar(c);
  const abasLista = [["resumo", "Resumo"], ["baixas", `Baixas (${c.baixas.length})`], ...(c.itens ? [["itens", `Itens (${c.itens.length})`]] : []), ["documentos", "Documentos"], ...(c.serie ? [["repetir", "Repetir"]] : []), ["historico", "Histórico"]];
  let corpo = "";
  if (aba === "resumo") {
    const cat = achar("categorias", c.categoria);
    corpo = `
      ${c.autorizacao === "pendente" ? `<div class="aviso aviso-roxo">${icone("shield-alert")}<div><strong>Acima do orçamento</strong>Passa do orçado para ${esc(nomeCategoria(c.categoria))} no projeto. Só um administrador libera. ${regra("regra-autorizacao")}</div></div>` : ""}
      ${notaCanceladaDe(c) ? `<div class="aviso aviso-vermelho">${icone("ban")}<div><strong>Nota cancelada na prefeitura</strong>A NF ${esc(c.documento.numero)} aparece cancelada no portal${pagoConta(c) ? ", e esta conta já foi paga" : ""}. Fale com o fornecedor. ${regra("regra-nota-cancelada")}</div></div>` : ""}
      ${documentacaoAtrasada(c) ? `<div class="aviso aviso-ambar">${icone("file-clock")}<div><strong>Documentação atrasada</strong>Chegou em ${fmtDia(c.docsRecebidosEm)}, menos de 3 dias antes do vencimento. ${regra("regra-doc-atrasada")}</div></div>` : ""}
      <div class="kpis" style="margin-bottom:14px">
        ${kpi({ rotulo: "Valor", valor: brl(c.valor), detalhe: `vence ${fmtDia(c.vencimento)}`, ic: "receipt" })}
        ${kpi({ rotulo: "Pago", valor: brl(pagoConta(c)), ic: "circle-check", cor: "cor-verde" })}
        ${kpi({ rotulo: "Pendente", valor: brl(saldoPagar(c)), ic: "clock", cor: "cor-ambar" })}
      </div>
      <table class="pequeno"><tbody>
        ${[["Situação", `${c.tipo === "provisao" ? badge("Provisão", "roxo") + " " : ""}${badgeSituacao(sit)}`], ["Fornecedor", esc(quemRecebe(c))], ["Categoria", `${esc(nomeCategoriaCompleto(c.categoria))} · DRE: ${esc(nomeDre(cat?.dre))}`],
          ["Empresa · unidade · centro de custo", `${nomeEmpresa(c.empresa)} · ${esc(nomeUnidade(c.unidade))} · ${esc(nomeCentro(c.centroCusto))}`], ["Forma de pagamento", esc(nomeForma(c.forma))],
          ["Data · competência", `${fmtDia(c.data)} · ${nomeMes(c.competencia)}`], ["Documento", c.documento.tipo === "NF" ? `NF ${esc(c.documento.numero)} · emitida em ${fmtDia(c.documento.emissao)}` : esc(c.documento.tipo + (c.documento.motivo ? ` (${c.documento.motivo})` : ""))],
          ...(c.transferencia ? [["Transferência entre empresas", "Sim"]] : []), ...(c.observacao ? [["Observações", esc(c.observacao)]] : [])]
          .map(([k, v]) => `<tr><td class="muted" style="width:38%">${k}</td><td>${v}</td></tr>`).join("")}
      </tbody></table>
      ${c.codigoBarras ? `<div class="campo mt"><label>Código de barras ${regra("regra-codigo-barras")}</label>
        <div class="flex"><input class="input mono" readonly value="${esc(c.codigoBarras)}" aria-label="Código de barras"><button type="button" class="btn btn-outline" data-acao="copiar" data-texto="${esc(c.codigoBarras)}">${icone("copy")}Copiar</button></div></div>` : ""}
      ${c.rateio.length ? `<h3 class="pequeno forte mt">Projetos</h3><div class="card"><table><thead><tr><th>Projeto</th><th class="num">Valor</th></tr></thead>
        <tbody>${c.rateio.map((r) => `<tr><td>${codigoProjeto(r.projeto)} · ${esc(achar("projetos", r.projeto)?.titulo)}</td><td class="num">${brl(r.valor)}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
  } else if (aba === "baixas") {
    const estornadas = new Set(c.baixas.filter((b) => b.tipo === "estorno").map((b) => b.ref));
    const devolvidas = new Set(c.baixas.filter((b) => b.tipo === "devolucao").map((b) => b.ref));
    corpo = `<div class="progresso verde mb"><span style="width:${Math.max(0, Math.min(100, Math.round((pagoConta(c) / c.valor) * 100)))}%"></span></div>
      ${c.baixas.length ? `<div class="card"><div class="tabela-wrap"><table><thead><tr><th>Data</th><th>Tipo</th><th class="num">Valor</th><th>Conta · forma</th><th>Origem</th><th></th></tr></thead><tbody>${c.baixas.map((b) => `<tr>
        <td>${fmtDia(b.data)}</td>
        <td>${{ pagamento: badge("Pagamento", "verde"), estorno: badge("Estorno", "cinza"), devolucao: badge("Devolvido", "vermelho") }[b.tipo]}${b.motivo ? `<span class="sub">${esc(b.motivo)}</span>` : ""}${b.item ? `<span class="sub">Item: ${esc(c.itens.find((i) => i.id === b.item)?.nome)}</span>` : ""}</td>
        <td class="num ${b.tipo === "pagamento" ? "" : "vermelho"}">${b.tipo === "pagamento" ? "" : "−"}${brl(b.valor)}${b.acrescimo ? `<span class="sub">+ ${brl(b.acrescimo)} juros</span>` : ""}</td>
        <td class="pequeno">${esc(nomeConta(b.conta))} · ${esc(nomeForma(b.forma))}</td>
        <td class="pequeno">${esc(b.origem)}</td>
        <td class="num" style="white-space:nowrap">${b.tipo === "pagamento" && !estornadas.has(b.id) && !devolvidas.has(b.id) ? `${botaoIcone("undo-2", "Registrar Pix devolvido", "pagar-volta", { id: c.id, baixa: b.id })}${botaoIcone("rotate-ccw", "Estornar", "pagar-estornar", { id: c.id, baixa: b.id })}` : estornadas.has(b.id) ? '<span class="pequeno muted">estornada</span>' : devolvidas.has(b.id) ? '<span class="pequeno muted">devolvida</span>' : ""}</td>
      </tr>`).join("")}</tbody></table></div></div>` : `<p class="muted pequeno">Nenhuma baixa ainda.</p>`}
      <p class="pequeno muted">${regra("regra-estorno")} ${regra("regra-volta-titulo")}</p>`;
  } else if (aba === "itens") {
    corpo = tabelaItens(c);
  } else if (aba === "documentos") {
    corpo = abaDocumentos(c, "pagar");
  } else if (aba === "repetir") {
    const serie = S.contasPagar.filter((x) => x.serie?.id === c.serie.id).sort((a, b) => a.serie.n - b.serie.n);
    corpo = `<p class="pequeno muted" style="margin-top:0">${c.serie.tipo === "Estimada" ? `Estimada em ${brl(c.serie.estimado || 0)} por mês. Troque cada mês pelo valor real da fatura. ${regra("regra-estimada")}` : `Série ${c.serie.tipo.toLowerCase()} com ${c.serie.total} ocorrências. ${regra("regra-serie-escopo")}`}</p>
      <div class="card"><table><thead><tr><th>Nº</th><th>Vencimento</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead><tbody>${serie.map((x) => `<tr class="${x.id === c.id ? "selecionada" : ""}">
        <td>${x.serie.n}/${x.serie.total}</td><td>${fmtDia(x.vencimento)}</td><td class="num">${brl(x.valor)}${x.descricao.includes("(estimada)") ? '<span class="sub">estimada</span>' : ""}</td><td>${badgeSituacao(situacaoPagar(x))}</td>
        <td class="num">${pagoConta(x) === 0 && !x.cancelado ? `<button class="btn btn-ghost btn-sm" data-acao="serie-editar" data-id="${x.id}">${x.serie.tipo === "Estimada" && x.descricao.includes("(estimada)") ? "Valor real" : "Mudar"}</button>` : ""}</td>
      </tr>`).join("")}</tbody></table></div>
      <p class="pequeno muted">Aparecem as ocorrências já lançadas neste protótipo.</p>`;
  } else {
    corpo = abaHistorico(`pagar:${c.id}`);
  }
  abrirDialogo({
    titulo: esc(c.descricao),
    descricao: `${esc(quemRecebe(c))} · ${nomeEmpresa(c.empresa)}`,
    largo: true,
    corpo: abasDetalhe(c.id, "pagar", abasLista, aba) + corpo,
    rodape: `
      ${!c.cancelado && !c.substituidaPor && pagoConta(c) === 0 ? `<button type="button" class="btn btn-ghost" data-acao="pagar-cancelar" data-id="${c.id}">${icone("ban")}Cancelar conta</button>` : ""}
      ${!c.cancelado ? `<button type="button" class="btn btn-outline" data-acao="pagar-editar" data-id="${c.id}">${icone("pencil")}Editar</button>` : ""}
      ${c.autorizacao === "pendente" ? `<button type="button" class="btn" data-acao="pagar-autorizar" data-id="${c.id}">${icone("shield-check")}Autorizar (administrador)</button>` : ""}
      ${c.tipo === "provisao" && !c.substituidaPor ? `<button type="button" class="btn" data-acao="provisao-real" data-id="${c.id}">${icone("replace")}Substituir por real</button>` : ""}
      ${emAberto(c) && c.tipo === "real" && c.autorizacao !== "pendente" ? `<button type="button" class="btn btn-verde" data-acao="pagar-baixa" data-id="${c.id}">${icone("check")}Dar baixa</button>` : ""}
      <button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Fechar</button>`,
  });
}

ACOES["copiar"] = (d) => {
  navigator.clipboard?.writeText(d.texto).then(() => toast("Código copiado. Cole no banco para pagar."), () => toast("Não deu para copiar. Selecione o código e copie.", true));
};

// ---- Tela ----

registrarTela({
  rota: "pagar",
  titulo: "Contas a pagar",
  icone: "arrow-up-right",
  grupo: "Dia a dia",
  contador: () => S.contasPagar.filter((c) => ["Vencida", "Vence hoje", "Devolvida", "Pendente de autorização"].includes(situacaoPagar(c))).length,
  render() {
    const ui = (UI.pagar ??= {});
    ui.modo ??= "mes"; ui.ref ??= HOJE; ui.indicador ??= "total"; ui.filtros ??= {}; ui.sel ??= new Set();
    ui.colunas ??= [...COLUNAS_PADRAO]; ui.ordem ??= { col: "vencimento", dir: 1 };
    const [ini, fim] = intervalo(ui.modo, ui.ref);
    const doPeriodo = S.contasPagar.filter((c) => c.vencimento >= ini && c.vencimento <= fim);
    const lista = filtrarPagar(ui).sort((a, b) => {
      const va = valorColuna(a, ui.ordem.col), vb = valorColuna(b, ui.ordem.col);
      return (typeof va === "number" ? va - vb : String(va).localeCompare(String(vb))) * ui.ordem.dir;
    });
    const { itens, controles } = paginar("pagar", lista, 12);
    const idsPagina = itens.map((c) => c.id);
    const nSel = ui.sel.size;
    const todasMarcadas = idsPagina.length && idsPagina.every((id) => ui.sel.has(id));
    const cols = COLUNAS_PAGAR.filter((c) => ui.colunas.includes(c.id));
    const f = ui.filtros;
    const filtro = (campo, rotulo, lista_, rot = (x) => x.nome) => `<label>${rotulo}<select class="input" data-mudar="pagar-filtro" data-campo="${campo}"><option value="">Todos</option>${opcoes(lista_, f[campo], rot)}</select></label>`;
    const nFiltros = Object.values(f).filter(Boolean).length + (ui.busca ? 1 : 0) + (ui.indicador !== "total" ? 1 : 0);

    return `
      ${cabecalho({ titulo: "Contas a pagar", icone: "arrow-up-right", tela: "tela-pagar",
        subtitulo: "Lance as contas, divida entre projetos e dê baixa no dia em que o dinheiro saiu.",
        acoes: `<button class="btn btn-outline" data-acao="pagar-exportar">${icone("download")}Exportar</button><button class="btn" data-acao="pagar-nova">${icone("plus")}Nova conta a pagar</button>` })}

      <div class="flex entre mb" style="flex-wrap:wrap">
        <div class="flex">
          <select class="input" style="width:auto" data-mudar="pagar-modo" aria-label="Visão por período">${[["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"], ["ano", "Ano"], ["tudo", "Tudo"]].map(([k, r]) => `<option value="${k}" ${ui.modo === k ? "selected" : ""}>${r}</option>`).join("")}</select>
          ${ui.modo === "tudo" ? "" : `${botaoIcone("chevron-left", "Período anterior", "pagar-mover", { p: -1 })}<strong style="min-width:150px;text-align:center">${rotuloPeriodo(ui.modo, ui.ref)}</strong>${botaoIcone("chevron-right", "Próximo período", "pagar-mover", { p: 1 })}
          <button class="btn btn-outline btn-sm" data-acao="pagar-mover" data-p="0">Hoje</button>`}
        </div>
        ${campoBusca("pagar", ui.busca || "", "Buscar conta, fornecedor ou NF…")}
      </div>

      <div class="indicadores">${Object.entries(INDICADORES_PAGAR).map(([k, x]) => {
        const l = doPeriodo.filter(x.f);
        const valorInd = k === "pagos" ? soma(l, pagoConta) : k === "total" || k === "provisoes" ? soma(l, (c) => c.valor) : soma(l, saldoPagar);
        return `<button class="indicador ${ui.indicador === k ? "ativo" : ""}" data-acao="pagar-indicador" data-id="${k}" aria-pressed="${ui.indicador === k}">
          <span class="r">${x.rotulo}</span><span class="v ${k === "vencidos" && l.length ? "vermelho" : ""}">${brl(valorInd)}</span><span class="n">${plural(l.length, "conta", "contas")}</span></button>`;
      }).join("")}</div>

      <div class="card">
        <div class="filtros">
          ${filtro("fornecedor", "Fornecedor", S.fornecedores, (x) => x.apelido)}
          ${filtro("projeto", "Projeto", S.projetos, (p) => codigoProjeto(p.id))}
          ${filtro("categoria", "Categoria", S.categorias.filter((c) => c.tipo === "Despesa"), (c) => `${c.codigo} ${c.nome}`)}
          ${filtro("empresa", "Empresa", S.empresas)}
          ${filtro("centro", "Centro de custo", S.centrosCusto)}
          ${filtro("forma", "Forma", S.formasPagamento)}
          <label>Tipo<select class="input" data-mudar="pagar-filtro" data-campo="tipo"><option value="">Todos</option><option value="real" ${f.tipo === "real" ? "selected" : ""}>Real</option><option value="provisao" ${f.tipo === "provisao" ? "selected" : ""}>Provisão</option></select></label>
        </div>
        <div class="barra">
          <div class="flex pequeno" style="flex-wrap:wrap">
            ${nSel ? `<strong>${plural(nSel, "selecionada", "selecionadas")}</strong>
              <button class="btn btn-verde btn-sm" data-acao="lote-baixa">${icone("check-check")}Dar baixa</button>
              <button class="btn btn-outline btn-sm" data-acao="lote-reclassificar">${icone("tags")}Reclassificar</button>
              <button class="btn btn-outline btn-sm" data-acao="lote-duplicar">${icone("copy")}Duplicar</button>
              <button class="btn btn-ghost btn-sm" data-acao="lote-excluir">${icone("trash-2")}Excluir</button>`
              : `<span class="muted">${plural(lista.length, "conta", "contas")} · pendente ${brl(soma(lista, saldoPagar))}</span>${nFiltros ? `<button class="btn-link" data-acao="pagar-limpar">Limpar filtros (${nFiltros})</button>` : ""}`}
          </div>
          <button class="btn btn-ghost btn-sm" data-acao="pagar-colunas">${icone("columns-3")}Colunas</button>
        </div>
        ${itens.length ? `<div class="tabela-wrap"><table>
          <thead><tr>
            <th style="width:36px"><input type="checkbox" class="check" aria-label="Selecionar todas da página" data-mudar="pagar-selecionar" data-id="todas" data-ids="${idsPagina.join(",")}" ${todasMarcadas ? "checked" : ""}></th>
            ${cols.map((c) => `<th class="ordenavel ${c.num ? "num" : ""}" data-acao="pagar-ordenar" data-col="${c.id}" aria-sort="${ui.ordem.col === c.id ? (ui.ordem.dir > 0 ? "ascending" : "descending") : "none"}">${c.rotulo}${ui.ordem.col === c.id ? (ui.ordem.dir > 0 ? " ↑" : " ↓") : ""}</th>`).join("")}
            <th></th>
          </tr></thead>
          <tbody>${itens.map((c) => `<tr class="${ui.sel.has(c.id) ? "selecionada" : ""}">
            <td><input type="checkbox" class="check" aria-label="Selecionar ${esc(c.descricao)}" data-mudar="pagar-selecionar" data-id="${c.id}" ${ui.sel.has(c.id) ? "checked" : ""}></td>
            ${cols.map((col) => celula(c, col.id)).join("")}
            <td class="num" style="white-space:nowrap">
              ${botaoIcone("eye", "Ver detalhes", "pagar-ver", { id: c.id })}
              ${emAberto(c) && c.tipo === "real" ? botaoIcone("check", c.autorizacao === "pendente" ? "Aguardando autorização" : "Dar baixa", "pagar-baixa", { id: c.id }) : ""}
              ${c.codigoBarras && emAberto(c) ? botaoIcone("barcode", "Copiar código de barras", "copiar", { texto: c.codigoBarras }) : ""}
            </td>
          </tr>`).join("")}</tbody>
          <tfoot><tr class="total-linha"><td colspan="${cols.length + 2}">Total filtrado: ${plural(lista.length, "conta", "contas")} · valor ${brl(soma(lista, (c) => c.valor))} · pago ${brl(soma(lista, pagoConta))} · pendente ${brl(soma(lista, saldoPagar))}</td></tr></tfoot>
        </table></div>${controles}` : `<p class="vazio">${nFiltros ? "Nenhuma conta com esses filtros." : `Nenhuma conta em ${rotuloPeriodo(ui.modo, ui.ref)}.`}</p>`}
      </div>`;
  },
});
