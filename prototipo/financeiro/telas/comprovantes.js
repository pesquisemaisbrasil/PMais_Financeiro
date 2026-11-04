// Lançamento agrupado em Contas a pagar (planilhas de folha e incentivos, e pagamentos de entrevistadores que chegam do Connect):
// itens por pessoa, planilha de pagamento, PDF de comprovantes, conferência e baixa por item. Tudo parte do próprio lançamento:
// o financeiro abre as contas do dia e os anexos estão ali, sem entrar numa tela de projeto.
//
// O painel aberto na lista é só um resumo (se quiser mais detalhe, clica). A conferência do PDF abre num diálogo próprio.

const TELA_AGRUPADOS = "Contas a pagar · lançamentos agrupados";

ponto("regra-cp-do-connect", TELA_AGRUPADOS, "Mudança de 03/11: o pagamento de entrevistadores chega sozinho em Contas a pagar quando a entrevista é validada no Connect. É um lançamento por projeto e data de pagamento, com um item por pessoa. Não precisa entrar numa tela de projeto para pagar.");
ponto("regra-cp-anexos", TELA_AGRUPADOS, "Planilha de pagamento, PDF de comprovantes e notas ficam anexados no próprio lançamento. Ao confirmar a baixa, o Connect avisa cada entrevistador: \"pagamento realizado\" (acaba a pergunta \"já pagaram?\").");
ponto("regra-cp-abrir-itens", TELA_AGRUPADOS, "O lançamento agrupado (planilha, incentivo ou entrevistadores do Connect) abre os itens na própria lista, sem ir para outra tela. Clicar no código do projeto abre o relatório do projeto.");
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

// Nota do item, em uma etiqueta só: é aviso, nunca bloqueia o pagamento.
function badgeNotaItem(i) {
  if (i.doc === "RPA") return badge("RPA", "azul");
  if (i.doc === "NF") return i.nf ? badge("NF recebida", "verde", "file-check") : `<span title="Só aviso: não bloqueia o pagamento">${badge("NF pendente", "ambar", "file-clock")}</span>`;
  if (i.doc === "Incentivo") return '<span class="muted pequeno">Sem nota</span>';
  return `<span class="pequeno">${esc(i.doc)}</span>`;
}

// ---- Painel do lançamento, aberto na lista de Contas a pagar ----

const SITUACOES_ITEM = [["todos", "Todos"], ["abertos", "Em aberto"], ["pagos", "Pagos"]];

ACOES["cp-item-situacao"] = (d) => { UI[`itens-${d.id}`] = { ...UI[`itens-${d.id}`], situacao: d.situacao }; render(); };
ACOES["cp-historico"] = (d) => abrirDetalhe(Number(d.id), "historico");

// Um aviso curto, numa linha: ícone + texto + "Regra a validar".
const notaLinha = (ic, texto, regraId, alerta = false) => `<span class="pi-nota ${alerta ? "alerta" : ""}">${icone(ic)}<span>${texto}</span>${regraId ? regra(regraId) : ""}</span>`;

// Linha extra da tabela de Contas a pagar, logo abaixo do lançamento aberto.
function painelLancamento(c, colunas) {
  const total = c.itens.length;
  const abertos = itensEmAberto(c);
  const pagos = total - abertos.length;
  const somaItens = soma(c.itens, (i) => i.valor);
  const temNota = c.itens.some((i) => i.doc === "NF");
  const nfPendentes = c.itens.filter((i) => i.doc === "NF" && !i.nf).length;
  const semChave = c.itens.filter((i) => !chaveDoItem(i)).length;
  const anexos = c.anexos.filter((a) => !a.excluido);
  const envio = envioAberto(c.id);
  const lendo = UI.envioLendo === c.id;
  const chaveBusca = `itens-${c.id}`;
  const ui = (UI[chaveBusca] ??= { busca: "", situacao: "todos" });
  const termo = (ui.busca || "").trim().toLowerCase();
  const situacao = ui.situacao || "todos";
  const visiveis = c.itens.filter((i) => (situacao === "todos" || (situacao === "pagos") === !!i.pago) && (!termo || i.nome.toLowerCase().includes(termo)));
  const contagem = { todos: total, abertos: abertos.length, pagos };

  const origem = c.origem === "connect"
    ? notaLinha("link", "Chegou do Connect quando as entrevistas foram validadas.", "regra-cp-do-connect")
    : c.origem === "incentivo" ? notaLinha("calendar-range", "Veio da planilha de incentivos.", "regra-incentivo-planilha")
      : notaLinha("file-spreadsheet", "Itens importados da planilha.", "regra-lancamento-agrupado");
  const nota = c.origem === "incentivo" ? notaLinha("info", "Incentivo não tem nota fiscal.", "regra-incentivo")
    : notaLinha("info", "NF pendente não bloqueia o pagamento.", c.origem === "connect" ? "regra-nf-entrevistador" : "regra-nf-nao-bloqueia");
  const avisos = [
    origem, nota,
    notaLinha("key-round", "Chave Pix mascarada; a completa só na planilha baixada.", "regra-chave-planilha"),
    semChave ? notaLinha("triangle-alert", `${plural(semChave, "pessoa sem chave Pix cadastrada", "pessoas sem chave Pix cadastrada")}.`, null, true) : "",
    documentacaoAtrasada(c) ? notaLinha("calendar-clock", "Documentação atrasada.", "regra-doc-atrasada", true) : "",
    somaItens !== c.valor ? notaLinha("triangle-alert", `Os itens somam ${brl(somaItens)}, o lançamento é de ${brl(c.valor)}.`, null, true) : "",
  ].join("");

  const nConferir = envio ? envio.comprovantes.filter((x) => !x.descartado) : [];
  const nAtencao = nConferir.filter((x) => x.grupo !== "bate").length;

  return `<tr class="linha-expandida"><td colspan="${colunas}">
    <div class="painel-itens">
      <div class="pi-resumo">
        <div class="pi-stats">
          <div class="pi-stat"><span class="v">${total}</span><span class="r">${total === 1 ? "pessoa" : "pessoas"}</span></div>
          <div class="pi-stat"><span class="v">${pagos}<small> de ${total}</small></span><span class="r">pagos · ${abertos.length} em aberto</span></div>
          <div class="pi-stat"><span class="v">${brl(c.valor)}</span><span class="r">total${abertos.length ? ` · ${brl(soma(abertos, (i) => i.valor))} em aberto` : " · tudo pago"}</span></div>
          ${temNota ? `<div class="pi-stat"><span class="v ${nfPendentes ? "ambar" : ""}">${nfPendentes}</span><span class="r">NF pendente</span></div>` : ""}
          <div class="pi-stat"><span class="v">${anexos.length}</span><span class="r">${anexos.length === 1 ? "anexo" : "anexos"}</span></div>
        </div>
        <div class="pi-acoes">
          <button class="btn btn-outline btn-sm" data-acao="cp-planilha" data-id="${c.id}" ${abertos.length ? "" : "disabled"}>${icone("file-spreadsheet")}Baixar planilha</button>
          <button class="btn btn-sm" data-acao="cp-enviar-pdf" data-id="${c.id}" ${abertos.length && !envio && !lendo ? "" : "disabled"}>${icone("file-up")}Enviar PDF de comprovantes</button>
          <details class="menu-mais">
            <summary class="btn btn-ghost btn-sm" aria-label="Mais ações do lançamento">${icone("ellipsis")}Mais</summary>
            <div class="menu-pop">
              <button type="button" data-acao="pagar-ver" data-id="${c.id}">${icone("eye")}Ver detalhes</button>
              <button type="button" data-acao="cp-anexos" data-id="${c.id}">${icone("paperclip")}Gerenciar anexos</button>
              <button type="button" data-acao="cp-historico" data-id="${c.id}">${icone("history")}Histórico</button>
            </div>
          </details>
        </div>
      </div>

      <div class="pi-notas">${avisos}</div>

      <div class="pi-anexos">
        <span class="pi-rotulo">${icone("paperclip")}Anexos ${regra("regra-cp-anexos")}</span>
        ${anexos.length ? anexos.map((a) => `<button type="button" class="chip-anexo" data-acao="cp-anexos" data-id="${c.id}" title="Abrir em Documentos">${icone(a.tipo === "Planilha" ? "file-spreadsheet" : "file-text")}<span>${esc(a.nome)}</span></button>`).join("") : '<span class="pequeno muted">Nenhum ainda. A planilha e o PDF de comprovantes ficam aqui.</span>'}
      </div>

      ${lendo ? `<div class="pi-envio"><span class="lucide-wrap">${icone("loader")}</span><div><strong>Lendo comprovantes…</strong><span class="pequeno muted"> Não feche esta página até terminar.</span></div><div class="progresso" style="flex:1;max-width:220px"><span style="width:70%"></span></div></div>` : ""}
      ${envio ? `<div class="pi-envio pronto">${icone("file-check")}<div><strong>PDF de ${fmtDia(envio.data)} lido: ${plural(nConferir.length, "comprovante", "comprovantes")}</strong><span class="pequeno"> · ${nConferir.length - nAtencao} batem${nAtencao ? ` · <span class="ambar forte">${nAtencao} precisam de atenção</span>` : ""}</span></div><button class="btn btn-sm" data-acao="cp-conferir" data-id="${c.id}">Conferir e dar baixa</button></div>` : ""}

      <div class="pi-lista">
        <div class="pi-barra">
          ${campoBusca(chaveBusca, ui.busca || "", "Buscar pessoa neste lançamento…")}
          <div class="seg" role="group" aria-label="Situação dos itens">${SITUACOES_ITEM.map(([k, r]) => `<button type="button" class="${situacao === k ? "ativa" : ""}" aria-pressed="${situacao === k}" data-acao="cp-item-situacao" data-id="${c.id}" data-situacao="${k}">${r}<span class="n">${contagem[k]}</span></button>`).join("")}</div>
          <span class="pequeno muted pi-conta">${visiveis.length === total ? plural(total, "item", "itens") : `${visiveis.length} de ${total}`} · ${brl(soma(visiveis, (i) => i.valor))}</span>
        </div>
        <div class="pi-scroll">
          <table class="pi-tabela">
            <thead><tr><th>Pessoa</th><th class="col-chave">Chave Pix</th><th>Nota</th><th class="num">Valor</th><th>Situação</th></tr></thead>
            <tbody>${visiveis.length ? visiveis.map((i) => {
              const chave = chaveDoItem(i);
              const detalhe = i.entrevistas ? plural(i.entrevistas, "entrevista", "entrevistas") : i.dataPesquisa ? `pesquisa em ${fmtDia(i.dataPesquisa)}` : "";
              return `<tr>
                <td><span class="nome">${esc(i.nome)}</span>${detalhe ? `<span class="pi-det">${detalhe}</span>` : ""}</td>
                <td class="mono col-chave">${chave ? esc(chave) : '<span class="ambar">Sem chave cadastrada</span>'}</td>
                <td>${badgeNotaItem(i)}</td>
                <td class="num forte">${brl(i.valor)}</td>
                <td>${i.pago ? `<span class="verde forte pequeno">${icone("circle-check")}Pago ${fmtDia(i.pago.data).slice(0, 5)}</span>${i.pago.avisado ? '<span class="pi-det">Connect avisou</span>' : ""}` : '<span class="muted pequeno">Em aberto</span>'}</td>
              </tr>`;
            }).join("") : `<tr><td colspan="5" class="vazio">${termo ? "Ninguém com esse nome neste lançamento." : "Nenhum item nesta situação."}</td></tr>`}</tbody>
          </table>
        </div>
      </div>
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
    if (rotaAtual().rota === "pagar" && !dialogo().open) abrirConferencia(c);
  }, 1400);
};

ACOES["descartar-comprovante"] = (d) => {
  const c = achar("contasPagar", d.id);
  const comp = envioAberto(c.id).comprovantes[Number(d.i)];
  comp.descartado = !comp.descartado;
  salvar();
  abrirConferencia(c);
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

// Passo de confirmação, dentro do mesmo diálogo: "Voltar" volta para a conferência.
ACOES["confirmar-baixa"] = (d) => {
  const c = achar("contasPagar", d.id);
  const envio = envioAberto(c.id);
  const batem = envio.comprovantes.filter((x) => x.grupo === "bate" && !x.descartado);
  const total = soma(batem, (x) => x.valor);
  const erro = batem.map((x) => erroPeriodo(c.empresa, x.data)).find(Boolean);
  if (erro) return toast(erro, true);
  abrirDialogo({
    titulo: "Confirmar baixa",
    corpo: `<p style="margin:0">Vamos marcar como pagos os itens de ${plural(batem.length, "pessoa", "pessoas")}: ${plural(batem.length, "comprovante", "comprovantes")}, total de <strong>${brl(total)}</strong>. Os comprovantes divergentes, fora do lançamento e sem chave não entram. O PDF fica anexado ao lançamento.${c.origem === "connect" ? " Cada entrevistador é avisado no Connect: pagamento realizado." : ""} Isso não pode ser desfeito.</p>`,
    rodape: `<button type="button" class="btn btn-outline" data-acao="cp-conferir" data-id="${c.id}">Voltar à conferência</button><button type="button" class="btn btn-verde" data-acao="cp-baixa-ok" data-id="${c.id}">${icone("check")}Confirmar baixa</button>`,
  });
};

ACOES["cp-baixa-ok"] = (d) => {
  const c = achar("contasPagar", d.id);
  const envio = envioAberto(c.id);
  const batem = envio.comprovantes.filter((x) => x.grupo === "bate" && !x.descartado);
  const total = soma(batem, (x) => x.valor);
  fecharDialogo();
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
};

// ---- Conferência do PDF (diálogo próprio) ----

const GRUPOS_CONFERENCIA = [
  { id: "bate", rotulo: "Batem", cor: "verde", ic: "circle-check", dica: "Valor igual ao que falta pagar. Estes entram na baixa.", regra: "regra-valor-exato" },
  { id: "divergente", rotulo: "Divergentes", cor: "ambar", ic: "triangle-alert", dica: "Valor diferente do que falta pagar. Não entram na baixa: confira com o banco.", regra: "regra-valor-exato" },
  { id: "fora", rotulo: "Fora do lançamento", cor: "vermelho", ic: "circle-x", dica: "Pix para quem não está neste lançamento. Nunca é baixado sozinho; confira se foi para a pessoa certa.", regra: "regra-fora-projeto" },
  { id: "chave", rotulo: "Sem chave", cor: "ambar", ic: "key-round", dica: "Pessoa sem chave Pix cadastrada no Connect. Não entra na baixa.", regra: null },
  { id: "descartado", rotulo: "Descartados", cor: "cinza", ic: "ban", dica: "Você tirou estes da conferência. Dá para restaurar.", regra: null },
];

ACOES["cp-conferir"] = (d) => abrirConferencia(achar("contasPagar", d.id));
ACOES["cp-conf-aba"] = (d) => { (UI.conferencia ??= {}).aba = d.aba; abrirConferencia(achar("contasPagar", d.id)); };

function abrirConferencia(c) {
  const envio = envioAberto(c.id);
  if (!envio) return fecharDialogo();
  const ui = (UI.conferencia ??= { aba: "bate" });
  const doGrupo = (g) => envio.comprovantes.map((x, i) => ({ ...x, i })).filter((x) => (g === "descartado" ? x.descartado : !x.descartado && x.grupo === g));
  const batem = doGrupo("bate");
  const grupoAtivo = GRUPOS_CONFERENCIA.find((g) => g.id === ui.aba) ?? GRUPOS_CONFERENCIA[0];
  const linhas = doGrupo(grupoAtivo.id);
  const atencao = GRUPOS_CONFERENCIA.slice(1, 4).reduce((n, g) => n + doGrupo(g.id).length, 0);
  abrirDialogo({
    titulo: "Conferir comprovantes",
    descricao: `${esc(c.descricao)} · PDF lido em ${fmtDia(envio.data)} · ${plural(envio.comprovantes.length, "comprovante", "comprovantes")}`,
    largo: true,
    corpo: `
      <div class="conf-tiles" role="tablist">${GRUPOS_CONFERENCIA.map((g) => {
        const l = doGrupo(g.id);
        return `<button type="button" role="tab" aria-selected="${g.id === grupoAtivo.id}" class="conf-tile t-${g.cor} ${g.id === grupoAtivo.id ? "ativa" : ""}" data-acao="cp-conf-aba" data-id="${c.id}" data-aba="${g.id}">
          <span class="r">${icone(g.ic)}${g.rotulo}</span><span class="v">${l.length}</span><span class="s">${l.length ? brl(soma(l, (x) => x.valor)) : "—"}</span></button>`;
      }).join("")}</div>
      <div class="pi-notas conf-dica">
        ${notaLinha(grupoAtivo.ic, grupoAtivo.dica, grupoAtivo.regra, grupoAtivo.cor === "vermelho" || grupoAtivo.cor === "ambar")}
        ${atencao && grupoAtivo.id === "bate" ? notaLinha("triangle-alert", `${plural(atencao, "comprovante precisa", "comprovantes precisam")} de atenção e não entra na baixa.`, null, true) : ""}
      </div>
      ${linhas.length ? `<div class="rolagem conf-tabela"><table class="pi-tabela">
        <thead><tr><th>Pág.</th><th>Nome</th><th class="col-chave">Chave Pix</th><th class="num">Valor</th><th>Data</th><th>Observação</th><th></th></tr></thead>
        <tbody>${linhas.map((x) => `<tr>
          <td>${x.pagina}</td>
          <td class="nome">${esc(x.nome)}</td>
          <td class="mono col-chave">${esc(x.chave)}</td>
          <td class="num forte">${brl(x.valor)}</td>
          <td>${fmtDia(x.data)}</td>
          <td class="${x.grupo === "bate" ? "verde" : "ambar"} pequeno">${esc(x.obs)}</td>
          <td class="num"><button type="button" class="btn btn-ghost btn-sm" data-acao="descartar-comprovante" data-id="${c.id}" data-i="${x.i}">${x.descartado ? "Restaurar" : "Descartar"}</button></td>
        </tr>`).join("")}</tbody></table></div>`
        : `<p class="vazio">${{ bate: "Nenhum comprovante bate.", divergente: "Nenhuma divergência.", fora: "Ninguém fora do lançamento.", chave: "Todas as chaves Pix estão cadastradas.", descartado: "Nenhum comprovante descartado." }[grupoAtivo.id]}</p>`}`,
    rodape: `
      <button type="button" class="btn btn-ghost" data-acao="cancelar-envio" data-id="${c.id}">Cancelar envio</button>
      <span style="flex:1"></span>
      <button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Conferir depois</button>
      <button type="button" class="btn btn-verde" data-acao="confirmar-baixa" data-id="${c.id}" ${batem.length ? "" : "disabled"}>${icone("check")}Confirmar baixa (${batem.length} · ${brl(soma(batem, (x) => x.valor))})</button>`,
  });
}
