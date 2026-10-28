// Cadastros: empresas e unidades, centros de custo, plano de contas (com linha do DRE), fornecedores, clientes,
// contas bancárias, formas de pagamento e projetos (lidos do Connect). Importação de teste do SGE4B.

ponto("tela-cadastros", "Cadastros", "Os cadastros classificam todo lançamento: empresa, unidade, projeto, centro de custo e categoria são independentes.");
ponto("regra-inativar", "Cadastros", "Cadastro com lançamento não é excluído, só inativado. Inativo some das listas de escolha, mas continua nos relatórios.");
ponto("regra-projetos-connect", "Cadastros", "Projetos não são cadastrados aqui: vêm do P+ Connect, com orçamento por itens e prazo de pagamento.");
ponto("regra-importacao-sge4b", "Cadastros", "Importação do SGE4B: mostra as linhas com erro e o motivo, e só grava depois da confirmação.");
ponto("regra-plano-contas", "Cadastros", "Plano de contas: só conta analítica recebe lançamento, e cada uma aponta para uma linha do DRE. Mudar o vínculo vale daqui para a frente.");
ponto("regra-documento-unico", "Cadastros", "CPF/CNPJ com dígito verificador válido e único entre os fornecedores ativos.");
ponto("regra-ficha-fornecedor", "Cadastros", "Ficha de fornecedor: apelido, nome, documento, contato, telefone, e-mail, chave Pix e condição de pagamento. Quais campos faltam?");

const TIPOS_CADASTRO = {
  fornecedores: { rotulo: "Fornecedores", um: "fornecedor", novo: "Novo fornecedor" },
  clientes: { rotulo: "Clientes", um: "cliente", novo: "Novo cliente" },
  categorias: { rotulo: "Plano de contas", um: "conta", novo: "Nova conta" },
  unidades: { rotulo: "Empresas e unidades", um: "unidade", novo: "Nova unidade" },
  centrosCusto: { rotulo: "Centros de custo", um: "centro de custo", novo: "Novo centro de custo" },
  contasBancarias: { rotulo: "Contas bancárias", um: "conta bancária", novo: "Nova conta bancária" },
  formasPagamento: { rotulo: "Formas de pagamento", um: "forma de pagamento", novo: "Nova forma" },
  projetos: { rotulo: "Projetos (Connect)", um: "projeto" },
};

function usado(tipo, id) {
  const t = S.contasPagar, r = S.contasReceber;
  switch (tipo) {
    case "fornecedores": return t.some((c) => c.fornecedor === id);
    case "clientes": return r.some((x) => x.cliente === id);
    case "categorias": return t.some((c) => c.categoria === id) || r.some((x) => x.categoria === id);
    case "unidades": return t.some((c) => c.unidade === id) || r.some((x) => x.unidade === id);
    case "centrosCusto": return t.some((c) => c.centroCusto === id) || r.some((x) => x.centroCusto === id);
    case "formasPagamento": return t.some((c) => c.forma === id);
    case "contasBancarias": return t.some((c) => c.baixas.some((b) => b.conta === id)) || S.extrato.some((e) => e.conta === id);
    default: return true;
  }
}

function documentoValido(num) {
  const d = num.replace(/\D/g, "");
  const dv = (base, pesos) => { const s = base.split("").reduce((a, n, i) => a + Number(n) * pesos[i], 0) % 11; return s < 2 ? 0 : 11 - s; };
  if (d.length === 11) {
    if (/^(\d)\1+$/.test(d)) return false;
    const p1 = [10, 9, 8, 7, 6, 5, 4, 3, 2], p2 = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2];
    return dv(d.slice(0, 9), p1) === Number(d[9]) && dv(d.slice(0, 10), p2) === Number(d[10]);
  }
  if (d.length === 14) {
    if (/^(\d)\1+$/.test(d)) return false;
    const p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    return dv(d.slice(0, 12), p1) === Number(d[12]) && dv(d.slice(0, 13), p2) === Number(d[13]);
  }
  return false;
}

function formCadastro(tipo, item = {}) {
  const t = TIPOS_CADASTRO[tipo];
  const campo = (id, rotulo, valor, extra = "") => `<div class="campo"><label for="c-${id}">${rotulo}</label><input class="input" id="c-${id}" name="${id}" value="${esc(valor)}" ${extra}></div>`;
  let campos;
  if (tipo === "fornecedores" || tipo === "clientes") {
    campos = `
      <div class="linha-campos">${campo("apelido", "Apelido *", item.apelido, "autofocus")}${campo("nome", "Nome / razão social *", item.nome)}</div>
      <div class="linha-campos">
        <div class="campo"><label for="c-pessoa">Tipo</label><select class="input" id="c-pessoa" name="pessoa">${["Empresa", "Pessoa"].map((x) => `<option ${item.pessoa === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
        ${item.id ? `<div class="campo"><label>Documento</label><input class="input" disabled value="${esc(item.documento)} final ${esc(item.docFinal)}"><span class="dica">O número completo fica guardado e não aparece em lista.</span></div>`
          : `<div class="campo"><label for="c-doc">CPF ou CNPJ *</label><input class="input" id="c-doc" name="docNum" placeholder="Só números" inputmode="numeric"><span class="dica">Teste: 11.222.333/0001-81 é válido. ${regra("regra-documento-unico")}</span></div>`}
      </div>
      <div class="linha-campos">${campo("contato", "Contato responsável", item.contato)}${campo("telefone", "Telefone", item.telefone, 'placeholder="+55 41 99999-0000"')}</div>
      <div class="linha-campos">${campo("email", "E-mail", item.email, 'type="email"')}${campo("pix", "Chave Pix", item.pix)}</div>
      ${campo("condicao", tipo === "clientes" ? "Condição comercial" : "Condição de pagamento", item.condicao)}
      <p class="pequeno muted" style="margin:0">${regra("regra-ficha-fornecedor")}</p>`;
  } else if (tipo === "categorias") {
    campos = `
      <div class="linha-campos">
        <div class="campo"><label for="c-grupo">Grupo (conta sintética)</label><select class="input" id="c-grupo" name="grupo" ${item.id ? "disabled" : ""}>${S.gruposContas.map((g) => `<option value="${g.codigo}" ${item.grupo === g.codigo ? "selected" : ""}>${g.codigo} ${g.nome}</option>`).join("")}</select></div>
        ${campo("nome", "Nome *", item.nome, "autofocus")}
      </div>
      <div class="linha-campos">
        <div class="campo"><label for="c-tipo">Natureza</label><select class="input" id="c-tipo" name="natureza">${["Despesa", "Receita"].map((x) => `<option ${item.tipo === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
        <div class="campo"><label for="c-dre">Linha do DRE *</label><select class="input" id="c-dre" name="dre"><option value="">Escolha…</option>${opcoes(S.linhasDre, item.dre)}</select><span class="dica">Mudar vale daqui para a frente.</span></div>
      </div>
      <p class="pequeno muted" style="margin:0">${regra("regra-plano-contas")}</p>`;
  } else if (tipo === "unidades") {
    campos = `<div class="linha-campos">
      <div class="campo"><label for="c-emp">Empresa</label><select class="input" id="c-emp" name="empresa">${opcoes(S.empresas, item.empresa)}</select></div>
      ${campo("nome", "Nome da unidade *", item.nome, "autofocus")}</div>`;
  } else if (tipo === "contasBancarias") {
    campos = `
      <div class="linha-campos">${campo("nome", "Apelido *", item.nome, 'autofocus placeholder="Itaú · PPlus"')}${campo("banco", "Banco", item.banco || "Itaú")}</div>
      <div class="linha-campos-3">${campo("agencia", "Agência", item.agencia)}${campo("conta", "Conta", item.conta)}
        <div class="campo"><label for="c-tipoc">Tipo</label><select class="input" id="c-tipoc" name="tipoConta">${["Corrente", "Aplicação", "Caixa"].map((x) => `<option ${item.tipo === x ? "selected" : ""}>${x}</option>`).join("")}</select></div></div>
      <div class="linha-campos">
        <div class="campo"><label for="c-emp">Empresa</label><select class="input" id="c-emp" name="empresa">${opcoes(S.empresas, item.empresa)}</select></div>
        ${campo("saldoInicial", "Saldo inicial (R$)", item.saldoInicial != null ? centavosParaCampo(item.saldoInicial) : "", item.id ? "disabled" : "")}
      </div>`;
  } else {
    campos = campo("nome", "Nome *", item.nome, "autofocus");
  }
  abrirDialogo({
    titulo: item.id ? `Editar ${t.um}` : t.novo,
    form: "salvar-cadastro",
    largo: tipo === "fornecedores" || tipo === "clientes" || tipo === "contasBancarias",
    corpo: `<input type="hidden" name="tipo" value="${tipo}"><input type="hidden" name="id" value="${item.id ?? ""}">${campos}`,
    rodape: `<button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Cancelar</button><button type="submit" class="btn">${item.id ? "Salvar alterações" : "Cadastrar"}</button>`,
  });
}

ACOES["cadastro-novo"] = (d) => formCadastro(d.tipo);
ACOES["cadastro-editar"] = (d) => formCadastro(d.tipo, achar(d.tipo, d.id));
ACOES["cadastro-ativo"] = (d) => {
  const item = achar(d.tipo, d.id);
  item.ativo = !item.ativo;
  auditar(`cadastro:${d.tipo}:${item.id}`, `${item.ativo ? "Reativou" : "Inativou"} ${item.nome}`);
  salvar();
  toast(item.ativo ? `${item.nome} reativado.` : `${item.nome} inativado. Some das listas de escolha e continua nos relatórios.`);
};
ACOES["cadastro-excluir"] = (d) => {
  const item = achar(d.tipo, d.id);
  if (usado(d.tipo, item.id)) return toast("Esse cadastro tem lançamentos — inative em vez de excluir.", true);
  confirmar({
    titulo: `Excluir ${esc(item.nome)}`, mensagem: "Não há lançamentos com ele. Isso não pode ser desfeito.", botao: "Excluir", perigo: true,
    acao: () => { S[d.tipo] = S[d.tipo].filter((x) => x.id !== item.id); auditar(`cadastro:${d.tipo}:${item.id}`, `Excluiu ${item.nome}`); salvar(); toast(`${item.nome} excluído.`); },
  });
};

FORMS["salvar-cadastro"] = (f) => {
  const lista = S[f.tipo];
  const nome = (f.nome || "").trim();
  if (!nome) return toast("Preencha o nome.", true);
  if ((f.tipo === "fornecedores" || f.tipo === "clientes") && !f.apelido.trim()) return toast("Preencha o apelido.", true);
  if (f.tipo === "categorias" && !f.dre) return toast("Vincule a conta a uma linha do DRE.", true);
  if (lista.find((x) => x.nome.toLowerCase() === nome.toLowerCase() && String(x.id) !== f.id && x.ativo !== false)) return toast(`Já existe um ${TIPOS_CADASTRO[f.tipo].um} com esse nome.`, true);
  if (f.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email)) return toast("E-mail inválido.", true);
  if (f.telefone && !/^\+\d{2} \d{2} [\d-]{8,10}$/.test(f.telefone.trim())) return toast("Telefone no formato +55 41 99999-0000.", true);
  const dados = { nome };
  if (f.tipo === "fornecedores" || f.tipo === "clientes") {
    Object.assign(dados, { apelido: f.apelido.trim(), pessoa: f.pessoa, contato: f.contato.trim(), telefone: f.telefone.trim(), email: f.email.trim(), pix: f.pix.trim(), condicao: f.condicao.trim() });
    if (!f.id) {
      const num = (f.docNum || "").replace(/\D/g, "");
      if (!documentoValido(num)) return toast("CPF ou CNPJ inválido (confira os dígitos).", true);
      if (lista.some((x) => x.docNum === num && x.ativo)) return toast(`Já existe um ${TIPOS_CADASTRO[f.tipo].um} ativo com esse documento.`, true);
      Object.assign(dados, { documento: num.length === 11 ? "CPF" : "CNPJ", docNum: num, docFinal: num.slice(-6, -2) + "-" + num.slice(-2) });
    }
  } else if (f.tipo === "categorias") {
    const c = f.id ? achar("categorias", f.id) : null;
    const grupo = c ? c.grupo : f.grupo;
    const codigo = c ? c.codigo : `${grupo}.${String(Math.max(0, ...lista.filter((x) => x.grupo === grupo).map((x) => Number(x.codigo.split(".")[1]))) + 1).padStart(2, "0")}`;
    if (c && Number(f.dre) !== c.dre) auditar(`cadastro:categorias:${c.id}`, `Linha do DRE: ${nomeDre(c.dre)} → ${nomeDre(Number(f.dre))} (vale daqui para a frente)`);
    Object.assign(dados, { grupo, codigo, tipo: f.natureza, dre: Number(f.dre) });
  } else if (f.tipo === "unidades") {
    dados.empresa = f.empresa;
  } else if (f.tipo === "contasBancarias") {
    Object.assign(dados, { banco: f.banco.trim(), agencia: f.agencia.trim(), conta: f.conta.trim(), empresa: f.empresa, tipo: f.tipoConta });
    if (!f.id) Object.assign(dados, { saldoInicial: paraCentavos(f.saldoInicial) || 0, dataSaldo: HOJE });
  }
  if (f.id) {
    Object.assign(achar(f.tipo, f.id), dados);
    auditar(`cadastro:${f.tipo}:${f.id}`, `Editou ${nome}`);
  } else {
    const novo = { ...dados, id: proximoId(lista), ativo: true };
    lista.push(novo);
    auditar(`cadastro:${f.tipo}:${novo.id}`, `Cadastrou ${nome}`);
  }
  fecharDialogo();
  salvar();
  toast(f.id ? "Alterações salvas." : `${nome} cadastrado.`);
};

// ---- Importação de teste do SGE4B ----

const SGE4B_EXEMPLO = [
  ["Transportes Rota Certa", "11.222.333/0001-81", "rota@exemplo.com"],
  ["Buffet Sabor da Casa", "11.444.777/0001-61", "buffet@exemplo.com"],
  ["Transportes JK", "12.345.678/0001-00", "jk@exemplo.com"],
  ["", "45.723.174/0001-10", ""],
  ["Gráfica Ponto Certo", "33.000.167/0001-01", "rui@pontocerto.exemplo"],
  ["Coworking Batel", "45.723.174/0001-10", "contato@cowork.exemplo"],
  ["Bot Atende Ltda", "60.701.190/0001-04", "suporte@bot.exemplo"],
  ["Lista Telefônica Sul", "33.592.510/0001-54", "comercial@lista.exemplo"],
];
function lerSge4b() {
  return SGE4B_EXEMPLO.map(([nome, doc, email], i) => {
    const num = doc.replace(/\D/g, "");
    let erro = null;
    if (!nome.trim()) erro = "Nome vazio";
    else if (!documentoValido(num)) erro = "CNPJ com dígito errado";
    else if (S.fornecedores.some((f) => f.nome.toLowerCase() === nome.toLowerCase())) erro = "Já existe um fornecedor com esse nome";
    return { linha: i + 2, nome, doc, num, email, erro };
  });
}
ACOES["importar-sge4b"] = () => {
  const linhas = lerSge4b();
  const boas = linhas.filter((l) => !l.erro);
  abrirDialogo({
    titulo: "Importação de teste do SGE4B",
    descricao: "fornecedores-sge4b.xlsx (exemplo). Nada é gravado antes da confirmação.",
    largo: true,
    corpo: `
      <div class="kpis" style="margin-bottom:16px">
        ${kpi({ rotulo: "Linhas lidas", valor: String(linhas.length), ic: "file-spreadsheet" })}
        ${kpi({ rotulo: "Entram", valor: String(boas.length), ic: "circle-check", cor: "cor-verde" })}
        ${kpi({ rotulo: "Com erro", valor: String(linhas.length - boas.length), ic: "circle-x", cor: "cor-vermelho" })}
      </div>
      <div class="card"><table>
        <thead><tr><th>Linha</th><th>Nome</th><th>CNPJ</th><th>Resultado</th></tr></thead>
        <tbody>${linhas.map((l) => `<tr><td>${l.linha}</td><td class="nome">${esc(l.nome) || "—"}</td><td class="mono">${esc(l.doc)}</td><td>${l.erro ? `<span class="vermelho">${esc(l.erro)}</span>` : badge("Entra", "verde")}</td></tr>`).join("")}</tbody>
      </table></div>
      <p class="pequeno muted">${regra("regra-importacao-sge4b")}</p>`,
    rodape: `<button type="button" class="btn btn-outline" data-acao="baixar-erros-sge4b">${icone("download")}Baixar lista de erros</button>
      <button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Cancelar</button>
      <button type="button" class="btn" data-acao="confirmar-sge4b" ${boas.length ? "" : "disabled"}>Importar ${plural(boas.length, "fornecedor", "fornecedores")}</button>`,
  });
};
ACOES["baixar-erros-sge4b"] = () => {
  baixarCsv("erros-importacao-sge4b.csv", [["Linha", "Nome", "CNPJ", "O que corrigir"], ...lerSge4b().filter((l) => l.erro).map((l) => [l.linha, l.nome, l.doc, l.erro])]);
  toast("Lista de erros baixada.");
};
ACOES["confirmar-sge4b"] = () => {
  const boas = lerSge4b().filter((l) => !l.erro);
  for (const l of boas) {
    S.fornecedores.push({ id: proximoId(S.fornecedores), apelido: l.nome.split(" ")[0], nome: l.nome, pessoa: "Empresa", documento: "CNPJ", docNum: l.num, docFinal: l.num.slice(-6, -2) + "-" + l.num.slice(-2), contato: "", telefone: "", email: l.email, pix: "", condicao: "", ativo: true });
  }
  auditar("cadastro:importacao", `Importou ${boas.length} fornecedores do SGE4B (teste)`);
  fecharDialogo();
  salvar();
  toast(`${plural(boas.length, "fornecedor importado", "fornecedores importados")}. As linhas com erro ficaram de fora.`);
};

// ---- Tela ----

function linhasCadastro(tipo, lista) {
  const acoes = (x) => `<td class="num" style="white-space:nowrap">
    ${botaoIcone("pencil", "Editar", "cadastro-editar", { tipo, id: x.id })}
    ${botaoIcone(x.ativo ? "archive" : "archive-restore", x.ativo ? "Inativar" : "Reativar", "cadastro-ativo", { tipo, id: x.id })}
    ${botaoIcone("trash-2", "Excluir", "cadastro-excluir", { tipo, id: x.id })}</td>`;
  const sit = (x) => `<td>${x.ativo ? badge("Ativo", "verde") : badge("Inativo", "cinza")}</td>`;
  if (tipo === "fornecedores" || tipo === "clientes") {
    return { cab: ["Apelido · nome", "Documento", "Contato", "Pix", "Condição", "Situação", ""], linhas: lista.map((x) => `<tr>
      <td><span class="nome">${esc(x.apelido)}</span><span class="sub">${esc(x.nome)} · ${esc(x.pessoa)}</span></td>
      <td class="mono">${esc(x.documento)} ···${esc(x.docFinal)}</td>
      <td class="pequeno">${esc(x.contato) || "—"}<span class="sub">${esc(x.email || x.telefone)}</span></td>
      <td class="mono">${esc(x.pix) || "—"}</td><td class="pequeno">${esc(x.condicao) || "—"}</td>${sit(x)}${acoes(x)}</tr>`) };
  }
  if (tipo === "categorias") {
    return { cab: ["Código", "Conta", "Natureza", "Linha do DRE", "Situação", ""], linhas: S.gruposContas.flatMap((g) => [
      `<tr class="total-linha"><td class="mono">${g.codigo}</td><td colspan="5">${esc(g.nome)} <span class="muted pequeno">(sintética, não recebe lançamento)</span></td></tr>`,
      ...lista.filter((c) => c.grupo === g.codigo).sort((a, b) => a.codigo.localeCompare(b.codigo)).map((c) => `<tr>
        <td class="mono">${c.codigo}</td><td class="nome" style="padding-left:28px">${esc(c.nome)}</td>
        <td>${c.tipo === "Receita" ? badge("Receita", "verde") : badge("Despesa", "cinza")}</td><td>${esc(nomeDre(c.dre))}</td>${sit(c)}${acoes(c)}</tr>`),
    ]) };
  }
  if (tipo === "unidades") {
    return { cab: ["Empresa", "Unidade", "Situação", ""], linhas: S.empresas.flatMap((e) => [
      `<tr class="total-linha"><td>${e.nome}</td><td colspan="3" class="muted pequeno">CNPJ final ${e.cnpjFinal}</td></tr>`,
      ...lista.filter((u) => u.empresa === e.id).map((u) => `<tr><td></td><td class="nome">${esc(u.nome)}</td>${sit(u)}${acoes(u)}</tr>`),
    ]) };
  }
  if (tipo === "contasBancarias") {
    return { cab: ["Conta", "Banco", "Agência / conta", "Tipo", "Empresa", "Saldo inicial", "Situação", ""], linhas: lista.map((x) => `<tr>
      <td class="nome">${esc(x.nome)}</td><td>${esc(x.banco)}</td><td class="mono">${esc(x.agencia)} / ${esc(x.conta)}</td><td>${esc(x.tipo)}</td><td>${nomeEmpresa(x.empresa)}</td>
      <td class="num">${brl(x.saldoInicial)}<span class="sub">em ${fmtDia(x.dataSaldo)}</span></td>${sit(x)}${acoes(x)}</tr>`) };
  }
  if (tipo === "projetos") {
    return { cab: ["Projeto", "Cliente", "Situação", "Orçamento por itens", "Prazo de pagamento"], linhas: lista.map((p) => `<tr>
      <td><span class="nome">${codigoProjeto(p.id)} · ${esc(p.titulo)}</span><span class="sub">${esc(nomeUnidade(p.unidade))}</span></td>
      <td>${esc(nomeCliente(p.cliente))}</td><td>${badgeProjeto(p.situacao)}</td>
      <td class="pequeno">${p.itens.length ? p.itens.map((i) => `${esc(i.item)}: ${brl(i.valor)} (${fmtDia(i.data)})`).join("<br>") : '<span class="muted">—</span>'}${p.orcamento ? `<span class="sub">Entrevistas: ${brl(p.orcamento)}</span>` : ""}</td>
      <td>${p.prazoPagamento} dias</td></tr>`) };
  }
  return { cab: ["Nome", "Situação", ""], linhas: lista.map((x) => `<tr><td class="nome">${esc(x.nome)}</td>${sit(x)}${acoes(x)}</tr>`) };
}

registrarTela({
  rota: "cadastros",
  titulo: "Cadastros",
  icone: "book-user",
  grupo: "Configuração",
  render() {
    const ui = (UI.cadastros ??= { aba: "fornecedores", busca: "" });
    const tipo = ui.aba;
    const t = TIPOS_CADASTRO[tipo];
    const termo = (ui.busca || "").trim().toLowerCase();
    const lista = S[tipo].filter((x) => !termo || `${x.nome || x.titulo} ${x.apelido || ""} ${x.id}`.toLowerCase().includes(termo));
    const paginavel = ["fornecedores", "clientes"].includes(tipo);
    const { itens, controles } = paginavel ? paginar("cadastros", lista, 10) : { itens: lista, controles: "" };
    const { cab, linhas } = linhasCadastro(tipo, itens);
    const somenteLeitura = tipo === "projetos";

    return `
      ${cabecalho({
        titulo: "Cadastros", icone: "book-user", tela: "tela-cadastros",
        subtitulo: "Quem paga, quem recebe e como cada gasto é classificado. Projetos vêm prontos do P+ Connect.",
        acoes: `<button class="btn btn-outline" data-acao="importar-sge4b">${icone("file-up")}Importar do SGE4B (teste)</button>`,
      })}
      <div class="card">
        <div class="barra">${abas("cadastros", Object.entries(TIPOS_CADASTRO).map(([id, x]) => ({ id, rotulo: x.rotulo })), tipo)}</div>
        <div class="barra">
          ${campoBusca("cadastros", ui.busca || "", `Buscar em ${t.rotulo.toLowerCase()}…`)}
          ${somenteLeitura ? "" : `<button class="btn" data-acao="cadastro-novo" data-tipo="${tipo}">${icone("plus")}${t.novo}</button>`}
        </div>
        ${somenteLeitura ? `<div style="padding:12px 16px 0"><div class="aviso aviso-azul">${icone("info")}<div>
          <strong>Projetos vêm do P+ Connect</strong>Ciclo de vida, orçamento por itens e prazo ficam no Connect; aqui é só leitura. ${regra("regra-projetos-connect")}</div></div></div>` : ""}
        ${tipo === "categorias" ? `<div style="padding:12px 16px 0"><div class="aviso aviso-azul">${icone("info")}<div><strong>Plano de contas</strong>Lista de exemplo para validar (pergunta F3). ${regra("regra-plano-contas")}</div></div></div>` : ""}
        ${itens.length ? `<div class="tabela-wrap"><table>
          <thead><tr>${cab.map((c) => `<th>${c}</th>`).join("")}</tr></thead>
          <tbody>${linhas.join("")}</tbody>
        </table></div>${controles}` : `<p class="vazio">${termo ? "Nada encontrado com essa busca." : `Nenhum ${t.um} cadastrado ainda.`}</p>`}
        ${somenteLeitura ? "" : `<p class="pequeno muted" style="padding:12px 16px;margin:0;border-top:1px solid var(--border)">Cadastro com lançamento não é excluído, é inativado. ${regra("regra-inativar")}</p>`}
      </div>`;
  },
});
