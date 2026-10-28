// Regras de negócio compartilhadas pelas telas: situação dos títulos, saldos, período fechado, orçamento e auditoria.

// ---- Nomes de cadastros ----

const nomeForma = (id) => achar("formasPagamento", id)?.nome ?? "—";
const nomeUnidade = (id) => achar("unidades", id)?.nome ?? "—";
const nomeCentro = (id) => achar("centrosCusto", id)?.nome ?? "—";
const nomeConta = (id) => achar("contasBancarias", id)?.nome ?? "—";
const nomeDre = (id) => achar("linhasDre", id)?.nome ?? "—";
function nomeCategoriaCompleto(id) {
  const c = achar("categorias", id);
  return c ? `${c.codigo} ${c.nome}` : "—";
}

// ---- Contas a pagar ----

function quemRecebe(c) { return c.favorecido || nomeFornecedor(c.fornecedor); }

// Pagamento soma; estorno e devolução (Pix que voltou) subtraem.
function valorBaixa(b) { return b.tipo === "pagamento" ? b.valor : -b.valor; }
function pagoConta(c) { return soma(c.baixas, valorBaixa); }
// Pendente = valor + juros/multa declarados na baixa − baixas.
function acrescimos(c) { return soma(c.baixas.filter((b) => b.tipo === "pagamento"), (b) => b.acrescimo || 0); }
function saldoPagar(c) {
  if (c.cancelado || c.substituidaPor) return 0;
  return c.valor + acrescimos(c) - pagoConta(c);
}
function situacaoPagar(c) {
  if (c.cancelado) return "Cancelada";
  if (c.substituidaPor) return "Substituída";
  if (c.autorizacao === "pendente") return "Pendente de autorização";
  if (saldoPagar(c) <= 0) return "Paga";
  const ultima = c.baixas[c.baixas.length - 1];
  if (ultima?.tipo === "devolucao") return "Devolvida";
  if (c.vencimento < HOJE) return "Vencida";
  if (c.vencimento === HOJE) return "Vence hoje";
  if (pagoConta(c) > 0) return "Parcial";
  return "A vencer";
}
function emAberto(c) { return saldoPagar(c) > 0; }

// Documentação (nota, folha, planilha) que chegou com menos de 3 dias do vencimento.
function documentacaoAtrasada(c) {
  return !!c.docsRecebidosEm && diasEntre(c.docsRecebidosEm, c.vencimento) < 3;
}

function badgeSituacao(sit) {
  const mapa = {
    Paga: ["verde", "circle-check"], Recebida: ["verde", "circle-check"],
    Vencida: ["vermelho", "triangle-alert"], "Vence hoje": ["ambar", "calendar-clock"],
    Parcial: ["azul", "circle-dot"], "A vencer": ["cinza", "clock"],
    Devolvida: ["vermelho", "undo-2"], Cancelada: ["cinza", "ban"], Substituída: ["cinza", "replace"],
    "Pendente de autorização": ["roxo", "shield-alert"],
  };
  const [cor, ic] = mapa[sit] || ["cinza", "clock"];
  return badge(sit, cor, ic);
}

// ---- Contas a receber ----

function liquido(r) { return r.bruto - r.abatimentos; }
function recebido(r) { return soma(r.recebimentos, (x) => (x.tipo === "estorno" ? -x.valor : x.valor)); }
function saldoReceber(r) { return r.cancelado ? 0 : liquido(r) - recebido(r); }
function situacaoReceber(r) {
  if (r.cancelado) return "Cancelada";
  if (saldoReceber(r) <= 0) return "Recebida";
  if (r.vencimento < HOJE) return "Vencida";
  if (r.vencimento === HOJE) return "Vence hoje";
  if (recebido(r) > 0) return "Parcial";
  return "A vencer";
}

// ---- Datas úteis (recorrência) ----

const FERIADOS = ["2026-01-01", "2026-04-03", "2026-04-21", "2026-05-01", "2026-06-04", "2026-09-07", "2026-10-12", "2026-11-02", "2026-11-15", "2026-11-20", "2026-12-25",
  "2027-01-01", "2027-03-26", "2027-04-21", "2027-05-01", "2027-05-27", "2027-09-07", "2027-10-12", "2027-11-02", "2027-11-15", "2027-11-20", "2027-12-25"];
function diaUtil(iso) {
  let d = iso;
  for (;;) {
    const sem = new Date(d + "T12:00:00Z").getUTCDay();
    if (sem !== 0 && sem !== 6 && !FERIADOS.includes(d)) return d;
    d = somarDias(d, 1);
  }
}
// Mesmo dia nos meses seguintes; dia que não existe vira o último dia do mês.
function mesesDepois(iso, n) {
  const [a, m, d] = iso.split("-").map(Number);
  const total = m - 1 + n;
  const ano = a + Math.floor(total / 12), mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${ano}-${String(mes).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
}
function simularSerie(tipo, primeiro, quantidade, valor) {
  return Array.from({ length: quantidade }, (_, i) => {
    let v = valor;
    if (tipo === "Parcelado") {
      const base = Math.floor(valor / quantidade);
      v = i === quantidade - 1 ? valor - base * (quantidade - 1) : base;
    }
    const bruto = mesesDepois(primeiro, i);
    return { n: i + 1, bruto, vencimento: diaUtil(bruto), valor: v };
  });
}

// ---- RPA ----

const ALIQUOTA_INSS = 11; // % em configuração; o teto do INSS é a pendência N3
function liquidoRpa(bruto) { return bruto - Math.round((bruto * ALIQUOTA_INSS) / 100); }

// ---- Orçamento do projeto (itens do Connect) ----

function orcadoCategoria(projetoId, categoria) {
  const p = achar("projetos", projetoId);
  return soma((p?.itens || []).filter((i) => i.categoria === categoria), (i) => i.valor);
}
function gastoCategoria(projetoId, categoria, ignorarId = null) {
  return soma(
    S.contasPagar.filter((c) => c.tipo === "real" && !c.cancelado && c.categoria === categoria && c.id !== ignorarId && c.autorizacao !== "pendente"),
    (c) => soma(c.rateio.filter((r) => r.projeto === projetoId), (r) => r.valor),
  );
}
function projetoFechado(id) { return achar("projetos", id)?.situacao === "Encerrado"; }

// ---- Período fechado ----

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
function nomeMes(aaaamm) { const [a, m] = aaaamm.split("-"); return `${MESES[Number(m) - 1]}/${a}`; }
function periodoFechado(empresa, data) { return S.fechamentos.find((f) => f.empresa === empresa && f.mes === data.slice(0, 7)); }
function erroPeriodo(empresa, data) {
  return periodoFechado(empresa, data) ? `O período de ${nomeMes(data.slice(0, 7))} está fechado. Só um administrador pode reabrir.` : null;
}

// ---- Auditoria ----

function auditar(alvo, texto) {
  const agora = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
  S.auditoria.unshift({ quando: `${HOJE} ${agora}`, quem: USUARIO, alvo, texto });
}
function historicoDe(alvo) { return S.auditoria.filter((a) => a.alvo === alvo); }
