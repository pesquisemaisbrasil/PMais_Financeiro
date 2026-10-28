// Núcleo do protótipo: estado, formatação, rotas, diálogos, toast e validação.
// Sem build: scripts comuns, tudo global. Cada tela em telas/*.js chama registrarTela().

// ---- Estado (salvo no navegador) ----

const CHAVE_DADOS = "pmais-fin-proto:dados:v2";
const CHAVE_RESPOSTAS = "pmais-fin-proto:respostas:v1";
const CHAVE_NOME = "pmais-fin-proto:nome";

function copiar(obj) { return JSON.parse(JSON.stringify(obj)); }

function lerLocal(chave) {
  try { return JSON.parse(localStorage.getItem(chave)); } catch { return null; }
}
function gravarLocal(chave, valor) {
  try { localStorage.setItem(chave, JSON.stringify(valor)); } catch { /* sem armazenamento: segue em memória */ }
}

let S = lerLocal(CHAVE_DADOS) || copiar(DADOS_INICIAIS);
let RESPOSTAS = lerLocal(CHAVE_RESPOSTAS) || {};
const UI = {}; // estado de tela (aba, busca, seleção); não é salvo

function salvar() { gravarLocal(CHAVE_DADOS, S); render(); }
function proximoId(lista) { return lista.reduce((m, x) => Math.max(m, x.id), 0) + 1; }

// ---- Formatação ----

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
function brl(centavos) { return BRL.format((centavos || 0) / 100); }
function paraCentavos(texto) {
  const limpo = String(texto ?? "").trim().replace(/\s|R\$/g, "").replace(/\./g, "").replace(",", ".");
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : null;
}
function centavosParaCampo(c) { return (c / 100).toFixed(2).replace(".", ","); }

function fmtDia(iso) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
function somarDias(iso, dias) {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
function diasEntre(de, ate) {
  return Math.round((new Date(ate + "T12:00:00Z") - new Date(de + "T12:00:00Z")) / 86400000);
}

function esc(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function plural(n, um, varios) { return `${n} ${n === 1 ? um : varios}`; }
function icone(nome) { return `<i data-lucide="${nome}"></i>`; }
function soma(lista, f) { return lista.reduce((t, x) => t + f(x), 0); }

// ---- Busca de cadastros ----

const achar = (lista, id) => S[lista].find((x) => x.id === Number(id));
const nomeEmpresa = (id) => S.empresas.find((e) => e.id === id)?.nome ?? "—";
const nomeFornecedor = (id) => achar("fornecedores", id)?.nome ?? "—";
const nomeCliente = (id) => achar("clientes", id)?.nome ?? "—";
const nomeCategoria = (id) => achar("categorias", id)?.nome ?? "—";
const nomePessoa = (id) => achar("pessoas", id)?.nome ?? "—";
const codigoProjeto = (id) => `PRJ-${id}`;

// ---- Componentes de HTML ----

function cabecalho({ sobretitulo, titulo, icone: ic, subtitulo, acoes = "", tela }) {
  return `
    <div class="cabecalho">
      <div>
        ${sobretitulo ? `<div class="sobretitulo">${sobretitulo}</div>` : ""}
        <h1 class="titulo"><span class="chip">${icone(ic)}</span>${titulo}</h1>
        ${subtitulo ? `<p class="subtitulo">${subtitulo}</p>` : ""}
      </div>
      <div class="acoes">${acoes}${tela ? botaoValidar(tela) : ""}</div>
    </div>`;
}

function kpi({ rotulo, valor, detalhe = "", ic, cor = "cor-azul" }) {
  return `
    <div class="kpi">
      <span class="icone ${cor}">${icone(ic)}</span>
      <div>
        <div class="rotulo">${rotulo}</div>
        <div class="valor">${valor}</div>
        ${detalhe ? `<div class="detalhe">${detalhe}</div>` : ""}
      </div>
    </div>`;
}

function badge(texto, cor, ic) { return `<span class="badge b-${cor}">${ic ? icone(ic) : ""}${texto}</span>`; }

function abas(chave, itens, ativa) {
  return `<div class="abas" role="tablist">${itens.map((a) => `
    <button role="tab" aria-selected="${a.id === ativa}" class="${a.id === ativa ? "ativa" : ""}"
      data-acao="trocar-aba" data-chave="${chave}" data-aba="${a.id}">${a.rotulo}${a.n != null ? `<span class="n">${a.n}</span>` : ""}</button>`).join("")}
  </div>`;
}

function campoBusca(chave, valor, placeholder) {
  return `<div class="busca">${icone("search")}
    <input class="input" id="busca-${chave}" data-busca="${chave}" value="${esc(valor)}" placeholder="${placeholder}" aria-label="${placeholder}">
  </div>`;
}

function barraProgresso(pct) {
  const cor = pct > 100 ? "vermelho" : pct >= 80 ? "ambar" : "";
  return `<div class="progresso ${cor}"><span style="width:${Math.min(pct, 100)}%"></span></div>`;
}

function opcoes(lista, selecionado, rotulo = (x) => x.nome) {
  return lista.map((x) => `<option value="${x.id}" ${String(x.id) === String(selecionado) ? "selected" : ""}>${esc(rotulo(x))}</option>`).join("");
}

// Botão só de ícone: a legenda aparece ao passar o mouse e ao focar pelo teclado.
function botaoIcone(ic, dica, acao, dados = {}, extra = "") {
  const attrs = Object.entries(dados).map(([k, v]) => `data-${k}="${esc(v)}"`).join(" ");
  return `<button type="button" class="btn btn-ghost btn-icone" data-acao="${acao}" ${attrs} aria-label="${dica}" data-dica="${dica}" ${extra}>${icone(ic)}</button>`;
}

// Paginação de listas já carregadas.
function paginar(chave, lista, tamanho = 12) {
  const ui = (UI[chave] ??= {});
  const paginas = Math.max(1, Math.ceil(lista.length / tamanho));
  const p = Math.min(ui.pagina || 1, paginas);
  const de = (p - 1) * tamanho;
  const controles = lista.length <= tamanho ? "" : `
    <nav class="paginacao" aria-label="Paginação">
      <span>Mostrando ${de + 1}–${Math.min(de + tamanho, lista.length)} de ${lista.length}</span>
      <div class="flex">
        <button class="btn btn-outline btn-sm" data-acao="pagina" data-chave="${chave}" data-p="${p - 1}" ${p === 1 ? "disabled" : ""} aria-label="Página anterior">${icone("chevron-left")}</button>
        ${Array.from({ length: paginas }, (_, i) => `<button class="btn ${i + 1 === p ? "" : "btn-outline"} btn-sm" data-acao="pagina" data-chave="${chave}" data-p="${i + 1}" aria-label="Página ${i + 1}" ${i + 1 === p ? 'aria-current="page"' : ""}>${i + 1}</button>`).join("")}
        <button class="btn btn-outline btn-sm" data-acao="pagina" data-chave="${chave}" data-p="${p + 1}" ${p === paginas ? "disabled" : ""} aria-label="Próxima página">${icone("chevron-right")}</button>
      </div>
    </nav>`;
  return { itens: lista.slice(de, de + tamanho), controles };
}

// Pede um motivo antes de uma ação (estorno, desfazer, reabrir…).
function pedirMotivo({ titulo, descricao = "", botao = "Confirmar", perigo = false, acao }) {
  aoMotivo = acao;
  abrirDialogo({
    titulo, descricao, form: "motivo",
    corpo: `<div class="campo"><label for="motivo-txt">Motivo</label><textarea class="input" id="motivo-txt" name="motivo" autofocus placeholder="Fica registrado na auditoria"></textarea></div>`,
    rodape: `<button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Voltar</button><button type="submit" class="btn ${perigo ? "btn-perigo" : ""}">${botao}</button>`,
  });
}
let aoMotivo = null;

// ---- Diálogo, confirmação e toast ----

const dialogo = () => document.getElementById("dialogo");
let aoConfirmar = null;

function abrirDialogo({ titulo, descricao = "", corpo, rodape, form, largo = false }) {
  const d = dialogo();
  d.className = "dialogo" + (largo ? " largo" : "");
  const miolo = `
    <div class="d-topo"><h2>${titulo}</h2>${descricao ? `<p>${descricao}</p>` : ""}</div>
    <div class="d-corpo">${corpo}</div>
    <div class="d-rodape">${rodape ?? `<button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Fechar</button>`}</div>`;
  d.innerHTML = form ? `<form data-form="${form}" novalidate>${miolo}</form>` : miolo;
  if (!d.open) d.showModal();
  window.lucide?.createIcons();
  d.querySelector("[autofocus]")?.focus();
}
function fecharDialogo() { if (dialogo().open) dialogo().close(); }

function confirmar({ titulo, mensagem, botao = "Confirmar", perigo = false, acao }) {
  aoConfirmar = acao;
  abrirDialogo({
    titulo,
    corpo: `<p style="margin:0">${mensagem}</p>`,
    rodape: `
      <button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Voltar</button>
      <button type="button" class="btn ${perigo ? "btn-perigo" : ""}" data-acao="confirmar-ok">${botao}</button>`,
  });
}

function toast(texto, erro = false) {
  const el = document.createElement("div");
  el.className = "toast" + (erro ? " erro" : "");
  el.setAttribute("role", erro ? "alert" : "status");
  el.innerHTML = `${icone(erro ? "circle-alert" : "circle-check")}<span>${esc(texto)}</span>`;
  const pilha = document.getElementById("toasts");
  pilha.append(el);
  while (pilha.children.length > 3) pilha.firstElementChild.remove();
  window.lucide?.createIcons();
  setTimeout(() => el.remove(), 4500);
}

function baixarCsv(nome, linhas) {
  // Célula que começa com = + - @ vira texto, para a planilha não executar fórmula.
  const celula = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const csv = "﻿" + linhas.map((l) => l.map(celula).join(";")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  a.download = nome;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ---- Validação com o financeiro ----

// Pontos que o financeiro valida: uma tela inteira ou uma regra específica.
const PONTOS = {};
function ponto(id, tela, texto) { PONTOS[id] = { id, tela, texto }; }

function botaoValidar(id) {
  const r = RESPOSTAS[id];
  const rotulo = r ? { sim: "Validado: está certo", nao: "Validado: precisa mudar", comentar: "Comentário feito" }[r.resposta] : "Isto está certo?";
  return `<button class="btn ${r ? "btn-outline" : "btn-ghost"} btn-sm" data-acao="validar" data-id="${id}">
    ${icone(r ? "message-square-check" : "message-square-more")}${rotulo}</button>`;
}

function regra(id) {
  const respondida = RESPOSTAS[id] ? " respondida" : "";
  return `<button type="button" class="regra${respondida}" data-acao="validar" data-id="${id}"
    title="Regra a validar: ${esc(PONTOS[id]?.texto)}">${icone("circle-help")}Regra a validar</button>`;
}

function abrirValidacao(id) {
  const p = PONTOS[id] || { texto: PERGUNTAS_ABERTAS.find((q) => q.id === id)?.texto ?? id };
  const r = RESPOSTAS[id] || {};
  const opcao = (valor, rotulo, ic) => `
    <label><input type="radio" name="resposta" value="${valor}" ${r.resposta === valor ? "checked" : ""}>${icone(ic)}${rotulo}</label>`;
  abrirDialogo({
    titulo: "Isto está certo?",
    descricao: esc(p.texto),
    form: "salvar-validacao",
    corpo: `
      <input type="hidden" name="id" value="${id}">
      <div class="opcoes-validacao">
        ${opcao("sim", "Sim", "thumbs-up")}${opcao("nao", "Não", "thumbs-down")}${opcao("comentar", "Comentar", "message-circle")}
      </div>
      <div class="campo">
        <label for="quem">Seu nome</label>
        <input class="input" id="quem" name="quem" value="${esc(lerLocal(CHAVE_NOME) || "")}" placeholder="Para sabermos quem respondeu">
      </div>
      <div class="campo">
        <label for="comentario">Comentário (opcional)</label>
        <textarea class="input" id="comentario" name="comentario" placeholder="O que muda, como é feito hoje…">${esc(r.comentario)}</textarea>
      </div>`,
    rodape: `
      <button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Cancelar</button>
      <button type="submit" class="btn">Salvar resposta</button>`,
  });
}

// Manda a resposta para o Netlify Forms (painel do site), para juntar as respostas de todo mundo.
// Abrindo o arquivo direto no computador, o envio falha em silêncio e a resposta fica só neste navegador.
function enviarResposta(id) {
  if (location.protocol === "file:") return;
  const r = RESPOSTAS[id];
  const p = PONTOS[id] || { tela: "Perguntas abertas", texto: PERGUNTAS_ABERTAS.find((q) => q.id === id)?.texto ?? id };
  const corpo = new URLSearchParams({
    "form-name": "validacao", quem: r.quem, tela: p.tela, ponto: `${id} · ${p.texto}`,
    resposta: { sim: "Está certo", nao: "Precisa mudar", comentar: "Comentário" }[r.resposta], comentario: r.comentario, quando: r.quando,
  });
  fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: corpo.toString() })
    .catch(() => toast("Não deu para enviar a resposta agora. Ela ficou guardada neste navegador.", true));
}

// ---- Rotas e renderização ----

const TELAS = [];
const ACOES = {};
const FORMS = {};
const BUSCAS = {};

function registrarTela(tela) { TELAS.push(tela); }

function rotaAtual() {
  const [rota = "inicio", param] = location.hash.replace(/^#\/?/, "").split("/");
  return { rota, param };
}

function renderMenu(rota) {
  let grupo = null;
  document.getElementById("menu").innerHTML = TELAS.filter((t) => !t.escondida).map((t) => {
    const titulo = t.grupo !== grupo ? `<div class="menu-grupo">${(grupo = t.grupo)}</div>` : "";
    const n = t.contador?.() || 0;
    return `${titulo}<a href="#/${t.rota}" class="${t.rota === rota ? "ativo" : ""}" ${t.rota === rota ? 'aria-current="page"' : ""}>
      ${icone(t.icone)}<span>${t.titulo}</span>${n ? `<span class="contador" title="${n} pendências">${n}</span>` : ""}</a>`;
  }).join("");
}

function render() {
  const { rota, param } = rotaAtual();
  const tela = TELAS.find((t) => t.rota === rota) || TELAS[0];
  const foco = document.activeElement;
  const focoId = foco?.id;
  const cursor = foco?.selectionStart;

  renderMenu(tela.menu || tela.rota);
  document.getElementById("tela").innerHTML = tela.render(param);
  window.lucide?.createIcons();

  if (focoId) {
    const el = document.getElementById(focoId);
    if (el && el !== document.body && !dialogo().contains(el)) {
      el.focus();
      if (cursor != null && el.setSelectionRange) el.setSelectionRange(cursor, cursor);
    }
  }
}

function dadosDoForm(form) { return Object.fromEntries(new FormData(form).entries()); }

function iniciar() {
  ACOES["fechar-dialogo"] = fecharDialogo;
  ACOES["confirmar-ok"] = () => { const f = aoConfirmar; aoConfirmar = null; fecharDialogo(); f?.(); };
  ACOES["trocar-aba"] = (d) => { UI[d.chave] = { ...UI[d.chave], aba: d.aba, sel: new Set() }; render(); };
  ACOES["validar"] = (d) => abrirValidacao(d.id);
  ACOES["pagina"] = (d) => { UI[d.chave] = { ...UI[d.chave], pagina: Number(d.p) }; render(); };
  FORMS["motivo"] = (f) => {
    if (!f.motivo.trim()) return toast("Escreva o motivo.", true);
    const fn = aoMotivo; aoMotivo = null; fecharDialogo(); fn?.(f.motivo.trim());
  };
  ACOES["restaurar"] = () => confirmar({
    titulo: "Restaurar dados de exemplo",
    mensagem: "Tudo o que você fez nas telas volta ao começo. As respostas de validação continuam guardadas.",
    botao: "Restaurar",
    perigo: true,
    acao: () => { S = copiar(DADOS_INICIAIS); for (const k in UI) delete UI[k]; salvar(); toast("Dados de exemplo restaurados."); },
  });
  FORMS["salvar-validacao"] = (f) => {
    if (!f.resposta) return toast("Escolha Sim, Não ou Comentar.", true);
    if (!f.quem.trim()) return toast("Escreva seu nome para sabermos quem respondeu.", true);
    gravarLocal(CHAVE_NOME, f.quem.trim());
    RESPOSTAS[f.id] = { resposta: f.resposta, comentario: f.comentario.trim(), quando: new Date().toISOString(), quem: f.quem.trim() };
    gravarLocal(CHAVE_RESPOSTAS, RESPOSTAS);
    enviarResposta(f.id);
    fecharDialogo();
    render();
    toast("Resposta guardada. Veja todas em Validação.");
  };

  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-acao]");
    if (!el || el.disabled) return;
    const fn = ACOES[el.dataset.acao];
    if (fn) { e.preventDefault(); fn(el.dataset, el); }
  });
  document.addEventListener("submit", (e) => {
    const form = e.target.closest("[data-form]");
    if (!form) return;
    e.preventDefault();
    FORMS[form.dataset.form]?.(dadosDoForm(form), form);
  });
  document.addEventListener("input", (e) => {
    const chave = e.target.dataset?.busca;
    if (chave == null) return;
    UI[chave] = { ...UI[chave], busca: e.target.value, pagina: 1 };
    render();
  });
  document.addEventListener("change", (e) => {
    const el = e.target.closest("[data-mudar]");
    if (el) ACOES[el.dataset.mudar]?.(el.dataset, el);
  });

  window.addEventListener("hashchange", () => { window.scrollTo(0, 0); render(); });
  render();
}
