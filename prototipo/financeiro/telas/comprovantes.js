// Lançamento agrupado em Contas a pagar (entrevistadores que chegam do Connect e incentivos): itens por pessoa, planilha de
// pagamento, PDF de comprovantes, conferência e baixa por item. Tudo parte do próprio lançamento: o financeiro abre as contas
// do dia e os anexos estão ali, sem entrar numa tela de projeto.

const TELA_AGRUPADOS = "Contas a pagar · entrevistadores e incentivos";

ponto("regra-cp-do-connect", TELA_AGRUPADOS, "Mudança de 03/11: o pagamento de entrevistadores chega sozinho em Contas a pagar quando a entrevista é validada no Connect. É um lançamento por projeto e data de pagamento, com um item por pessoa. Não precisa entrar numa tela de projeto para pagar.");
ponto("regra-cp-anexos", TELA_AGRUPADOS, "Planilha de pagamento, PDF de comprovantes e notas ficam anexados no próprio lançamento. Ao confirmar a baixa, o Connect avisa cada entrevistador: \"pagamento realizado\" (acaba a pergunta \"já pagaram?\").");
ponto("regra-cp-abrir-itens", TELA_AGRUPADOS, "O lançamento agrupado (entrevistadores ou incentivos) abre os itens na própria lista, sem ir para outra tela. Clicar no código do projeto abre o relatório do projeto.");
ponto("regra-valor-exato", TELA_AGRUPADOS, "O Pix tem que ser igual ao que falta pagar para a pessoa. Se não fecha, vai para \"Divergentes\" e alguém confere; não existe baixa de resto.");
ponto("regra-fora-projeto", TELA_AGRUPADOS, "Pix para quem não está neste lançamento gera alerta e nunca é baixado sozinho.");
ponto("regra-chave-planilha", TELA_AGRUPADOS, "A chave Pix completa só aparece na planilha de pagamento. Na tela, sempre mascarada. O download fica registrado.");
ponto("regra-nf-entrevistador", TELA_AGRUPADOS, "Mudança de 28/10: a NF do entrevistador sobe no Connect, mas não é mais obrigatória para pagar. Quem está com NF pendente entra na planilha normalmente.");

// ---- Itens do lançamento ----

const chaveDoItem = (i) => i.chave ?? achar("pessoas", i.pessoa)?.chave ?? null;
const chaveCompletaDoItem = (i) => i.chaveCompleta ?? achar("pessoas", i.pessoa)?.chaveCompleta ?? null;
const contaDaEmpresa = (empresa) => (S.contasBancarias.find((b) => b.empresa === empresa && b.ativo) ?? S.contasBancarias[0]).id;
const itensEmAberto = (c) => c.itens.filter((i) => !i.pago);

// O que o Connect mostra ao entrevistador: as entrevistas do item passam a "pagas" (sinal 1) ou voltam a "a pagar" (sinal -1).
function ajustarEntrevistasPagas(c, it, sinal) {
  if (c.origem !== "connect" || !it?.pessoa) return;
  const e = S.entrevistas.find((y) => y.projeto === c.rateio[0]?.projeto && y.pessoa === it.pessoa);
  if (e) e.pagas = Math.max(0, Math.min(e.lancadas, e.pagas + sinal * (it.entrevistas || 0)));
}

// Nota do item: só aviso, nunca bloqueia o pagamento.
function badgeNotaItem(i) {
  if (i.doc === "RPA") return badge("RPA", "azul");
  if (i.doc === "NF") return i.nf ? badge("NF recebida", "verde", "file-check") : `${badge("NF pendente", "ambar", "file-clock")}<span class="sub">só aviso</span>`;
  if (i.doc === "Incentivo") return '<span class="muted pequeno">Sem nota</span>';
  return `<span class="pequeno">${esc(i.doc)}</span>`;
}

function tabelaItensLancamento(c) {
  const somaItens = soma(c.itens, (i) => i.valor);
  return `<div class="card"><div class="tabela-wrap"><table>
    <thead><tr><th>Pessoa</th><th>Chave Pix</th><th>Nota</th><th class="num">Valor</th><th>Situação</th></tr></thead>
    <tbody>${c.itens.map((i) => {
      const chave = chaveDoItem(i);
      const detalhe = i.entrevistas ? plural(i.entrevistas, "entrevista", "entrevistas") : i.dataPesquisa ? `pesquisa em ${fmtDia(i.dataPesquisa)}` : "";
      return `<tr>
        <td><span class="nome">${esc(i.nome)}</span>${detalhe ? `<span class="sub">${detalhe}</span>` : ""}</td>
        <td class="mono">${chave ? esc(chave) : '<span class="ambar">Sem chave cadastrada</span>'}</td>
        <td>${badgeNotaItem(i)}</td>
        <td class="num forte">${brl(i.valor)}</td>
        <td>${i.pago ? `${badge("Pago", "verde", "circle-check")}<span class="sub">${fmtDia(i.pago.data)}${i.pago.avisado ? " · Connect avisou" : ""}</span>` : '<span class="muted pequeno">Em aberto</span>'}</td>
      </tr>`;
    }).join("")}</tbody>
    <tfoot><tr class="total-linha"><td colspan="3">${plural(c.itens.length, "item", "itens")} · ${plural(c.itens.length - itensEmAberto(c).length, "pago", "pagos")}</td><td class="num">${brl(somaItens)}</td><td class="${somaItens === c.valor ? "verde" : "vermelho"}">${somaItens === c.valor ? "Bate com o lançamento" : "Não bate com o lançamento"}</td></tr></tfoot>
  </table></div></div>`;
}

// Linha extra da tabela de Contas a pagar, logo abaixo do lançamento aberto.
function painelLancamento(c, colunas) {
  const aberta = itensEmAberto(c).length;
  const envio = envioAberto(c.id);
  const anexos = c.anexos.filter((a) => !a.excluido);
  const origem = c.origem === "connect"
    ? `Chegou do Connect quando as entrevistas foram validadas. ${regra("regra-cp-do-connect")}`
    : c.origem === "incentivo" ? `Veio da planilha de incentivos. ${regra("regra-incentivo-planilha")}` : "Itens importados da planilha.";
  return `<tr class="linha-expandida"><td colspan="${colunas}">
    <div class="painel-itens">
      <div class="painel-topo">
        <div><strong>Itens do lançamento</strong><span class="pequeno muted"> · ${origem}</span></div>
        <div class="acoes">
          <button class="btn btn-outline btn-sm" data-acao="cp-planilha" data-id="${c.id}" ${aberta ? "" : "disabled"}>${icone("file-spreadsheet")}Baixar planilha de pagamento</button>
          <button class="btn btn-sm" data-acao="cp-enviar-pdf" data-id="${c.id}" ${aberta && !envio && UI.envioLendo !== c.id ? "" : "disabled"}>${icone("file-up")}Enviar PDF de comprovantes</button>
          <button class="btn btn-ghost btn-sm" data-acao="pagar-ver" data-id="${c.id}">${icone("eye")}Ver detalhes</button>
        </div>
      </div>
      <div class="painel-anexos">
        <span class="pequeno muted">Anexos (${anexos.length}) ${regra("regra-cp-anexos")}</span>
        ${anexos.length ? anexos.map((a) => `<span class="badge b-cinza">${icone("paperclip")}${esc(a.nome)}</span>`).join("") : '<span class="pequeno muted">Nenhum ainda. A planilha e o PDF de comprovantes ficam aqui.</span>'}
        <button class="btn btn-ghost btn-sm" data-acao="cp-anexos" data-id="${c.id}">Gerenciar anexos</button>
      </div>
      ${UI.envioLendo === c.id ? `<div class="upload"><div class="icone cor-azul">${icone("loader")}</div><strong>Lendo comprovantes…</strong><p>Não feche esta página até terminar.</p><div class="progresso mt"><span style="width:70%"></span></div></div>` : ""}
      ${envio ? renderConferencia(c, envio) : ""}
      <div class="aviso aviso-azul">${icone("info")}<div><strong>${c.origem === "connect" ? "NF pendente não bloqueia o pagamento" : "Incentivo não tem nota fiscal"}</strong>${c.origem === "connect" ? `A nota sobe no Connect; aqui é só aviso. ${regra("regra-nf-entrevistador")}` : `O item fica "incentivo · sem documento". ${regra("regra-incentivo")}`}</div></div>
      ${tabelaItensLancamento(c)}
      <p class="pequeno muted" style="margin:8px 0 0">${regra("regra-chave-planilha")} ${regra("regra-cp-abrir-itens")}</p>
    </div>
  </td></tr>`;
}

// ---- Planilha de pagamento ----

ACOES["cp-alternar"] = (d) => {
  const abertos = UI.pagar.abertos;
  const id = Number(d.id);
  abertos.has(id) ? abertos.delete(id) : abertos.add(id);
  render();
};

ACOES["cp-anexos"] = (d) => abrirDetalhe(Number(d.id), "documentos");

ACOES["cp-planilha"] = (d) => {
  const c = achar("contasPagar", d.id);
  const abertos = itensEmAberto(c);
  const linhas = abertos.map((i) => [
    i.nome, chaveCompletaDoItem(i) || "SEM CHAVE CADASTRADA", i.doc, i.doc === "NF" ? (i.nf ? `NF ${i.nf.numero}` : "NF pendente (não bloqueia)") : "", i.entrevistas ?? "", centavosParaCampo(i.valor),
  ]);
  const projeto = c.rateio[0] ? codigoProjeto(c.rateio[0].projeto) : "lancamento";
  const nome = `pagamentos-${projeto}-${c.vencimento}.csv`;
  baixarCsv(nome, [["Nome", "Chave Pix", "Recebe por", "Nota fiscal", "Entrevistas a pagar", "Valor (R$)"], ...linhas]);
  if (!c.anexos.some((a) => a.nome === nome && !a.excluido)) c.anexos.push({ id: proximoId(c.anexos), nome, tipo: "Planilha", excluido: false });
  auditar(`pagar:${c.id}`, `Baixou a planilha de pagamento com chave Pix completa (${plural(linhas.length, "pessoa", "pessoas")})`);
  salvar();
  toast(`Planilha baixada com ${plural(linhas.length, "pessoa", "pessoas")} e anexada ao lançamento. O download foi registrado.`);
};

// ---- PDF de comprovantes ----

function envioAberto(lancamentoId) { return S.envios.find((e) => e.lancamento === lancamentoId && e.situacao === "Pronto para conferir"); }

function lerPdfExemplo(c) {
  // No lançamento do PRJ-1804 o PDF de exemplo traz casos de erro; nos outros, um Pix certo para cada item em aberto.
  const usaExemplo = c.origem === "connect" && c.rateio[0]?.projeto === 1804 && S.pdfExemplo.length;
  const brutos = usaExemplo
    ? S.pdfExemplo.map((x) => ({ ...x, item: c.itens.find((i) => i.pessoa === x.pessoa)?.id ?? null }))
    : itensEmAberto(c).map((i, n) => ({ item: i.id, valor: i.valor, data: somarDias(HOJE, -1), pagina: n + 1 }));
  return brutos.map((b) => {
    const it = c.itens.find((i) => i.id === b.item);
    const pessoa = b.pessoa ? achar("pessoas", b.pessoa) : null;
    const chave = it ? chaveDoItem(it) : pessoa?.chave;
    const faltaPagar = it && !it.pago ? it.valor : 0;
    let grupo = "bate", obs = "Valor igual ao que falta pagar";
    if (!it) { grupo = "fora"; obs = "Não está neste lançamento"; }
    else if (!chave) { grupo = "chave"; obs = "Pessoa sem chave Pix cadastrada no Connect"; }
    else if (b.valor !== faltaPagar) {
      grupo = "divergente";
      const dif = b.valor - faltaPagar;
      obs = faltaPagar ? `Falta pagar ${brl(faltaPagar)}; Pix de ${brl(b.valor)} (${brl(Math.abs(dif))} ${dif > 0 ? "a mais" : "a menos"})` : `Esta pessoa já foi paga neste lançamento; Pix de ${brl(b.valor)}`;
    }
    return { pagina: b.pagina, item: it?.id ?? null, nome: it?.nome ?? pessoa?.nome ?? "—", chave: chave || "—", valor: b.valor, data: b.data, grupo, obs, descartado: false };
  });
}

ACOES["cp-enviar-pdf"] = (d) => {
  const id = Number(d.id);
  const c = achar("contasPagar", id);
  UI.pagar.abertos.add(id);
  UI.envioLendo = id;
  render();
  setTimeout(() => {
    UI.envioLendo = null;
    const comprovantes = lerPdfExemplo(c);
    S.envios.push({ id: proximoId(S.envios), projeto: c.rateio[0]?.projeto ?? null, lancamento: id, data: HOJE, situacao: "Pronto para conferir", comprovantes });
    UI.conferencia = { aba: "bate" };
    salvar();
    toast(`${plural(comprovantes.length, "comprovante lido", "comprovantes lidos")}. Confira antes de confirmar a baixa.`);
  }, 1400);
};

ACOES["descartar-comprovante"] = (d) => {
  const comp = envioAberto(Number(d.id)).comprovantes[Number(d.i)];
  comp.descartado = !comp.descartado;
  salvar();
};

ACOES["cancelar-envio"] = (d) => confirmar({
  titulo: "Cancelar envio",
  mensagem: "Os comprovantes lidos neste envio serão apagados e nada será marcado como pago. Você pode enviar o PDF de novo depois.",
  botao: "Cancelar envio",
  perigo: true,
  acao: () => {
    S.envios = S.envios.filter((e) => e !== envioAberto(Number(d.id)));
    salvar();
    toast("Envio cancelado. Nada foi marcado como pago.");
  },
});

ACOES["confirmar-baixa"] = (d) => {
  const c = achar("contasPagar", d.id);
  const envio = envioAberto(c.id);
  const batem = envio.comprovantes.filter((x) => x.grupo === "bate" && !x.descartado);
  const total = soma(batem, (x) => x.valor);
  const erro = batem.map((x) => erroPeriodo(c.empresa, x.data)).find(Boolean);
  if (erro) return toast(erro, true);
  confirmar({
    titulo: "Confirmar baixa",
    mensagem: `Vamos marcar como pagos os itens de ${plural(batem.length, "pessoa", "pessoas")}: ${plural(batem.length, "comprovante", "comprovantes")}, total de <strong>${brl(total)}</strong>. Os comprovantes divergentes, fora do lançamento e sem chave não entram. O PDF fica anexado ao lançamento.${c.origem === "connect" ? " Cada entrevistador é avisado no Connect: pagamento realizado." : ""} Isso não pode ser desfeito.`,
    botao: "Confirmar baixa",
    acao: () => {
      const conta = contaDaEmpresa(c.empresa);
      const projeto = c.rateio[0]?.projeto;
      for (const x of batem) {
        const it = c.itens.find((i) => i.id === x.item);
        it.pago = { data: x.data, avisado: c.origem === "connect" };
        c.baixas.push(baixa(proximoId(c.baixas), x.data, x.valor, conta, 1, { item: it.id, origem: "Comprovante" }));
        ajustarEntrevistasPagas(c, it, 1);
      }
      const nomePdf = `comprovantes-itau-${codigoProjeto(projeto)}-${HOJE}.pdf`;
      c.anexos.push({ id: proximoId(c.anexos), nome: nomePdf, tipo: "Comprovante", excluido: false });
      Object.assign(envio, { situacao: "Confirmado", totalPago: total, fora: envio.comprovantes.filter((x) => x.grupo === "fora").length });
      envio.comprovantes = envio.comprovantes.length;
      auditar(`pagar:${c.id}`, `Baixa por comprovantes: ${plural(batem.length, "item", "itens")}, ${brl(total)}. PDF anexado${c.origem === "connect" ? "; Connect avisou os entrevistadores" : ""}`);
      salvar();
      toast(`Baixa feita: ${plural(batem.length, "item pago", "itens pagos")} (${brl(total)}).${c.origem === "connect" ? " Entrevistadores avisados no Connect: pagamento realizado." : " Comprovantes anexados ao lançamento."}`);
    },
  });
};

function renderConferencia(c, envio) {
  const ui = (UI.conferencia ??= { aba: "bate" });
  const grupos = [
    { id: "bate", rotulo: "Batem" },
    { id: "divergente", rotulo: "Divergentes" },
    { id: "fora", rotulo: "Fora do lançamento" },
    { id: "chave", rotulo: "Chave não cadastrada" },
    { id: "descartado", rotulo: "Descartados" },
  ];
  const doGrupo = (g) => envio.comprovantes.map((x, i) => ({ ...x, i })).filter((x) => (g === "descartado" ? x.descartado : !x.descartado && x.grupo === g));
  const linhas = doGrupo(ui.aba);
  const alerta = envio.comprovantes.filter((x) => !x.descartado && (x.grupo === "fora" || x.grupo === "chave"));
  const batem = doGrupo("bate");

  return `
    <div class="card secao">
      <div class="card-titulo">
        <div><h2>Conferência do envio de ${fmtDia(envio.data)}</h2><p>${plural(envio.comprovantes.length, "comprovante lido", "comprovantes lidos")} · ${badge("Pronto para conferir", "azul")}</p></div>
        <div class="acoes">
          <button class="btn btn-outline" data-acao="cancelar-envio" data-id="${c.id}">Cancelar envio</button>
          <button class="btn btn-verde" data-acao="confirmar-baixa" data-id="${c.id}" ${batem.length ? "" : "disabled"}>${icone("check")}Confirmar baixa (${batem.length})</button>
        </div>
      </div>
      <div style="padding:16px 16px 0">
        ${alerta.length ? `<div class="aviso aviso-ambar">${icone("triangle-alert")}<div>
          <strong>${plural(alerta.length, "comprovante precisa", "comprovantes precisam")} de atenção</strong>
          ${alerta.map((x) => `${esc(x.nome)}: ${esc(x.obs.charAt(0).toLowerCase() + x.obs.slice(1))}`).join(" · ")}.<br>Esses pagamentos não entram na baixa. Confira se o Pix foi para a pessoa certa. ${regra("regra-fora-projeto")}
        </div></div>` : ""}
      </div>
      <div class="barra">${abas("conferencia", grupos.map((g) => ({ ...g, n: doGrupo(g.id).length })), ui.aba)} ${regra("regra-valor-exato")}</div>
      ${linhas.length ? `<div class="tabela-wrap"><table>
        <thead><tr><th>Página</th><th>Nome</th><th>Chave Pix</th><th class="num">Valor</th><th>Data</th><th>Observação</th><th></th></tr></thead>
        <tbody>${linhas.map((x) => `
          <tr>
            <td>${x.pagina}</td>
            <td class="nome">${esc(x.nome)}</td>
            <td class="mono">${esc(x.chave)}</td>
            <td class="num forte">${brl(x.valor)}</td>
            <td>${fmtDia(x.data)}</td>
            <td class="${x.grupo === "bate" ? "verde" : "ambar"}">${esc(x.obs)}</td>
            <td class="num"><button class="btn btn-ghost btn-sm" data-acao="descartar-comprovante" data-id="${c.id}" data-i="${x.i}">${x.descartado ? "Restaurar" : "Descartar"}</button></td>
          </tr>`).join("")}</tbody>
      </table></div>` : `<p class="vazio">${{ bate: "Nenhum comprovante bate.", divergente: "Nenhuma divergência.", fora: "Ninguém fora do lançamento.", chave: "Todas as chaves Pix estão cadastradas.", descartado: "Nenhum comprovante descartado." }[ui.aba]}</p>`}
    </div>`;
}
