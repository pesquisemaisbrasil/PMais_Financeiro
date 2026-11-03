// Pagamento de entrevistadores: o que já roda no Connect (planilha, PDF de comprovantes, baixa), trazido para o Financeiro.

ponto("tela-entrevistadores", "Pagamento de entrevistadores", "A lista de projetos e a tela do projeto são as mesmas do Connect: planilha de pagamentos, envio do PDF de comprovantes e baixa.");
ponto("regra-valor-exato", "Pagamento de entrevistadores", "O Pix tem que ser igual ao que falta pagar para a pessoa. Se não fecha, vai para \"Divergentes\" e alguém confere; não existe baixa de resto.");
ponto("regra-fora-projeto", "Pagamento de entrevistadores", "Pix para quem não está no projeto gera alerta e nunca é baixado sozinho.");
ponto("regra-pdf-nao-guardado", "Pagamento de entrevistadores", "O PDF de comprovantes não fica guardado: o sistema lê só valor, data, chave (mascarada) e nome.");
ponto("regra-chave-planilha", "Pagamento de entrevistadores", "A chave Pix completa só aparece na planilha de pagamentos. Na tela, sempre mascarada. O download fica registrado.");
ponto("regra-nf-entrevistador", "Pagamento de entrevistadores", "Mudança de 28/10: a NF do entrevistador sobe no Connect, mas não é mais obrigatória para pagar. Quem está com NF pendente entra na planilha normalmente.");

function entrevistasDoProjeto(id) { return S.entrevistas.filter((e) => e.projeto === id); }
function lancadoProjeto(id) { return soma(entrevistasDoProjeto(id), (e) => e.lancadas * e.valor); }
function pagoProjeto(id) { return soma(entrevistasDoProjeto(id), (e) => e.pagas * e.valor); }
function aPagarPessoa(e) { return (e.lancadas - e.pagas) * e.valor; }

function badgeProjeto(sit) {
  return badge(sit, { Ativo: "verde", Pausado: "ambar", Encerrado: "cinza" }[sit] || "cinza");
}
function badgeNfConnect(nf, modelo) {
  if (modelo === "RPA") return badge("RPA", "azul");
  if (nf === "Recebida") return badge("NF recebida", "verde", "file-check");
  if (nf === "Pendente") return badge("NF pendente", "ambar", "file-clock");
  return '<span class="muted pequeno">—</span>';
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

// ---- Envio do PDF de comprovantes ----

function lerPdfExemplo(projetoId) {
  // PRJ-1804 usa o PDF de exemplo com casos de erro; nos outros, um Pix certo para cada pessoa com valor a pagar.
  const brutos = projetoId === 1804
    ? S.pdfExemplo
    : entrevistasDoProjeto(projetoId).filter((e) => aPagarPessoa(e) > 0).map((e, i) => ({ pessoa: e.pessoa, valor: aPagarPessoa(e), data: somarDias(HOJE, -1), pagina: i + 1 }));
  return brutos.map((c) => {
    const pessoa = achar("pessoas", c.pessoa);
    const e = entrevistasDoProjeto(projetoId).find((x) => x.pessoa === c.pessoa);
    let grupo = "bate", obs = "Valor igual ao que falta pagar";
    if (!e) { grupo = "fora"; obs = "Não está neste projeto"; }
    else if (!pessoa.chave) { grupo = "chave"; obs = "Pessoa sem chave Pix cadastrada no Connect"; }
    else if (c.valor !== aPagarPessoa(e)) {
      grupo = "divergente";
      const dif = c.valor - aPagarPessoa(e);
      obs = `Falta pagar ${brl(aPagarPessoa(e))}; Pix de ${brl(c.valor)} (${brl(Math.abs(dif))} ${dif > 0 ? "a mais" : "a menos"})`;
    }
    return { ...c, nome: pessoa.nome, chave: pessoa.chave || "—", grupo, obs, descartado: false };
  });
}

function envioAberto(projetoId) { return S.envios.find((e) => e.projeto === projetoId && e.situacao === "Pronto para conferir"); }

ACOES["enviar-pdf"] = (d) => {
  const id = Number(d.projeto);
  UI.envioLendo = id;
  render();
  setTimeout(() => {
    UI.envioLendo = null;
    const comprovantes = lerPdfExemplo(id);
    S.envios.push({ id: proximoId(S.envios), projeto: id, data: HOJE, situacao: "Pronto para conferir", comprovantes });
    UI.conferencia = { aba: "bate" };
    salvar();
    toast(`${plural(comprovantes.length, "comprovante lido", "comprovantes lidos")}. Confira antes de confirmar a baixa.`);
  }, 1400);
};

ACOES["descartar-comprovante"] = (d) => {
  const c = envioAberto(Number(d.projeto)).comprovantes[Number(d.i)];
  c.descartado = !c.descartado;
  salvar();
};

ACOES["cancelar-envio"] = (d) => confirmar({
  titulo: "Cancelar envio",
  mensagem: "Os comprovantes lidos neste envio serão apagados e nada será marcado como pago. Você pode enviar o PDF de novo depois.",
  botao: "Cancelar envio",
  perigo: true,
  acao: () => {
    S.envios = S.envios.filter((e) => e !== envioAberto(Number(d.projeto)));
    salvar();
    toast("Envio cancelado. Nada foi marcado como pago.");
  },
});

ACOES["confirmar-baixa"] = (d) => {
  const id = Number(d.projeto);
  const envio = envioAberto(id);
  const batem = envio.comprovantes.filter((c) => c.grupo === "bate" && !c.descartado);
  const total = soma(batem, (c) => c.valor);
  confirmar({
    titulo: "Confirmar baixa",
    mensagem: `Vamos marcar como pagas as entrevistas de ${plural(batem.length, "pessoa", "pessoas")}: ${plural(batem.length, "comprovante", "comprovantes")}, total de <strong>${brl(total)}</strong>. Os comprovantes divergentes, fora do projeto e sem chave não entram. Isso não pode ser desfeito.`,
    botao: "Confirmar baixa",
    acao: () => {
      let entrevistas = 0;
      for (const c of batem) {
        const e = entrevistasDoProjeto(id).find((x) => x.pessoa === c.pessoa);
        entrevistas += e.lancadas - e.pagas;
        e.pagas = e.lancadas;
        // Vira um pagamento que a conferência do banco casa com o Pix do extrato.
        S.pagamentosCampo.push({ id: proximoId(S.pagamentosCampo), pessoa: c.pessoa, projeto: id, valor: c.valor, data: c.data, conta: 1 });
      }
      Object.assign(envio, { situacao: "Confirmado", totalPago: total, fora: envio.comprovantes.filter((c) => c.grupo === "fora").length });
      envio.comprovantes = envio.comprovantes.length;
      auditar(`projeto:${id}`, `Baixa por comprovantes: ${entrevistas} entrevistas, ${brl(total)}`);
      salvar();
      toast(`Baixa feita: ${plural(entrevistas, "entrevista marcada", "entrevistas marcadas")} como pagas (${brl(total)}, ${plural(batem.length, "pessoa", "pessoas")}).`);
    },
  });
};

ACOES["baixar-planilha"] = (d) => {
  const id = Number(d.projeto);
  const linhas = entrevistasDoProjeto(id).filter((e) => aPagarPessoa(e) > 0).map((e) => {
    const p = achar("pessoas", e.pessoa);
    return [p.nome, p.chaveCompleta || "SEM CHAVE CADASTRADA", p.modelo, e.nf === "Pendente" ? "NF pendente (não bloqueia)" : e.nf || "", e.lancadas - e.pagas, centavosParaCampo(aPagarPessoa(e))];
  });
  baixarCsv(`pagamentos-${codigoProjeto(id)}.csv`, [["Nome", "Chave Pix", "Recebe por", "Nota fiscal", "Entrevistas a pagar", "Valor (R$)"], ...linhas]);
  auditar(`projeto:${id}`, `Baixou a planilha de pagamentos com chave Pix completa (${linhas.length} pessoas)`);
  salvar();
  toast(`Planilha baixada com ${plural(linhas.length, "pessoa", "pessoas")}. O download foi registrado.`);
};

// ---- Telas ----

function renderListaProjetos() {
  const ui = (UI.projetos ??= { busca: "" });
  const termo = (ui.busca || "").trim().toLowerCase();
  const ordem = { Ativo: 0, Pausado: 1, Encerrado: 2 };
  const lista = S.projetos
    .filter((p) => !termo || p.titulo.toLowerCase().includes(termo) || codigoProjeto(p.id).toLowerCase().includes(termo))
    .sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || b.id - a.id);
  const aPagar = soma(S.entrevistas, aPagarPessoa);

  return `
    ${cabecalho({ titulo: "Pagamento de entrevistadores", icone: "users", tela: "tela-entrevistadores",
      subtitulo: "Escolha um projeto para ver o que já foi pago, o que falta pagar e baixar a planilha de pagamentos." })}
    <div class="kpis">
      ${kpi({ rotulo: "A pagar no total", valor: brl(aPagar), detalhe: `${plural(new Set(S.entrevistas.filter((e) => aPagarPessoa(e) > 0).map((e) => e.pessoa)).size, "pessoa", "pessoas")}`, ic: "clock", cor: "cor-ambar" })}
      ${kpi({ rotulo: "Pago no total", valor: brl(soma(S.entrevistas, (e) => e.pagas * e.valor)), ic: "circle-check", cor: "cor-verde" })}
      ${kpi({ rotulo: "Envios para conferir", valor: String(S.envios.filter((e) => e.situacao === "Pronto para conferir").length), ic: "file-check", cor: "cor-roxo" })}
      ${kpi({ rotulo: "NF pendente no Connect", valor: String(S.entrevistas.filter((e) => e.nf === "Pendente" && aPagarPessoa(e) > 0).length), detalhe: "aviso, não bloqueia", ic: "file-clock", cor: "cor-ambar" })}
    </div>
    <div class="mb">${campoBusca("projetos", ui.busca || "", "Buscar projeto pelo nome ou código…")}</div>
    ${lista.length ? `<div class="grade grade-3">${lista.map((p) => {
      const falta = soma(entrevistasDoProjeto(p.id), aPagarPessoa);
      const conferir = envioAberto(p.id);
      return `<div class="card projeto">
        <div class="topo">
          <div style="min-width:0"><div class="codigo">${codigoProjeto(p.id)}</div><h3 title="${esc(p.titulo)}">${esc(p.titulo)}</h3></div>
          ${badgeProjeto(p.situacao)}
        </div>
        ${usoOrcamento(p)}
        <div class="flex entre pequeno">
          <span>${falta ? `<span class="ambar forte">${brl(falta)}</span> a pagar` : '<span class="verde forte">Tudo pago</span>'}</span>
          ${conferir ? badge("Envio para conferir", "roxo", "file-check") : ""}
        </div>
        <a class="btn btn-outline w-full" href="#/entrevistadores/${p.id}">${icone("wallet")}Abrir Financeiro</a>
      </div>`;
    }).join("")}</div>` : `<p class="vazio">${termo ? "Nenhum projeto encontrado com essa busca." : "Nenhum projeto ainda."}</p>`}`;
}

function renderConferencia(p, envio) {
  const ui = (UI.conferencia ??= { aba: "bate" });
  const grupos = [
    { id: "bate", rotulo: "Batem" },
    { id: "divergente", rotulo: "Divergentes" },
    { id: "fora", rotulo: "Fora do projeto" },
    { id: "chave", rotulo: "Chave não cadastrada" },
    { id: "descartado", rotulo: "Descartados" },
  ];
  const doGrupo = (g) => envio.comprovantes.map((c, i) => ({ ...c, i })).filter((c) => (g === "descartado" ? c.descartado : !c.descartado && c.grupo === g));
  const linhas = doGrupo(ui.aba);
  const alerta = envio.comprovantes.filter((c) => !c.descartado && (c.grupo === "fora" || c.grupo === "chave"));
  const batem = doGrupo("bate");

  return `
    <div class="card secao">
      <div class="card-titulo">
        <div><h2>Conferência do envio de ${fmtDia(envio.data)}</h2><p>${plural(envio.comprovantes.length, "comprovante lido", "comprovantes lidos")} · ${badge("Pronto para conferir", "azul")}</p></div>
        <div class="acoes">
          <button class="btn btn-outline" data-acao="cancelar-envio" data-projeto="${p.id}">Cancelar envio</button>
          <button class="btn btn-verde" data-acao="confirmar-baixa" data-projeto="${p.id}" ${batem.length ? "" : "disabled"}>${icone("check")}Confirmar baixa (${batem.length})</button>
        </div>
      </div>
      <div style="padding:16px 16px 0">
        ${alerta.length ? `<div class="aviso aviso-ambar">${icone("triangle-alert")}<div>
          <strong>${plural(alerta.length, "comprovante precisa", "comprovantes precisam")} de atenção</strong>
          ${alerta.map((c) => `${esc(c.nome)}: ${esc(c.obs.charAt(0).toLowerCase() + c.obs.slice(1))}`).join(" · ")}.<br>Esses pagamentos não entram na baixa. Confira se o Pix foi para a pessoa certa. ${regra("regra-fora-projeto")}
        </div></div>` : ""}
      </div>
      <div class="barra">${abas("conferencia", grupos.map((g) => ({ ...g, n: doGrupo(g.id).length })), ui.aba)} ${regra("regra-valor-exato")}</div>
      ${linhas.length ? `<div class="tabela-wrap"><table>
        <thead><tr><th>Página</th><th>Nome</th><th>Chave Pix</th><th class="num">Valor</th><th>Data</th><th>Observação</th><th></th></tr></thead>
        <tbody>${linhas.map((c) => `
          <tr>
            <td>${c.pagina}</td>
            <td class="nome">${esc(c.nome)}</td>
            <td class="mono">${esc(c.chave)}</td>
            <td class="num forte">${brl(c.valor)}</td>
            <td>${fmtDia(c.data)}</td>
            <td class="${c.grupo === "bate" ? "verde" : "ambar"}">${esc(c.obs)}</td>
            <td class="num"><button class="btn btn-ghost btn-sm" data-acao="descartar-comprovante" data-projeto="${p.id}" data-i="${c.i}">${c.descartado ? "Restaurar" : "Descartar"}</button></td>
          </tr>`).join("")}</tbody>
      </table></div>` : `<p class="vazio">${{ bate: "Nenhum comprovante bate.", divergente: "Nenhuma divergência.", fora: "Ninguém fora do projeto.", chave: "Todas as chaves Pix estão cadastradas.", descartado: "Nenhum comprovante descartado." }[ui.aba]}</p>`}
    </div>`;
}

function renderProjeto(id) {
  const p = achar("projetos", id);
  if (!p) return `<div class="card card-pad vazio"><p>Projeto inválido.</p><a class="btn" href="#/entrevistadores">Voltar para projetos</a></div>`;
  const pessoas = entrevistasDoProjeto(p.id);
  const lancado = lancadoProjeto(p.id), pago = pagoProjeto(p.id);
  const envio = envioAberto(p.id);
  const historico = S.envios.filter((e) => e.projeto === p.id && e.situacao === "Confirmado").reverse();

  return `
    <a class="btn btn-ghost btn-sm" href="#/entrevistadores" style="margin-bottom:12px">${icone("arrow-left")}Projetos</a>
    ${cabecalho({ sobretitulo: codigoProjeto(p.id), titulo: `Financeiro · ${esc(p.titulo)}`, icone: "wallet", tela: "tela-entrevistadores",
      subtitulo: `Cliente: ${esc(nomeCliente(p.cliente))} · Pagamento em até ${p.prazoPagamento} dias após o lançamento de cada entrevista.` })}

    <div class="kpis">
      ${kpi({ rotulo: "Orçamento", valor: p.orcamento ? brl(p.orcamento) : "—", detalhe: "definido no Connect", ic: "gauge" })}
      ${kpi({ rotulo: "Lançado", valor: brl(lancado), detalhe: plural(soma(pessoas, (e) => e.lancadas), "entrevista", "entrevistas"), ic: "list-checks" })}
      ${kpi({ rotulo: "Pago", valor: brl(pago), ic: "circle-check", cor: "cor-verde" })}
      ${kpi({ rotulo: "A pagar", valor: brl(lancado - pago), ic: "clock", cor: "cor-ambar" })}
      ${kpi({ rotulo: "Saldo do orçamento", valor: p.orcamento ? brl(p.orcamento - lancado) : "—", ic: "piggy-bank", cor: p.orcamento && lancado > p.orcamento ? "cor-vermelho" : "cor-azul" })}
    </div>

    <div class="grade grade-2 secao">
      <div class="card card-pad">
        <h2 class="forte" style="font-size:14px;margin:0 0 4px">Planilha de pagamentos</h2>
        <p class="pequeno muted" style="margin:0 0 14px">Nome, chave Pix completa e valor de cada pessoa com algo a pagar, inclusive quem está com NF pendente. Use para fazer os Pix no banco. O download fica registrado. ${regra("regra-chave-planilha")}</p>
        <button class="btn" data-acao="baixar-planilha" data-projeto="${p.id}" ${lancado - pago ? "" : "disabled"}>${icone("file-spreadsheet")}Baixar planilha de pagamentos</button>
      </div>
      ${envio ? `<div class="card card-pad"><div class="aviso aviso-azul" style="margin:0">${icone("file-check")}<div><strong>Há um envio para conferir</strong>Confira os comprovantes logo abaixo e confirme a baixa.</div></div></div>`
        : UI.envioLendo === p.id ? `<div class="upload"><div class="icone cor-azul">${icone("loader")}</div><strong>Lendo comprovantes…</strong><p>Não feche esta página até terminar.</p><div class="progresso mt"><span style="width:70%"></span></div></div>`
        : `<div class="upload">
          <div class="icone cor-azul">${icone("file-up")}</div>
          <strong>Enviar comprovantes Pix</strong>
          <p>PDF de comprovantes do Itaú (Sispag). Lemos cada Pix e conferimos com o que falta pagar.</p>
          <button class="btn mt" data-acao="enviar-pdf" data-projeto="${p.id}" ${lancado - pago ? "" : "disabled"}>${icone("upload")}Escolher PDF de exemplo</button>
          <div class="rodape-seguro">${icone("lock")}O PDF não fica guardado no sistema. ${regra("regra-pdf-nao-guardado")}</div>
        </div>`}
    </div>

    ${envio ? renderConferencia(p, envio) : ""}

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
      <div class="card-titulo"><h2>Histórico de envios</h2></div>
      ${historico.length ? `<div class="tabela-wrap"><table>
        <thead><tr><th>Data</th><th>Situação</th><th class="num">Comprovantes</th><th class="num">Fora do projeto</th><th class="num">Total pago</th></tr></thead>
        <tbody>${historico.map((e) => `<tr>
          <td>${fmtDia(e.data)}</td><td>${badge("Confirmado", "verde", "circle-check")}</td>
          <td class="num">${e.comprovantes}</td><td class="num ${e.fora ? "ambar forte" : ""}">${e.fora}</td><td class="num forte">${brl(e.totalPago)}</td>
        </tr>`).join("")}</tbody>
      </table></div>` : `<p class="vazio">Nenhum comprovante enviado neste projeto ainda.</p>`}
    </div>`;
}

registrarTela({
  rota: "entrevistadores",
  titulo: "Entrevistadores",
  icone: "users",
  grupo: "Dia a dia",
  contador: () => S.envios.filter((e) => e.situacao === "Pronto para conferir").length,
  render: (param) => (param ? renderProjeto(param) : renderListaProjetos()),
});
