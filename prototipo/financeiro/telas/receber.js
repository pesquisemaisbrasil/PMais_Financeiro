// Contas a receber: NF emitida com bruto, retenções e líquido; parcelamento; recebimento; inadimplência por cliente.

ponto("tela-receber", "Contas a receber", "Cada título a receber guarda a nota emitida, o valor bruto, as retenções e o líquido que cai na conta.");
ponto("regra-bruto-liquido", "Contas a receber", "As retenções são lançadas junto com a nota, em abatimentos. O sistema guarda bruto e líquido; o que se espera receber é o líquido.");
ponto("regra-nf-fora", "Contas a receber", "A nota é emitida no site da prefeitura, fora do sistema. Aqui guardamos o número, a data e o PDF da nota (inclusive invoice internacional).");
ponto("regra-projeto-obrigatorio", "Contas a receber", "Toda receita pertence a um projeto (existe receita sem projeto?).");
ponto("regra-parcelas", "Contas a receber", "Parcelamento (ex.: 30% na aprovação, 70% na entrega): as parcelas somam o valor do título; cada uma tem vencimento e situação própria.");
ponto("regra-inadimplencia", "Contas a receber", "Inadimplência: vencidos por cliente, com dias de atraso e total. Aviso ao comercial no vencimento + N dias (quantos?).");
ponto("regra-cobranca-fora", "Contas a receber", "Cobrança e conversa com o cliente continuam por e-mail, fora do sistema.");

ACOES["receber-nova"] = () => formNovaReceber();
function formNovaReceber(v = {}) {
  const parcelas = v.parcelasSim || null;
  abrirDialogo({
    titulo: "Nova conta a receber",
    descricao: "Lance quando a nota for emitida. Os campos com * são obrigatórios.",
    form: "salvar-receber",
    largo: true,
    corpo: `
      <div class="linha-campos">
        <div class="campo"><label for="r-cli">Cliente *</label><select class="input" id="r-cli" name="cliente" autofocus>${opcoes(S.clientes.filter((c) => c.ativo), v.cliente, (c) => c.nome)}</select></div>
        <div class="campo"><label for="r-proj">Projeto * ${regra("regra-projeto-obrigatorio")}</label><select class="input" id="r-proj" name="projeto"><option value="">Escolha…</option>${opcoes(S.projetos, v.projeto, (p) => `${codigoProjeto(p.id)} · ${p.titulo}`)}</select></div>
      </div>
      <div class="campo"><label for="r-desc">Descrição *</label><input class="input" id="r-desc" name="descricao" value="${esc(v.descricao)}" placeholder="Ex.: Pesquisa de satisfação · entrega final"></div>
      <div class="linha-campos-3">
        <div class="campo"><label for="r-emp">Empresa *</label><select class="input" id="r-emp" name="empresa">${opcoes(S.empresas, v.empresa)}</select></div>
        <div class="campo"><label for="r-uni">Unidade *</label><select class="input" id="r-uni" name="unidade">${opcoes(S.unidades.filter((u) => u.ativo), v.unidade, (u) => `${nomeEmpresa(u.empresa)} · ${u.nome}`)}</select></div>
        <div class="campo"><label for="r-cc">Centro de custo *</label><select class="input" id="r-cc" name="centroCusto">${opcoes(S.centrosCusto.filter((c) => c.ativo), v.centroCusto || 3)}</select></div>
      </div>
      <div class="linha-campos-3">
        <div class="campo"><label for="r-nf">Número da NF</label><input class="input" id="r-nf" name="nf" value="${esc(v.nf)}" placeholder="2026/130"></div>
        <div class="campo"><label for="r-dnf">Data da NF</label><input class="input" id="r-dnf" name="dataNf" type="date" value="${esc(v.dataNf || HOJE)}"></div>
        <div class="campo"><label for="r-comp">Competência *</label><input class="input" id="r-comp" name="competencia" type="month" value="${esc(v.competencia || HOJE.slice(0, 7))}"></div>
      </div>
      <p class="pequeno muted" style="margin:-6px 0 12px">A nota é emitida no site da prefeitura. ${regra("regra-nf-fora")}</p>
      <div class="linha-campos-3">
        <div class="campo"><label for="r-bruto">Valor bruto (R$) *</label><input class="input" id="r-bruto" name="bruto" inputmode="decimal" placeholder="0,00" value="${esc(v.bruto)}"></div>
        <div class="campo"><label for="r-abat">Retenções (R$)</label><input class="input" id="r-abat" name="abatimentos" inputmode="decimal" placeholder="0,00" value="${esc(v.abatimentos)}"><span class="dica">IR, PIS, Cofins, CSLL, ISS retidos.</span></div>
        <div class="campo"><label for="r-venc">Vencimento *</label><input class="input" id="r-venc" name="vencimento" type="date" value="${esc(v.vencimento || somarDias(HOJE, 30))}"></div>
      </div>
      <details class="mais" ${parcelas ? "open" : ""}>
        <summary>Parcelar</summary>
        <div class="linha-campos">
          <div class="campo"><label for="r-parc">Percentuais das parcelas</label><input class="input" id="r-parc" name="parcelas" value="${esc(v.parcelas || "30;70")}" placeholder="30;70"><span class="dica">Ex.: 30;70 = 30% agora e 70% depois. ${regra("regra-parcelas")}</span></div>
          <div class="campo" style="justify-content:flex-end"><button type="button" class="btn btn-outline" data-acao="receber-simular">${icone("calendar-range")}Simular parcelas</button></div>
        </div>
        ${parcelas ? `<div class="card"><table><thead><tr><th>Parcela</th><th>Vencimento</th><th>Bruto (R$)</th></tr></thead><tbody>${parcelas.map((p, i) => `<tr><td>${i + 1}/${parcelas.length} · ${p.pct}%</td>
          <td><input class="input" type="date" name="pc-venc-${i}" value="${p.venc}" aria-label="Vencimento da parcela ${i + 1}"></td>
          <td><input class="input" name="pc-valor-${i}" value="${centavosParaCampo(p.valor)}" aria-label="Valor da parcela ${i + 1}"></td></tr>`).join("")}</tbody></table></div>
          <input type="hidden" name="nParcelas" value="${parcelas.length}">` : ""}
      </details>`,
    rodape: `<button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Cancelar</button><button type="submit" class="btn">${parcelas ? `Lançar ${parcelas.length} parcelas` : "Lançar conta a receber"}</button>`,
  });
}
ACOES["receber-simular"] = (d, el) => {
  const f = dadosDoForm(el.closest("form"));
  const bruto = paraCentavos(f.bruto);
  if (!bruto) return toast("Informe o valor bruto antes de simular.", true);
  const pcts = f.parcelas.split(/[;,\s]+/).map(Number).filter((x) => x > 0);
  const totalPct = pcts.reduce((a, b) => a + b, 0);
  if (pcts.length < 2) return toast("Informe pelo menos duas parcelas, ex.: 30;70.", true);
  if (totalPct !== 100) return toast(`Os percentuais somam ${totalPct}%. Precisam somar 100%.`, true);
  let acumulado = 0;
  const parcelasSim = pcts.map((pct, i) => {
    const valor = i === pcts.length - 1 ? bruto - acumulado : Math.round((bruto * pct) / 100);
    acumulado += valor;
    return { pct, valor, venc: diaUtil(mesesDepois(f.vencimento, i)) };
  });
  formNovaReceber({ ...f, parcelasSim });
  dialogo().querySelector('[name="pc-venc-0"]')?.scrollIntoView({ block: "center" });
};

FORMS["salvar-receber"] = (f) => {
  const bruto = paraCentavos(f.bruto);
  const abatimentos = paraCentavos(f.abatimentos) ?? 0;
  if (!f.projeto) return toast("Informe o projeto da receita.", true);
  if (!f.descricao.trim()) return toast("Preencha a descrição.", true);
  if (!bruto) return toast("Informe o valor bruto.", true);
  if (abatimentos >= bruto) return toast("As retenções não podem ser maiores que o valor bruto.", true);
  const erro = erroPeriodo(f.empresa, f.dataNf || HOJE);
  if (erro) return toast(erro, true);
  const n = Number(f.nParcelas || 0);
  const partes = n ? Array.from({ length: n }, (_, i) => ({ venc: f[`pc-venc-${i}`], valor: paraCentavos(f[`pc-valor-${i}`]) })) : [{ venc: f.vencimento, valor: bruto }];
  const totalPartes = soma(partes, (p) => p.valor || 0);
  if (totalPartes !== bruto) return toast(`As parcelas somam ${brl(totalPartes)}, mas o título é de ${brl(bruto)}.`, true);
  const serieId = n ? Math.max(0, ...S.contasReceber.map((r) => r.serie?.id || 0)) + 1 : null;
  partes.forEach((p, i) => {
    const r = {
      id: proximoId(S.contasReceber), empresa: f.empresa, unidade: Number(f.unidade), centroCusto: Number(f.centroCusto), cliente: Number(f.cliente), projeto: Number(f.projeto), categoria: 10,
      nf: i === 0 ? f.nf.trim() : "", dataNf: i === 0 && f.nf.trim() ? f.dataNf : "", competencia: f.competencia, descricao: n ? `${f.descricao.trim()} · parcela ${i + 1}/${n}` : f.descricao.trim(),
      bruto: p.valor, abatimentos: i === 0 ? abatimentos : 0, vencimento: p.venc, serie: n ? { id: serieId, n: i + 1, total: n } : null, anexos: [], recebimentos: [],
    };
    S.contasReceber.push(r);
    auditar(`receber:${r.id}`, `Lançada: ${r.descricao} · bruto ${brl(r.bruto)} · vence ${fmtDia(r.vencimento)}`);
  });
  fecharDialogo();
  salvar();
  toast(n ? `${n} parcelas lançadas, somando ${brl(bruto)}.` : `Conta a receber lançada: bruto ${brl(bruto)}, líquido ${brl(bruto - abatimentos)}.`);
};

ACOES["receber-baixa"] = (d) => {
  const r = achar("contasReceber", d.id);
  abrirDialogo({
    titulo: "Registrar recebimento",
    descricao: `${esc(nomeCliente(r.cliente))} · ${esc(r.descricao)}`,
    form: "salvar-recebimento",
    corpo: `
      <input type="hidden" name="id" value="${r.id}">
      <p style="margin:0 0 14px">Falta receber <strong>${brl(saldoReceber(r))}</strong> (líquido de ${brl(liquido(r))}).</p>
      <div class="linha-campos">
        <div class="campo"><label for="rb-valor">Valor recebido (R$)</label><input class="input" id="rb-valor" name="valor" value="${centavosParaCampo(saldoReceber(r))}" inputmode="decimal" autofocus></div>
        <div class="campo"><label for="rb-data">Data em que o dinheiro entrou</label><input class="input" id="rb-data" name="data" type="date" value="${HOJE}"></div>
      </div>
      <div class="linha-campos">
        <div class="campo"><label for="rb-conta">Conta bancária</label><select class="input" id="rb-conta" name="conta">${opcoes(S.contasBancarias.filter((b) => b.ativo && b.empresa === r.empresa))}</select></div>
        <div class="campo"><label for="rb-forma">Forma</label><select class="input" id="rb-forma" name="forma">${opcoes(S.formasPagamento.filter((x) => x.ativo), 3)}</select></div>
      </div>`,
    rodape: `<button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Cancelar</button><button type="submit" class="btn btn-verde">${icone("check")}Registrar</button>`,
  });
};
FORMS["salvar-recebimento"] = (f) => {
  const r = achar("contasReceber", f.id);
  const valor = paraCentavos(f.valor);
  if (!valor) return toast("Informe o valor recebido.", true);
  if (!f.conta) return toast("Esta empresa não tem conta bancária cadastrada.", true);
  if (valor > saldoReceber(r)) return toast(`O valor recebido passa do saldo pendente (${brl(saldoReceber(r))}).`, true);
  const erro = erroPeriodo(r.empresa, f.data || HOJE);
  if (erro) return toast(erro, true);
  r.recebimentos.push({ id: proximoId(r.recebimentos), data: f.data || HOJE, valor, conta: Number(f.conta), forma: Number(f.forma), tipo: "recebimento", origem: "Lançamento" });
  auditar(`receber:${r.id}`, `Recebimento de ${brl(valor)} em ${fmtDia(f.data || HOJE)} (${nomeConta(Number(f.conta))})`);
  fecharDialogo();
  salvar();
  toast(saldoReceber(r) ? `Recebimento parcial de ${brl(valor)}. Faltam ${brl(saldoReceber(r))}.` : `Recebido: ${brl(valor)} de ${nomeCliente(r.cliente)}.`);
};

ACOES["receber-estornar"] = (d) => {
  const r = achar("contasReceber", d.id);
  const x = r.recebimentos.find((y) => y.id === Number(d.rec));
  const erro = erroPeriodo(r.empresa, HOJE) || erroPeriodo(r.empresa, x.data);
  if (erro) return toast(erro, true);
  pedirMotivo({
    titulo: `Estornar recebimento de ${brl(x.valor)}`, botao: "Estornar", perigo: true,
    acao: (motivo) => {
      r.recebimentos.push({ ...x, id: proximoId(r.recebimentos), tipo: "estorno", ref: x.id, data: HOJE, motivo, origem: "Estorno" });
      auditar(`receber:${r.id}`, `Estorno do recebimento de ${fmtDia(x.data)}: ${motivo}`);
      salvar();
      toast("Recebimento estornado.");
      abrirDetalheReceber(r.id, "recebimentos");
    },
  });
};
ACOES["receber-avisar"] = (d) => toast(`Aviso enviado ao comercial sobre ${d.nome} (simulado). A cobrança segue por e-mail.`);
ACOES["receber-ver"] = (d) => abrirDetalheReceber(Number(d.id));

function abrirDetalheReceber(id, aba = "resumo") {
  const r = achar("contasReceber", id);
  if (!r) return fecharDialogo();
  const abasLista = [["resumo", "Resumo"], ["recebimentos", `Recebimentos (${r.recebimentos.length})`], ["documentos", "Documentos"], ["historico", "Histórico"]];
  let corpo;
  if (aba === "recebimentos") {
    const estornados = new Set(r.recebimentos.filter((x) => x.tipo === "estorno").map((x) => x.ref));
    corpo = r.recebimentos.length ? `<div class="card"><table><thead><tr><th>Data</th><th>Tipo</th><th class="num">Valor</th><th>Conta</th><th>Origem</th><th></th></tr></thead><tbody>${r.recebimentos.map((x) => `<tr>
      <td>${fmtDia(x.data)}</td><td>${x.tipo === "estorno" ? badge("Estorno", "cinza") : badge("Recebimento", "verde")}${x.motivo ? `<span class="sub">${esc(x.motivo)}</span>` : ""}</td>
      <td class="num">${x.tipo === "estorno" ? "−" : ""}${brl(x.valor)}</td><td class="pequeno">${esc(nomeConta(x.conta))}</td><td class="pequeno">${esc(x.origem)}</td>
      <td class="num">${x.tipo === "recebimento" && !estornados.has(x.id) ? botaoIcone("rotate-ccw", "Estornar", "receber-estornar", { id: r.id, rec: x.id }) : ""}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted pequeno">Nada recebido ainda.</p>`;
  } else if (aba === "documentos") {
    corpo = abaDocumentos(r, "receber");
  } else if (aba === "historico") {
    corpo = abaHistorico(`receber:${r.id}`);
  } else {
    corpo = `
      <div class="kpis" style="margin-bottom:14px">
        ${kpi({ rotulo: "Bruto", valor: brl(r.bruto), ic: "receipt" })}
        ${kpi({ rotulo: "Retenções", valor: brl(r.abatimentos), ic: "minus", cor: "cor-roxo" })}
        ${kpi({ rotulo: "Líquido", valor: brl(liquido(r)), detalhe: `pendente ${brl(saldoReceber(r))}`, ic: "hand-coins", cor: "cor-verde" })}
      </div>
      <table class="pequeno"><tbody>${[
        ["Situação", badgeSituacao(situacaoReceber(r))], ["Cliente", esc(nomeCliente(r.cliente))], ["Projeto", r.projeto ? `${codigoProjeto(r.projeto)} · ${esc(achar("projetos", r.projeto)?.titulo)}` : "—"],
        ["Nota fiscal", r.nf ? `${esc(r.nf)} · emitida em ${fmtDia(r.dataNf)}` : '<span class="ambar">Sem NF ainda</span>'], ["Vencimento", fmtDia(r.vencimento)],
        ["Empresa · unidade · centro de custo", `${nomeEmpresa(r.empresa)} · ${esc(nomeUnidade(r.unidade))} · ${esc(nomeCentro(r.centroCusto))}`],
        ["Categoria", esc(nomeCategoriaCompleto(r.categoria))], ["Competência", nomeMes(r.competencia)], ...(r.serie ? [["Parcela", `${r.serie.n} de ${r.serie.total}`]] : []),
      ].map(([k, v]) => `<tr><td class="muted" style="width:38%">${k}</td><td>${v}</td></tr>`).join("")}</tbody></table>
      <p class="pequeno muted">${regra("regra-bruto-liquido")} ${regra("regra-cobranca-fora")}</p>`;
  }
  abrirDialogo({
    titulo: esc(r.descricao),
    descricao: `${esc(nomeCliente(r.cliente))} · ${nomeEmpresa(r.empresa)}`,
    largo: true,
    corpo: abasDetalhe(r.id, "receber", abasLista, aba) + corpo,
    rodape: `${saldoReceber(r) > 0 ? `<button type="button" class="btn btn-verde" data-acao="receber-baixa" data-id="${r.id}">${icone("check")}Registrar recebimento</button>` : ""}<button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Fechar</button>`,
  });
}

registrarTela({
  rota: "receber",
  titulo: "Contas a receber",
  icone: "arrow-down-left",
  grupo: "Dia a dia",
  contador: () => S.contasReceber.filter((r) => situacaoReceber(r) === "Vencida").length,
  render() {
    const ui = (UI.receber ??= { aba: "abertas", busca: "" });
    const termo = (ui.busca || "").trim().toLowerCase();
    const filtros = {
      abertas: (r) => saldoReceber(r) > 0 && situacaoReceber(r) !== "Vencida",
      vencidas: (r) => situacaoReceber(r) === "Vencida",
      recebidas: (r) => situacaoReceber(r) === "Recebida",
      todas: () => true,
    };
    const contar = (f) => S.contasReceber.filter(filtros[f]).length;
    const vencidas = S.contasReceber.filter(filtros.vencidas);

    let corpo;
    if (ui.aba === "inadimplencia") {
      const porCliente = [...new Set(vencidas.map((r) => r.cliente))].map((cli) => {
        const ts = vencidas.filter((r) => r.cliente === cli);
        return { cli, ts, total: soma(ts, saldoReceber), atraso: Math.max(...ts.map((r) => diasEntre(r.vencimento, HOJE))) };
      }).sort((a, b) => b.total - a.total);
      corpo = porCliente.length ? `<div class="tabela-wrap"><table>
        <thead><tr><th>Cliente</th><th>Títulos vencidos</th><th class="num">Maior atraso</th><th class="num">Total vencido</th><th></th></tr></thead>
        <tbody>${porCliente.map((x) => `<tr>
          <td class="nome">${esc(nomeCliente(x.cli))}</td>
          <td>${x.ts.map((r) => `<span class="sub">${esc(r.descricao)} · venceu ${fmtDia(r.vencimento)} · ${brl(saldoReceber(r))}</span>`).join("")}</td>
          <td class="num vermelho forte">${plural(x.atraso, "dia", "dias")}</td>
          <td class="num forte">${brl(x.total)}</td>
          <td class="num"><button class="btn btn-outline btn-sm" data-acao="receber-avisar" data-nome="${esc(nomeCliente(x.cli))}">${icone("bell")}Avisar comercial</button></td>
        </tr>`).join("")}</tbody>
      </table></div><p class="pequeno muted" style="padding:12px 16px;margin:0;border-top:1px solid var(--border)">${regra("regra-inadimplencia")}</p>`
        : `<p class="vazio">Nenhum cliente com título vencido.</p>`;
    } else {
      const lista = S.contasReceber
        .filter(filtros[ui.aba])
        .filter((r) => !termo || `${nomeCliente(r.cliente)} ${r.nf} ${r.projeto ? codigoProjeto(r.projeto) : ""} ${r.descricao}`.toLowerCase().includes(termo))
        .sort((a, b) => a.vencimento.localeCompare(b.vencimento));
      const { itens, controles } = paginar("receber", lista, 12);
      corpo = itens.length ? `<div class="tabela-wrap"><table>
        <thead><tr><th>Vencimento</th><th>Cliente</th><th>Projeto</th><th class="num">Bruto</th><th class="num">Retenções</th><th class="num">Líquido</th><th>Situação</th><th class="num">Pendente</th><th></th></tr></thead>
        <tbody>${itens.map((r) => `<tr>
          <td>${fmtDia(r.vencimento)}</td>
          <td><span class="nome">${esc(nomeCliente(r.cliente))}</span><span class="sub">${esc(r.descricao)} · ${r.nf ? `NF ${esc(r.nf)}` : '<span class="ambar">sem NF</span>'} · ${nomeEmpresa(r.empresa)}</span></td>
          <td>${r.projeto ? codigoProjeto(r.projeto) : '<span class="muted">—</span>'}</td>
          <td class="num">${brl(r.bruto)}</td>
          <td class="num muted">${r.abatimentos ? `− ${brl(r.abatimentos)}` : "—"}</td>
          <td class="num">${brl(liquido(r))}</td>
          <td>${badgeSituacao(situacaoReceber(r))}</td>
          <td class="num forte">${saldoReceber(r) ? brl(saldoReceber(r)) : "—"}</td>
          <td class="num" style="white-space:nowrap">${botaoIcone("eye", "Ver detalhes", "receber-ver", { id: r.id })}${saldoReceber(r) ? botaoIcone("check", "Registrar recebimento", "receber-baixa", { id: r.id }) : ""}</td>
        </tr>`).join("")}</tbody>
      </table></div>${controles}` : `<p class="vazio">${termo ? "Nenhum título encontrado com essa busca." : { abertas: "Nada a receber agora.", vencidas: "Nenhum título vencido.", recebidas: "Nada recebido ainda.", todas: "Nenhuma conta a receber lançada ainda." }[ui.aba]}</p>`;
    }

    return `
      ${cabecalho({ titulo: "Contas a receber", icone: "arrow-down-left", tela: "tela-receber",
        subtitulo: "Lance a nota emitida com o valor bruto e as retenções. O que se espera receber é o líquido.",
        acoes: `<button class="btn" data-acao="receber-nova">${icone("plus")}Nova conta a receber</button>` })}
      <div class="kpis">
        ${kpi({ rotulo: "Inadimplência", valor: brl(soma(vencidas, saldoReceber)), detalhe: `${plural(vencidas.length, "título", "títulos")} de ${plural(new Set(vencidas.map((r) => r.cliente)).size, "cliente", "clientes")}`, ic: "triangle-alert", cor: "cor-vermelho" })}
        ${kpi({ rotulo: "A receber", valor: brl(soma(S.contasReceber.filter(filtros.abertas), saldoReceber)), detalhe: plural(contar("abertas"), "título", "títulos"), ic: "calendar-days", cor: "cor-azul" })}
        ${kpi({ rotulo: "Recebido em outubro", valor: brl(soma(S.contasReceber.flatMap((r) => r.recebimentos).filter((x) => x.data.startsWith("2026-10")), (x) => (x.tipo === "estorno" ? -x.valor : x.valor))), ic: "circle-check", cor: "cor-verde" })}
        ${kpi({ rotulo: "Retenções em outubro", valor: brl(soma(S.contasReceber.filter((r) => (r.dataNf || "").startsWith("2026-10")), (r) => r.abatimentos)), detalhe: "notas emitidas no mês", ic: "receipt", cor: "cor-roxo" })}
      </div>
      <div class="card">
        <div class="barra">
          ${abas("receber", [
            { id: "abertas", rotulo: "A receber", n: contar("abertas") },
            { id: "vencidas", rotulo: "Vencidas", n: contar("vencidas") },
            { id: "recebidas", rotulo: "Recebidas", n: contar("recebidas") },
            { id: "todas", rotulo: "Todas", n: contar("todas") },
            { id: "inadimplencia", rotulo: "Inadimplência por cliente" },
          ], ui.aba)}
          ${ui.aba === "inadimplencia" ? "" : campoBusca("receber", ui.busca || "", "Buscar cliente, NF ou projeto…")}
        </div>
        ${corpo}
      </div>`;
  },
});
