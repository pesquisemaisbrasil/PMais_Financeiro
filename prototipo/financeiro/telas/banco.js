// Conferência do banco: importar o extrato (arquivo de exemplo), conferir linha a linha com o sistema,
// classificar para a contabilidade, explicar a diferença extrato × sistema e fechar o mês.

ponto("tela-banco", "Conferência do banco", "A conferência é pelo extrato: importa o arquivo do banco, e cada linha encontra o seu par no sistema (baixa, recebimento, item de lançamento ou pagamento de entrevistador).");
ponto("regra-importar-sem-duplicar", "Conferência do banco", "Importar o mesmo extrato de novo não duplica: a linha é reconhecida pelo código da transação no banco.");
ponto("regra-sugestao-par", "Conferência do banco", "O sistema sugere o par pelo mesmo valor, data com até 3 dias de diferença, mesma conta e nome do favorecido. A pessoa aceita; nada é conferido sozinho.");
ponto("regra-item-agrupado", "Conferência do banco", "Um lançamento agrupado (ex.: 14 incentivos de R$ 200) casa item por item com os Pix do extrato, não pelo total.");
ponto("regra-classificacao", "Conferência do banco", "Toda linha precisa de classificação para a contabilidade (NF, RPA, incentivo, tarifa…). A classificação vem do lançamento quando existe; senão a pessoa escolhe. Nunca se deduz pelo valor.");
ponto("regra-volta", "Conferência do banco", "Pix devolvido (volta): o crédito casa com o pagamento original e o título volta a ficar em aberto. O novo Pix é uma baixa nova, com a data em que saiu.");
ponto("regra-excecao", "Conferência do banco", "Linha que não tem par pode virar exceção com motivo; exceção conta como conferida para fechar o mês.");
ponto("regra-desfazer", "Conferência do banco", "Desfazer uma conferência pede motivo e fica na auditoria. Se a conferência criou uma baixa, ela é estornada (nunca apagada).");
ponto("regra-fechamento", "Conferência do banco", "Fechar o mês exige todas as linhas conferidas e classificadas. Depois de fechado, ninguém lança, baixa ou estorna com data daquele mês; só um administrador reabre, com motivo.");
ponto("regra-planilha-contabilidade", "Conferência do banco", "A planilha da contabilidade tem uma linha por transação do extrato, com classificação, número e data de emissão da NF e o lançamento.");
ponto("regra-diferenca", "Conferência do banco", "A diferença entre as saídas do extrato e as baixas do sistema é explicada: linhas sem par, baixas sem extrato e voltas.");

const MES_CONFERENCIA = "2026-10";

function sem(texto) { return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase(); }
function linhasDaConta(conta) { return S.extrato.filter((e) => e.conta === conta).sort((a, b) => a.data.localeCompare(b.data) || a.id - b.id); }
function linhaFeita(l) { return !!(l.par || l.excecao); }
function linhaPendente(l) { return !linhaFeita(l) || !l.classe; }

// ---- Candidatos a par de uma linha do extrato ----

function chavesUsadas() { return new Set(S.extrato.map((e) => e.par?.chave).filter(Boolean)); }

function candidatos(linha) {
  const usados = chavesUsadas();
  const banco = achar("contasBancarias", linha.conta);
  const valor = Math.abs(linha.valor);
  const perto = (data, antes = 3) => { const d = diasEntre(data, linha.data); return d >= -3 && d <= antes; };
  const temNome = (nome) => nome && sem(linha.descricao).includes(sem(nome).split(" (")[0]);
  const lista = [];

  if (linha.valor < 0) {
    // Baixa já registrada no sistema nesta conta.
    for (const c of S.contasPagar) for (const b of c.baixas) {
      const chave = `b:${c.id}:${b.id}`;
      if (b.tipo === "pagamento" && b.conta === linha.conta && b.valor === valor && perto(b.data) && !usados.has(chave))
        lista.push({ chave, nota: 3 + (temNome(quemRecebe(c)) ? 1 : 0), titulo: `Baixa de ${fmtDia(b.data)} · ${quemRecebe(c)}`, detalhe: c.descricao, aplicar: () => ({ chave, tipo: "baixa", titulo: c.id, baixa: b.id }) });
    }
    // Pix de entrevistador já baixado por comprovante.
    for (const p of S.pagamentosCampo) {
      const chave = `c:${p.id}`;
      if (p.conta === linha.conta && p.valor === valor && perto(p.data) && !usados.has(chave))
        lista.push({ chave, nota: 3 + (temNome(nomePessoa(p.pessoa)) ? 2 : 0), titulo: `Pix de entrevistador · ${nomePessoa(p.pessoa)}`, detalhe: `${codigoProjeto(p.projeto)} · baixado pelo comprovante em ${fmtDia(p.data)}`, aplicar: () => ({ chave, tipo: "campo", id: p.id }) });
    }
    // Item de lançamento agrupado ainda não pago.
    for (const c of S.contasPagar.filter((c) => c.itens && c.empresa === banco.empresa && emAberto(c) && c.autorizacao !== "pendente")) {
      // Item só é sugerido quando o favorecido do Pix é a pessoa do item (o valor sozinho não basta).
      const it = c.itens.find((i) => !i.pago && i.valor === valor && temNome(i.nome));
      if (it) lista.push({ chave: `i:${c.id}:${it.id}`, nota: 4, titulo: `Item: ${it.nome}`, detalhe: `${c.descricao} · ${it.doc}`, aplicar: () => pagarItem(linha, c, it) });
    }
    // Título em aberto com o mesmo valor pendente.
    for (const c of S.contasPagar.filter((c) => c.tipo === "real" && !c.itens && c.empresa === banco.empresa && emAberto(c) && saldoPagar(c) === valor && c.autorizacao !== "pendente"))
      lista.push({ chave: `t:${c.id}`, nota: 1 + (temNome(quemRecebe(c)) ? 2 : 0), titulo: `Dar baixa: ${quemRecebe(c)}`, detalhe: `${c.descricao} · ${situacaoPagar(c).toLowerCase()} · vence ${fmtDia(c.vencimento)}`, aplicar: () => baixarTitulo(linha, c) });
  } else {
    // Recebimento já registrado.
    for (const r of S.contasReceber) for (const x of r.recebimentos) {
      const chave = `r:${r.id}:${x.id}`;
      if (x.tipo === "recebimento" && x.conta === linha.conta && x.valor === valor && perto(x.data) && !usados.has(chave))
        lista.push({ chave, nota: 3 + (temNome(nomeCliente(r.cliente)) ? 1 : 0), titulo: `Recebimento de ${fmtDia(x.data)} · ${nomeCliente(r.cliente)}`, detalhe: `NF ${r.nf || "—"}`, aplicar: () => ({ chave, tipo: "receb", titulo: r.id, rec: x.id }) });
    }
    // Volta: crédito de Pix devolvido casa com um pagamento feito pouco antes.
    if (sem(linha.descricao).includes("DEVOLV")) {
      for (const c of S.contasPagar) for (const b of c.baixas) {
        const jaDevolvida = c.baixas.some((x) => x.tipo === "devolucao" && x.ref === b.id);
        const d = diasEntre(b.data, linha.data);
        if (b.tipo === "pagamento" && b.conta === linha.conta && b.valor === valor && d >= 0 && d <= 5 && !jaDevolvida)
          lista.push({ chave: `v:${c.id}:${b.id}`, nota: 4 + (temNome(quemRecebe(c)) ? 1 : 0), titulo: `Volta do Pix de ${fmtDia(b.data)} · ${quemRecebe(c)}`, detalhe: `${c.descricao} · o título volta a ficar em aberto`, aplicar: () => registrarVolta(linha, c, b) });
      }
    }
    // Conta a receber em aberto com o mesmo valor.
    for (const r of S.contasReceber.filter((r) => r.empresa === banco.empresa && saldoReceber(r) === valor))
      lista.push({ chave: `rt:${r.id}`, nota: 1 + (temNome(nomeCliente(r.cliente)) ? 2 : 0), titulo: `Registrar recebimento: ${nomeCliente(r.cliente)}`, detalhe: `NF ${r.nf || "—"} · vence ${fmtDia(r.vencimento)}`, aplicar: () => receberTitulo(linha, r) });
  }
  return lista.sort((a, b) => b.nota - a.nota);
}

// ---- Ações que a conferência faz no sistema ----

function novaBaixa(c, dados) {
  const b = { id: proximoId(c.baixas), forma: c.forma, motivo: "", origem: "Conciliação", tipo: "pagamento", ...dados };
  c.baixas.push(b);
  return b;
}
function pagarItem(linha, c, it) {
  const b = novaBaixa(c, { data: linha.data, valor: it.valor, conta: linha.conta, item: it.id });
  it.pago = { data: linha.data, linha: linha.id };
  auditar(`pagar:${c.id}`, `Item "${it.nome}" pago pelo extrato (${brl(it.valor)} em ${fmtDia(linha.data)})`);
  return { chave: `b:${c.id}:${b.id}`, tipo: "baixa", titulo: c.id, baixa: b.id, criada: true };
}
function baixarTitulo(linha, c) {
  const valor = Math.abs(linha.valor);
  const b = novaBaixa(c, { data: linha.data, valor, conta: linha.conta });
  auditar(`pagar:${c.id}`, `Baixa de ${brl(valor)} em ${fmtDia(linha.data)} pela conferência do banco`);
  return { chave: `b:${c.id}:${b.id}`, tipo: "baixa", titulo: c.id, baixa: b.id, criada: true };
}
function registrarVolta(linha, c, original) {
  const b = novaBaixa(c, { data: linha.data, valor: original.valor, conta: linha.conta, tipo: "devolucao", ref: original.id, motivo: "Pix devolvido" });
  auditar(`pagar:${c.id}`, `Pix de ${fmtDia(original.data)} devolvido em ${fmtDia(linha.data)}; título volta a ficar em aberto`);
  return { chave: `b:${c.id}:${b.id}`, tipo: "baixa", titulo: c.id, baixa: b.id, criada: true };
}
function receberTitulo(linha, r) {
  const x = { id: proximoId(r.recebimentos), data: linha.data, valor: linha.valor, conta: linha.conta, forma: 3, tipo: "recebimento", origem: "Conciliação" };
  r.recebimentos.push(x);
  auditar(`receber:${r.id}`, `Recebimento de ${brl(linha.valor)} em ${fmtDia(linha.data)} pela conferência do banco`);
  return { chave: `r:${r.id}:${x.id}`, tipo: "receb", titulo: r.id, rec: x.id, criada: true };
}

// Classificação que vem do lançamento, quando ele tem essa informação.
function classeDoPar(par) {
  if (par.tipo === "campo") return { tipo: "Pagamento de entrevistador", nf: "", emissao: "" };
  if (par.tipo === "receb") {
    const r = achar("contasReceber", par.titulo);
    return r.categoria === 11 ? { tipo: "Rendimento", nf: "", emissao: "" } : { tipo: "Recebimento de cliente", nf: r.nf, emissao: r.dataNf };
  }
  const c = achar("contasPagar", par.titulo);
  const b = c.baixas.find((x) => x.id === par.baixa);
  if (b.tipo === "devolucao") return { tipo: "Devolução (volta)", nf: "", emissao: "" };
  if (b.item) {
    const it = c.itens.find((i) => i.id === b.item);
    if (it.doc === "NF") return it.nf ? { tipo: "Pagamento com NF", nf: it.nf.numero, emissao: it.nf.emissao } : { tipo: "Sem NF", nf: "", emissao: "" };
    return { tipo: it.doc, nf: "", emissao: "" };
  }
  if (c.categoria === 9) return { tipo: "Tarifa", nf: "", emissao: "" };
  if (c.documento.tipo === "NF") return { tipo: "Pagamento com NF", nf: c.documento.numero, emissao: c.documento.emissao };
  return null; // a pessoa escolhe
}

function textoPar(par) {
  if (!par) return "";
  if (par.tipo === "campo") { const p = achar("pagamentosCampo", par.id); return `Pix de entrevistador · ${nomePessoa(p.pessoa)} · ${codigoProjeto(p.projeto)}`; }
  if (par.tipo === "receb") { const r = achar("contasReceber", par.titulo); return `Recebimento · ${nomeCliente(r.cliente)}${r.nf ? ` · NF ${r.nf}` : ""}`; }
  const c = achar("contasPagar", par.titulo);
  const b = c.baixas.find((x) => x.id === par.baixa);
  const it = b?.item ? c.itens.find((i) => i.id === b.item) : null;
  return `${b?.tipo === "devolucao" ? "Volta · " : ""}${it ? `${it.nome} · ` : ""}${quemRecebe(c)} · ${c.descricao}`;
}

function conferir(linha, cand) {
  const erro = erroPeriodo(achar("contasBancarias", linha.conta).empresa, linha.data);
  if (erro) return toast(erro, true);
  linha.par = cand.aplicar();
  linha.classe = classeDoPar(linha.par);
  auditar(`extrato:${linha.id}`, `Linha "${linha.descricao}" conferida com: ${textoPar(linha.par)}`);
}

// ---- Ações da tela ----

ACOES["banco-linha"] = (d) => { UI.banco.linha = Number(d.id); render(); };
ACOES["banco-conferir"] = (d) => {
  const linha = achar("extrato", d.id);
  const cand = candidatos(linha).find((c) => c.chave === d.chave);
  conferir(linha, cand);
  salvar();
  toast(linha.classe ? "Linha conferida e classificada." : "Linha conferida. Falta escolher a classificação.");
};
ACOES["banco-aceitar-todas"] = (d) => {
  let n = 0;
  for (const linha of linhasDaConta(Number(d.conta)).filter((l) => !linhaFeita(l))) {
    const melhor = candidatos(linha)[0];
    if (melhor && melhor.nota >= 3) { conferir(linha, melhor); n++; }
  }
  salvar();
  toast(n ? `${plural(n, "linha conferida", "linhas conferidas")} pelas sugestões mais fortes. Confira as demais uma a uma.` : "Nenhuma sugestão forte para aceitar em lote.");
};
ACOES["banco-desfazer"] = (d) => pedirMotivo({
  titulo: "Desfazer conferência",
  descricao: "Se a conferência criou uma baixa, ela é estornada. Fica tudo na auditoria.",
  botao: "Desfazer",
  perigo: true,
  acao: (motivo) => {
    const linha = achar("extrato", d.id);
    const par = linha.par;
    if (par?.criada && par.tipo === "baixa") {
      const c = achar("contasPagar", par.titulo);
      const b = c.baixas.find((x) => x.id === par.baixa);
      c.baixas.push({ ...b, id: proximoId(c.baixas), tipo: "estorno", ref: b.id, motivo, data: linha.data, origem: "Conciliação desfeita" });
      if (b.item) c.itens.find((i) => i.id === b.item).pago = null;
      if (b.tipo === "devolucao") c.baixas = c.baixas.filter((x) => x.id !== b.id && x.ref !== b.id); // volta desfeita não deixa rastro de saldo
    }
    if (par?.criada && par.tipo === "receb") {
      const r = achar("contasReceber", par.titulo);
      const x = r.recebimentos.find((y) => y.id === par.rec);
      r.recebimentos.push({ ...x, id: proximoId(r.recebimentos), tipo: "estorno", ref: x.id, motivo });
    }
    auditar(`extrato:${linha.id}`, `Conferência desfeita: ${motivo}`);
    Object.assign(linha, { par: null, classe: null, excecao: null });
    salvar();
    toast("Conferência desfeita.");
  },
});

ACOES["banco-excecao"] = (d) => {
  const linha = achar("extrato", d.id);
  abrirDialogo({
    titulo: "Marcar como exceção",
    descricao: `${fmtDia(linha.data)} · ${esc(linha.descricao)} · ${brl(linha.valor)}`,
    form: "banco-excecao",
    corpo: `
      <input type="hidden" name="id" value="${linha.id}">
      <div class="campo"><label for="ex-motivo">Motivo</label><textarea class="input" id="ex-motivo" name="motivo" autofocus placeholder="Ex.: Pix divergente em revisão com o supervisor"></textarea></div>
      ${campoClasse(linha.classe)}
      <p class="pequeno muted" style="margin:0">Exceção conta como conferida para fechar o mês. ${regra("regra-excecao")}</p>`,
    rodape: `<button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Cancelar</button><button type="submit" class="btn">Marcar exceção</button>`,
  });
};
FORMS["banco-excecao"] = (f) => {
  if (!f.motivo.trim()) return toast("Escreva o motivo da exceção.", true);
  if (!f.classe) return toast("Escolha a classificação da linha.", true);
  const linha = achar("extrato", f.id);
  linha.excecao = f.motivo.trim();
  linha.classe = { tipo: f.classe, nf: f.nf || "", emissao: f.emissao || "" };
  auditar(`extrato:${linha.id}`, `Exceção: ${linha.excecao}`);
  fecharDialogo();
  salvar();
  toast("Linha marcada como exceção.");
};

function campoClasse(atual) {
  return `
    <div class="campo"><label for="cl-tipo">Classificação para a contabilidade</label>
      <select class="input" id="cl-tipo" name="classe"><option value="">Escolha…</option>${CLASSES_EXTRATO.map((c) => `<option ${atual?.tipo === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
    <div class="linha-campos">
      <div class="campo"><label for="cl-nf">Número da NF (se tiver)</label><input class="input" id="cl-nf" name="nf" value="${esc(atual?.nf)}"></div>
      <div class="campo"><label for="cl-em">Data de emissão</label><input class="input" id="cl-em" name="emissao" type="date" value="${esc(atual?.emissao)}"></div>
    </div>`;
}

ACOES["banco-classificar"] = (d) => {
  const linha = achar("extrato", d.id);
  abrirDialogo({
    titulo: "Classificar linha",
    descricao: `${fmtDia(linha.data)} · ${esc(linha.descricao)} · ${brl(linha.valor)}`,
    form: "banco-classificar",
    corpo: `<input type="hidden" name="id" value="${linha.id}">${campoClasse(linha.classe)}<p class="pequeno muted" style="margin:0">${regra("regra-classificacao")}</p>`,
    rodape: `<button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Cancelar</button><button type="submit" class="btn">Salvar classificação</button>`,
  });
};
FORMS["banco-classificar"] = (f) => {
  if (!f.classe) return toast("Escolha a classificação.", true);
  if (f.classe === "Pagamento com NF" && (!f.nf.trim() || !f.emissao)) return toast("Informe o número e a data de emissão da nota.", true);
  const linha = achar("extrato", f.id);
  linha.classe = { tipo: f.classe, nf: f.nf.trim(), emissao: f.emissao };
  auditar(`extrato:${linha.id}`, `Classificada como ${f.classe}${f.nf ? ` (NF ${f.nf})` : ""}`);
  fecharDialogo();
  salvar();
  toast("Classificação salva.");
};

ACOES["banco-criar"] = (d) => {
  const linha = achar("extrato", d.id);
  const entrada = linha.valor > 0;
  const tipo = entrada ? "Receita" : "Despesa";
  abrirDialogo({
    titulo: entrada ? "Criar lançamento de entrada" : "Criar lançamento de saída",
    descricao: `${fmtDia(linha.data)} · ${esc(linha.descricao)} · ${brl(Math.abs(linha.valor))}. Para tarifa, rendimento e o que não tem título.`,
    form: "banco-criar",
    corpo: `
      <input type="hidden" name="id" value="${linha.id}">
      <div class="campo"><label for="cr-desc">Descrição</label><input class="input" id="cr-desc" name="descricao" value="${esc(linha.descricao.charAt(0) + linha.descricao.slice(1).toLowerCase())}" autofocus></div>
      <div class="linha-campos">
        <div class="campo"><label for="cr-cat">Categoria</label><select class="input" id="cr-cat" name="categoria">${opcoes(S.categorias.filter((c) => c.ativo && c.tipo === tipo), entrada ? 11 : 9, (c) => `${c.codigo} ${c.nome}`)}</select></div>
        <div class="campo"><label for="cr-cc">Centro de custo</label><select class="input" id="cr-cc" name="centroCusto">${opcoes(S.centrosCusto.filter((c) => c.ativo), 2)}</select></div>
      </div>
      <p class="pequeno muted" style="margin:0">O lançamento entra já ${entrada ? "recebido" : "pago"}, com a data do extrato, e a linha fica conferida.</p>`,
    rodape: `<button type="button" class="btn btn-outline" data-acao="fechar-dialogo">Cancelar</button><button type="submit" class="btn">Criar e conferir</button>`,
  });
};
FORMS["banco-criar"] = (f) => {
  const linha = achar("extrato", f.id);
  const banco = achar("contasBancarias", linha.conta);
  const erro = erroPeriodo(banco.empresa, linha.data);
  if (erro) return toast(erro, true);
  const valor = Math.abs(linha.valor);
  const descricao = f.descricao.trim() || linha.descricao;
  const unidade = S.unidades.find((u) => u.empresa === banco.empresa)?.id;
  if (linha.valor > 0) {
    const r = { id: proximoId(S.contasReceber), empresa: banco.empresa, unidade, centroCusto: Number(f.centroCusto), cliente: null, projeto: null, categoria: Number(f.categoria), nf: "", dataNf: "", competencia: linha.data.slice(0, 7), descricao, bruto: valor, abatimentos: 0, vencimento: linha.data, serie: null, anexos: [], recebimentos: [{ id: 1, data: linha.data, valor, conta: linha.conta, forma: 4, tipo: "recebimento", origem: "Conciliação" }] };
    S.contasReceber.push(r);
    linha.par = { chave: `r:${r.id}:1`, tipo: "receb", titulo: r.id, rec: 1 };
  } else {
    const c = tituloPagar({ id: proximoId(S.contasPagar), empresa: banco.empresa, unidade, centroCusto: Number(f.centroCusto), favorecido: banco.banco, categoria: Number(f.categoria), forma: 4, data: linha.data, competencia: linha.data.slice(0, 7), descricao, vencimento: linha.data, valor, documento: { tipo: "Sem documento", numero: "", emissao: "", motivo: "Débito do banco" }, baixas: [baixa(1, linha.data, valor, linha.conta, 4, { origem: "Conciliação" })] });
    S.contasPagar.push(c);
    linha.par = { chave: `b:${c.id}:1`, tipo: "baixa", titulo: c.id, baixa: 1 };
  }
  linha.classe = classeDoPar(linha.par) || { tipo: linha.valor > 0 ? "Rendimento" : "Outro", nf: "", emissao: "" };
  auditar(`extrato:${linha.id}`, `Lançamento criado pela conferência: ${descricao}`);
  fecharDialogo();
  salvar();
  toast(`Lançamento criado e linha conferida (${brl(valor)}).`);
};

// ---- Importar extrato (arquivos de exemplo, nada sai do computador) ----

ACOES["banco-importar"] = () => { UI.importacao = { arquivo: null }; abrirImportacao(); };
ACOES["banco-importar-ler"] = (d) => { UI.importacao.arquivo = d.nome; abrirImportacao(); };
ACOES["banco-importar-voltar"] = () => { UI.importacao.arquivo = null; abrirImportacao(); };

function abrirImportacao() {
  const arq = ARQUIVOS_EXTRATO.find((a) => a.nome === UI.importacao.arquivo);
  if (!arq) {
    return abrirDialogo({
      titulo: "Importar extrato",
      descricao: "No sistema real você escolhe o OFX ou CSV baixado do banco. Aqui, escolha um arquivo de exemplo.",
      largo: true,
      corpo: ARQUIVOS_EXTRATO.map((a) => `
        <div class="candidato">
          <div class="flex"><span class="icone cor-azul" style="width:34px;height:34px;border-radius:10px;display:grid;place-items:center">${icone("file-text")}</span>
          <div><strong>${a.nome}</strong><span>${nomeConta(a.conta)} · ${a.formato} · ${plural(a.linhas.length, "transação", "transações")}</span></div></div>
          <button type="button" class="btn btn-outline btn-sm" data-acao="banco-importar-ler" data-nome="${a.nome}">Ler arquivo</button>
        </div>`).join("") + `<p class="pequeno muted" style="margin:0">Reimportar o mesmo arquivo não duplica nada. ${regra("regra-importar-sem-duplicar")}</p>`,
    });
  }
  const existentes = new Set(S.extrato.filter((e) => e.conta === arq.conta).map((e) => e.fitid));
  const linhas = arq.linhas.map(([fitid, data, descricao, valor]) => ({ fitid, data, descricao, valor, nova: !existentes.has(fitid) }));
  const novas = linhas.filter((l) => l.nova);
  abrirDialogo({
    titulo: "Conferir antes de importar",
    descricao: `${arq.nome} · ${nomeConta(arq.conta)} · ${fmtDia(linhas[0].data)} a ${fmtDia(linhas[linhas.length - 1].data)}`,
    largo: true,
    corpo: `
      <div class="kpis" style="margin-bottom:14px">
        ${kpi({ rotulo: "Novas", valor: String(novas.length), ic: "plus", cor: "cor-verde" })}
        ${kpi({ rotulo: "Já importadas", valor: String(linhas.length - novas.length), detalhe: "serão ignoradas", ic: "copy-check", cor: "cor-ambar" })}
        ${kpi({ rotulo: "Entradas", valor: brl(soma(novas.filter((l) => l.valor > 0), (l) => l.valor)), ic: "arrow-down-left", cor: "cor-verde" })}
        ${kpi({ rotulo: "Saídas", valor: brl(-soma(novas.filter((l) => l.valor < 0), (l) => l.valor)), ic: "arrow-up-right", cor: "cor-vermelho" })}
      </div>
      <div class="card"><div class="tabela-wrap" style="max-height:320px;overflow:auto"><table>
        <thead><tr><th>Data</th><th>Descrição</th><th class="num">Valor</th><th></th></tr></thead>
        <tbody>${linhas.map((l) => `<tr><td>${fmtDia(l.data)}</td><td class="mono">${esc(l.descricao)}</td><td class="num ${l.valor > 0 ? "verde" : ""}">${brl(l.valor)}</td><td>${l.nova ? badge("Nova", "verde") : badge("Já importada", "cinza")}</td></tr>`).join("")}</tbody>
      </table></div></div>`,
    rodape: `
      <button type="button" class="btn btn-outline" data-acao="banco-importar-voltar">Voltar</button>
      ${novas.length ? `<button type="button" class="btn" data-acao="banco-importar-confirmar">${icone("download")}Importar ${plural(novas.length, "linha", "linhas")}</button>`
        : `<button type="button" class="btn" data-acao="fechar-dialogo">Nada novo · Fechar</button>`}`,
  });
}

ACOES["banco-importar-confirmar"] = () => {
  const arq = ARQUIVOS_EXTRATO.find((a) => a.nome === UI.importacao.arquivo);
  const existentes = new Set(S.extrato.filter((e) => e.conta === arq.conta).map((e) => e.fitid));
  const novas = arq.linhas.filter(([fitid]) => !existentes.has(fitid));
  let id = proximoId(S.extrato);
  for (const [fitid, data, descricao, valor] of novas) S.extrato.push({ id: id++, conta: arq.conta, fitid, data, descricao, valor, par: null, classe: null, excecao: null });
  S.importacoes.push({ id: proximoId(S.importacoes), conta: arq.conta, arquivo: arq.nome, data: HOJE, linhas: arq.linhas.length, novas: novas.length });
  auditar("extrato", `Importou ${arq.nome}: ${novas.length} novas, ${arq.linhas.length - novas.length} ignoradas`);
  UI.banco = { ...UI.banco, conta: arq.conta, linha: null, filtro: "pendentes" };
  fecharDialogo();
  salvar();
  toast(`${plural(novas.length, "linha importada", "linhas importadas")} de ${nomeConta(arq.conta)}. Agora confira linha a linha.`);
};

// ---- Fechamento do mês e planilha da contabilidade ----

function pendenciasEmpresa(empresa, mes) {
  const contas = S.contasBancarias.filter((b) => b.empresa === empresa).map((b) => b.id);
  const linhas = S.extrato.filter((e) => contas.includes(e.conta) && e.data.startsWith(mes));
  const semImportar = contas.filter((c) => !S.extrato.some((e) => e.conta === c && e.data.startsWith(mes)));
  return {
    linhas, semImportar,
    semPar: linhas.filter((l) => !linhaFeita(l)).length,
    semClasse: linhas.filter((l) => linhaFeita(l) && !l.classe).length,
  };
}

ACOES["banco-fechar"] = (d) => {
  const p = pendenciasEmpresa(d.empresa, MES_CONFERENCIA);
  const nome = nomeEmpresa(d.empresa);
  if (p.semImportar.length) return toast(`Importe o extrato de ${nomeConta(p.semImportar[0])} antes de fechar.`, true);
  if (p.semPar || p.semClasse) return toast(`Há ${p.semPar + p.semClasse} linhas não conciliadas ou sem classificação na ${nome}.`, true);
  confirmar({
    titulo: `Fechar ${nomeMes(MES_CONFERENCIA)} da ${nome}`,
    mensagem: `Depois de fechado, ninguém lança, baixa ou estorna com data de ${nomeMes(MES_CONFERENCIA)} na ${nome}. Só um administrador reabre.`,
    botao: "Fechar o mês",
    acao: () => {
      S.fechamentos.push({ empresa: d.empresa, mes: MES_CONFERENCIA, em: HOJE, por: USUARIO });
      auditar("fechamento", `Fechou ${nomeMes(MES_CONFERENCIA)} da ${nome}`);
      salvar();
      toast(`${nomeMes(MES_CONFERENCIA)} da ${nome} fechado. Baixe a planilha para a contabilidade.`);
    },
  });
};
ACOES["banco-reabrir"] = (d) => pedirMotivo({
  titulo: `Reabrir ${nomeMes(d.mes)} da ${nomeEmpresa(d.empresa)}`,
  descricao: "Só administrador. No protótipo, simulamos que você entrou como administrador.",
  botao: "Reabrir como administrador",
  perigo: true,
  acao: (motivo) => {
    S.fechamentos = S.fechamentos.filter((f) => !(f.empresa === d.empresa && f.mes === d.mes));
    auditar("fechamento", `Administrador reabriu ${nomeMes(d.mes)} da ${nomeEmpresa(d.empresa)}: ${motivo}`);
    salvar();
    toast(`${nomeMes(d.mes)} reaberto.`);
  },
});

ACOES["banco-planilha"] = (d) => {
  const contas = S.contasBancarias.filter((b) => !d.empresa || b.empresa === d.empresa).map((b) => b.id);
  const linhas = S.extrato.filter((e) => contas.includes(e.conta) && e.data.startsWith(MES_CONFERENCIA)).sort((a, b) => a.data.localeCompare(b.data));
  baixarCsv(`conciliacao-${d.empresa || "todas"}-${MES_CONFERENCIA}.csv`, [
    ["Data", "Conta", "Descrição no extrato", "Valor (R$)", "Classificação", "Número da NF", "Emissão da NF", "Lançamento no sistema", "Situação"],
    ...linhas.map((l) => [fmtDia(l.data), nomeConta(l.conta), l.descricao, centavosParaCampo(l.valor).replace("-", "−"), l.classe?.tipo || "", l.classe?.nf || "", l.classe?.emissao ? fmtDia(l.classe.emissao) : "", l.par ? textoPar(l.par) : "", l.par ? "Conferida" : l.excecao ? `Exceção: ${l.excecao}` : "Pendente"]),
  ]);
  toast(`Planilha da contabilidade baixada (${plural(linhas.length, "linha", "linhas")}).`);
};

// ---- Visões ----

function badgeLinha(l) {
  if (l.excecao) return badge("Exceção", "ambar", "flag");
  if (l.par) return badge("Conferida", "verde", "circle-check");
  return candidatos(l).length ? badge("Sugestão", "roxo", "sparkles") : badge("Sem par", "cinza", "circle-help");
}

function painelLinha(linha) {
  if (!linha) {
    return `<div class="card painel-lateral"><div class="secao-painel">
      <h3>No sistema</h3>
      <p class="muted" style="margin:0 0 12px">Clique numa linha do extrato para ver o par no sistema, aceitar a sugestão, dar baixa, criar um lançamento ou marcar exceção.</p>
      <ul class="pequeno muted" style="margin:0;padding-left:18px;line-height:1.7">
        <li>${badge("Sugestão", "roxo", "sparkles")} tem par provável</li>
        <li>${badge("Sem par", "cinza", "circle-help")} nada no sistema com esse valor</li>
        <li>${badge("Conferida", "verde", "circle-check")} ou ${badge("Exceção", "ambar", "flag")} já resolvida</li>
      </ul>
    </div></div>`;
  }
  const cands = linhaFeita(linha) ? [] : candidatos(linha);
  const fechado = periodoFechado(achar("contasBancarias", linha.conta).empresa, linha.data);
  return `<div class="card painel-lateral">
    <div class="secao-painel">
      <h3>Linha do extrato</h3>
      <div class="flex entre"><span class="mono">${esc(linha.descricao)}</span>${badgeLinha(linha)}</div>
      <div class="flex entre mt"><span class="muted">${fmtDia(linha.data)} · ${nomeConta(linha.conta)}</span><strong class="${linha.valor > 0 ? "verde" : ""}" style="font-size:18px">${brl(linha.valor)}</strong></div>
      ${fechado ? `<div class="aviso aviso-cinza mt" style="margin-bottom:0">${icone("lock")}<div>Mês fechado. Só leitura.</div></div>` : ""}
    </div>
    ${linhaFeita(linha) ? `
      <div class="secao-painel">
        <h3>${linha.excecao ? "Exceção" : "Par no sistema"}</h3>
        <p style="margin:0">${linha.excecao ? esc(linha.excecao) : esc(textoPar(linha.par))}</p>
      </div>
      <div class="secao-painel">
        <h3>Classificação ${regra("regra-classificacao")}</h3>
        ${linha.classe ? `<p style="margin:0"><strong>${esc(linha.classe.tipo)}</strong>${linha.classe.nf ? ` · NF ${esc(linha.classe.nf)} · emitida em ${fmtDia(linha.classe.emissao)}` : ""}</p>`
          : `<div class="aviso aviso-ambar" style="margin:0">${icone("tag")}<div><strong>Falta classificar</strong>O lançamento não diz o tipo. Escolha você; o mês não fecha sem isso.</div></div>`}
        ${fechado ? "" : `<div class="flex mt">
          <button class="btn ${linha.classe ? "btn-outline" : ""} btn-sm" data-acao="banco-classificar" data-id="${linha.id}">${icone("tag")}${linha.classe ? "Mudar classificação" : "Classificar"}</button>
          <button class="btn btn-ghost btn-sm" data-acao="banco-desfazer" data-id="${linha.id}">${icone("undo-2")}Desfazer</button>
        </div>`}
      </div>` : `
      <div class="secao-painel">
        <h3>Sugestões ${regra("regra-sugestao-par")}</h3>
        ${cands.length ? cands.map((c, i) => `
          <div class="candidato ${i === 0 ? "melhor" : ""}">
            <div style="min-width:0"><strong>${esc(c.titulo)}</strong><span>${esc(c.detalhe)}</span></div>
            <button class="btn ${i === 0 ? "" : "btn-outline"} btn-sm" data-acao="banco-conferir" data-id="${linha.id}" data-chave="${c.chave}" ${fechado ? "disabled" : ""}>${icone("check")}Conferir</button>
          </div>`).join("") : `<p class="muted pequeno" style="margin:0">Nada no sistema com ${brl(Math.abs(linha.valor))} perto de ${fmtDia(linha.data)}.</p>`}
        ${cands.some((c) => c.chave.startsWith("i:")) ? `<p class="pequeno muted" style="margin:6px 0 0">Item a item do lançamento agrupado. ${regra("regra-item-agrupado")}</p>` : ""}
        ${cands.some((c) => c.chave.startsWith("v:")) ? `<p class="pequeno muted" style="margin:6px 0 0">${regra("regra-volta")}</p>` : ""}
      </div>
      <div class="secao-painel">
        <h3>Sem par no sistema?</h3>
        <div class="flex" style="flex-wrap:wrap">
          <button class="btn btn-outline btn-sm" data-acao="banco-criar" data-id="${linha.id}" ${fechado ? "disabled" : ""}>${icone("plus")}Criar lançamento</button>
          <button class="btn btn-outline btn-sm" data-acao="banco-excecao" data-id="${linha.id}" ${fechado ? "disabled" : ""}>${icone("flag")}Marcar exceção</button>
        </div>
        <p class="pequeno muted" style="margin:8px 0 0">Criar lançamento serve para tarifa, rendimento e débitos sem título.</p>
      </div>`}
  </div>`;
}

function visaoConciliacao(conta) {
  const ui = UI.banco;
  const linhas = linhasDaConta(conta.id);
  if (!linhas.length) {
    return `<div class="card"><div class="vazio">
      <p>Nenhum extrato de ${esc(conta.nome)} importado ainda.</p>
      <button class="btn" data-acao="banco-importar">${icone("file-up")}Importar extrato</button>
    </div></div>`;
  }
  const filtros = {
    pendentes: (l) => linhaPendente(l),
    conferidas: (l) => !!l.par && !!l.classe,
    excecoes: (l) => !!l.excecao,
    todas: () => true,
  };
  const visiveis = linhas.filter(filtros[ui.filtro]);
  const sugeriveis = linhas.filter((l) => !linhaFeita(l) && (candidatos(l)[0]?.nota ?? 0) >= 3).length;
  const selecionada = linhas.find((l) => l.id === ui.linha);

  return `<div class="duas-colunas">
    <div class="card">
      <div class="barra">
        ${abas("banco-filtro", [
          { id: "pendentes", rotulo: "Pendentes", n: linhas.filter(filtros.pendentes).length },
          { id: "conferidas", rotulo: "Conferidas", n: linhas.filter(filtros.conferidas).length },
          { id: "excecoes", rotulo: "Exceções", n: linhas.filter(filtros.excecoes).length },
          { id: "todas", rotulo: "Todas", n: linhas.length },
        ], ui.filtro)}
        ${sugeriveis ? `<button class="btn btn-sm" data-acao="banco-aceitar-todas" data-conta="${conta.id}">${icone("check-check")}Aceitar ${plural(sugeriveis, "sugestão forte", "sugestões fortes")}</button>` : ""}
      </div>
      ${visiveis.length ? `<div class="tabela-wrap"><table>
        <thead><tr><th>Data</th><th>No extrato</th><th class="num">Valor</th><th>Situação</th></tr></thead>
        <tbody>${visiveis.map((l) => `
          <tr class="clicavel ${l.id === ui.linha ? "selecionada" : ""}" data-acao="banco-linha" data-id="${l.id}" tabindex="0">
            <td>${fmtDia(l.data)}</td>
            <td><span class="mono">${esc(l.descricao)}</span>${l.classe ? `<span class="sub">${esc(l.classe.tipo)}${l.classe.nf ? ` · NF ${esc(l.classe.nf)}` : ""}</span>` : linhaFeita(l) ? '<span class="sub ambar">Falta classificar</span>' : ""}</td>
            <td class="num forte ${l.valor > 0 ? "verde" : ""}">${brl(l.valor)}</td>
            <td>${badgeLinha(l)}</td>
          </tr>`).join("")}</tbody>
      </table></div>` : `<p class="vazio">${ui.filtro === "pendentes" ? "Tudo conferido e classificado nesta conta." : "Nenhuma linha aqui."}</p>`}
    </div>
    ${painelLinha(selecionada)}
  </div>`;
}

function visaoDiferenca(conta) {
  const linhas = linhasDaConta(conta.id).filter((l) => l.data.startsWith(MES_CONFERENCIA));
  if (!linhas.length) return `<div class="card vazio">Importe o extrato de ${esc(conta.nome)} para comparar com o sistema.</div>`;
  const usados = chavesUsadas();
  const saidasSistema = [];
  for (const c of S.contasPagar) for (const b of c.baixas) {
    if (b.conta === conta.id && b.tipo === "pagamento" && b.data.startsWith(MES_CONFERENCIA)) saidasSistema.push({ data: b.data, valor: b.valor, texto: `${quemRecebe(c)} · ${c.descricao}`, chave: `b:${c.id}:${b.id}` });
  }
  for (const p of S.pagamentosCampo) if (p.conta === conta.id && p.data.startsWith(MES_CONFERENCIA)) saidasSistema.push({ data: p.data, valor: p.valor, texto: `Pix de entrevistador · ${nomePessoa(p.pessoa)}`, chave: `c:${p.id}` });
  const saidasExtrato = linhas.filter((l) => l.valor < 0);
  const dias = [...new Set([...saidasExtrato.map((l) => l.data), ...saidasSistema.map((s) => s.data)])].sort();
  const porDia = dias.map((d) => {
    const ext = -soma(saidasExtrato.filter((l) => l.data === d), (l) => l.valor);
    const sis = soma(saidasSistema.filter((s) => s.data === d), (s) => s.valor);
    return { d, ext, sis, dif: ext - sis };
  });
  const totExt = soma(porDia, (x) => x.ext), totSis = soma(porDia, (x) => x.sis);
  const extratoSemPar = saidasExtrato.filter((l) => !l.par);
  const sistemaSemExtrato = saidasSistema.filter((s) => !usados.has(s.chave));
  const voltas = linhas.filter((l) => l.classe?.tipo === "Devolução (volta)" || (l.valor > 0 && sem(l.descricao).includes("DEVOLV")));

  return `
    <div class="kpis">
      ${kpi({ rotulo: "Saídas no extrato", valor: brl(totExt), detalhe: nomeMes(MES_CONFERENCIA), ic: "landmark" })}
      ${kpi({ rotulo: "Baixas no sistema", valor: brl(totSis), detalhe: "pagamentos com data no mês", ic: "list-checks" })}
      ${kpi({ rotulo: "Diferença", valor: brl(totExt - totSis), detalhe: totExt === totSis ? "bate" : "explicada abaixo", ic: totExt === totSis ? "circle-check" : "scale", cor: totExt === totSis ? "cor-verde" : "cor-ambar" })}
    </div>
    <div class="grade grade-2">
      <div class="card">
        <div class="card-titulo"><div><h2>Por dia</h2><p>Só saídas. Dias com diferença em destaque.</p></div>${regra("regra-diferenca")}</div>
        <div class="tabela-wrap"><table>
          <thead><tr><th>Dia</th><th class="num">Extrato</th><th class="num">Sistema</th><th class="num">Diferença</th></tr></thead>
          <tbody>${porDia.map((x) => `<tr style="${x.dif ? "background:#fffbeb" : ""}"><td>${fmtDia(x.d)}</td><td class="num">${brl(x.ext)}</td><td class="num">${brl(x.sis)}</td><td class="num forte ${x.dif ? "ambar" : "muted"}">${x.dif ? brl(x.dif) : "—"}</td></tr>`).join("")}</tbody>
          <tfoot><tr class="total-linha"><td>Mês</td><td class="num">${brl(totExt)}</td><td class="num">${brl(totSis)}</td><td class="num">${brl(totExt - totSis)}</td></tr></tfoot>
        </table></div>
      </div>
      <div class="card">
        <div class="card-titulo"><div><h2>O que explica a diferença</h2></div></div>
        <ul class="lista">
          <li><span class="icone cor-ambar">${icone("circle-help")}</span><div class="texto"><strong>${plural(extratoSemPar.length, "saída do extrato sem par", "saídas do extrato sem par")} · ${brl(-soma(extratoSemPar, (l) => l.valor))}</strong><span>${extratoSemPar.map((l) => `${fmtDia(l.data)} ${esc(l.descricao)}`).join(" · ") || "Nenhuma"}</span></div></li>
          <li><span class="icone cor-roxo">${icone("file-question")}</span><div class="texto"><strong>${plural(sistemaSemExtrato.length, "baixa sem linha no extrato", "baixas sem linha no extrato")} · ${brl(soma(sistemaSemExtrato, (s) => s.valor))}</strong><span>${sistemaSemExtrato.map((s) => `${fmtDia(s.data)} ${esc(s.texto)}`).join(" · ") || "Nenhuma"}</span></div></li>
          <li><span class="icone cor-vermelho">${icone("undo-2")}</span><div class="texto"><strong>${plural(voltas.length, "volta (Pix devolvido)", "voltas (Pix devolvidos)")}</strong><span>${voltas.map((l) => `${fmtDia(l.data)} ${esc(l.descricao)} ${brl(l.valor)}: a saída aparece duas vezes no extrato (pagamento e novo pagamento) e a devolução entra como crédito`).join(" · ") || "Nenhuma"}</span></div></li>
        </ul>
      </div>
    </div>`;
}

function visaoSaldo() {
  const linhasConta = S.contasBancarias.map((b) => {
    const mov = S.extrato.filter((e) => e.conta === b.id && e.data.startsWith(MES_CONFERENCIA));
    const entradas = soma(mov.filter((e) => e.valor > 0), (e) => e.valor);
    const saidas = -soma(mov.filter((e) => e.valor < 0), (e) => e.valor);
    const conferido = soma(mov.filter((e) => linhaFeita(e)), (e) => e.valor);
    return { b, entradas, saidas, final: b.saldoInicial + entradas - saidas, sistema: b.saldoInicial + conferido, importado: mov.length > 0 };
  });
  const t = (f) => soma(linhasConta, f);
  return `<div class="card">
    <div class="card-titulo"><div><h2>Saldo de ${nomeMes(MES_CONFERENCIA)}</h2><p>Por conta e consolidado. "Pelo sistema" soma só as linhas já conferidas.</p></div></div>
    <div class="tabela-wrap"><table>
      <thead><tr><th>Conta</th><th class="num">Saldo inicial</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Saldo final (extrato)</th><th class="num">Saldo pelo sistema</th><th class="num">A conferir</th></tr></thead>
      <tbody>${linhasConta.map((x) => `<tr>
        <td><span class="nome">${esc(x.b.nome)}</span><span class="sub">${nomeEmpresa(x.b.empresa)} · ${x.b.tipo}${x.importado ? "" : " · extrato não importado"}</span></td>
        <td class="num">${brl(x.b.saldoInicial)}</td><td class="num verde">${brl(x.entradas)}</td><td class="num">${brl(x.saidas)}</td>
        <td class="num forte">${brl(x.final)}</td><td class="num">${brl(x.sistema)}</td>
        <td class="num ${x.final - x.sistema ? "ambar forte" : "muted"}">${x.final - x.sistema ? brl(x.final - x.sistema) : "—"}</td>
      </tr>`).join("")}</tbody>
      <tfoot><tr class="total-linha"><td>Consolidado</td><td class="num">${brl(t((x) => x.b.saldoInicial))}</td><td class="num">${brl(t((x) => x.entradas))}</td><td class="num">${brl(t((x) => x.saidas))}</td><td class="num">${brl(t((x) => x.final))}</td><td class="num">${brl(t((x) => x.sistema))}</td><td class="num">${brl(t((x) => x.final - x.sistema))}</td></tr></tfoot>
    </table></div>
  </div>`;
}

function visaoFechamento() {
  const empresas = S.empresas.filter((e) => S.contasBancarias.some((b) => b.empresa === e.id));
  return `
    <div class="aviso aviso-azul">${icone("info")}<div><strong>Como fecha</strong>O mês fecha por empresa quando todas as linhas do extrato estão conferidas (ou são exceção) e classificadas. Fechado, nada com data daquele mês muda. ${regra("regra-fechamento")}</div></div>
    <div class="grade grade-2 secao">${empresas.map((e) => {
      const fechado = periodoFechado(e.id, MES_CONFERENCIA + "-01");
      const p = pendenciasEmpresa(e.id, MES_CONFERENCIA);
      const pronto = !p.semImportar.length && !p.semPar && !p.semClasse;
      return `<div class="card card-pad">
        <div class="flex entre"><h2 class="forte" style="font-size:15px;margin:0">${e.nome} · ${nomeMes(MES_CONFERENCIA)}</h2>${fechado ? badge("Fechado", "verde", "lock") : badge("Aberto", "cinza", "lock-open")}</div>
        <ul class="pequeno" style="padding-left:18px;line-height:1.8;margin:12px 0">
          <li>${p.semImportar.length ? `<span class="vermelho">Extrato não importado: ${p.semImportar.map(nomeConta).join(", ")}</span>` : `${plural(p.linhas.length, "linha", "linhas")} no extrato`}</li>
          <li class="${p.semPar ? "ambar" : "verde"}">${p.semPar ? `${plural(p.semPar, "linha sem conferir", "linhas sem conferir")}` : "Todas conferidas"}</li>
          <li class="${p.semClasse ? "ambar" : "verde"}">${p.semClasse ? `${plural(p.semClasse, "linha sem classificação", "linhas sem classificação")}` : "Todas classificadas"}</li>
        </ul>
        <div class="flex">
          ${fechado ? `<button class="btn btn-outline btn-sm" data-acao="banco-reabrir" data-empresa="${e.id}" data-mes="${MES_CONFERENCIA}">${icone("lock-open")}Reabrir (administrador)</button>`
            : `<button class="btn btn-sm" data-acao="banco-fechar" data-empresa="${e.id}" ${pronto ? "" : 'aria-disabled="true"'}>${icone("lock")}Fechar ${nomeMes(MES_CONFERENCIA)}</button>`}
          <button class="btn btn-outline btn-sm" data-acao="banco-planilha" data-empresa="${e.id}">${icone("file-spreadsheet")}Planilha da contabilidade</button>
        </div>
        ${pronto || fechado ? "" : `<p class="pequeno muted" role="status" style="margin:8px 0 0">Resolva as pendências acima para fechar.</p>`}
      </div>`;
    }).join("")}</div>
    <div class="card">
      <div class="card-titulo"><h2>Meses fechados</h2>${regra("regra-planilha-contabilidade")}</div>
      <div class="tabela-wrap"><table>
        <thead><tr><th>Empresa</th><th>Mês</th><th>Fechado em</th><th>Por</th><th></th></tr></thead>
        <tbody>${S.fechamentos.map((f) => `<tr><td class="nome">${nomeEmpresa(f.empresa)}</td><td>${nomeMes(f.mes)}</td><td>${fmtDia(f.em)}</td><td>${esc(f.por)}</td>
          <td class="num"><button class="btn btn-ghost btn-sm" data-acao="banco-reabrir" data-empresa="${f.empresa}" data-mes="${f.mes}">Reabrir (administrador)</button></td></tr>`).join("")}</tbody>
      </table></div>
    </div>`;
}

registrarTela({
  rota: "banco",
  titulo: "Conferência do banco",
  icone: "landmark",
  grupo: "Dia a dia",
  contador: () => S.extrato.filter(linhaPendente).length,
  render() {
    const ui = (UI.banco ??= {});
    ui.visao ??= "conciliacao";
    ui.filtro ??= "pendentes";
    ui.conta ??= S.contasBancarias[0].id;
    if (UI["banco-filtro"]?.aba) { ui.filtro = UI["banco-filtro"].aba; delete UI["banco-filtro"]; }
    if (UI["banco-visao"]?.aba) { ui.visao = UI["banco-visao"].aba; delete UI["banco-visao"]; }
    if (UI["banco-conta"]?.aba) { ui.conta = Number(UI["banco-conta"].aba); ui.linha = null; delete UI["banco-conta"]; }
    const conta = achar("contasBancarias", ui.conta) || S.contasBancarias[0];
    const pendentes = S.extrato.filter(linhaPendente).length;
    const ultima = [...S.importacoes].reverse().find((i) => i.conta === conta.id);

    let corpo;
    if (ui.visao === "diferenca") corpo = visaoDiferenca(conta);
    else if (ui.visao === "saldo") corpo = visaoSaldo();
    else if (ui.visao === "fechamento") corpo = visaoFechamento();
    else corpo = visaoConciliacao(conta);

    return `
      ${cabecalho({ titulo: "Conferência do banco", icone: "landmark", tela: "tela-banco",
        subtitulo: `Importe o extrato e confira cada linha com o sistema. Mês de ${nomeMes(MES_CONFERENCIA)}.`,
        acoes: `<button class="btn" data-acao="banco-importar">${icone("file-up")}Importar extrato</button>` })}
      <div class="flex entre mb" style="flex-wrap:wrap">
        ${abas("banco-visao", [
          { id: "conciliacao", rotulo: "Conferência", n: pendentes || null },
          { id: "diferenca", rotulo: "Extrato × sistema" },
          { id: "saldo", rotulo: "Saldo do mês" },
          { id: "fechamento", rotulo: "Fechamento" },
        ], ui.visao)}
        ${["conciliacao", "diferenca"].includes(ui.visao) ? `<div class="flex">
          ${abas("banco-conta", S.contasBancarias.map((b) => ({ id: String(b.id), rotulo: b.nome, n: S.extrato.filter((e) => e.conta === b.id && linhaPendente(e)).length })), String(conta.id))}
        </div>` : ""}
      </div>
      ${["conciliacao", "diferenca"].includes(ui.visao) ? `<p class="pequeno muted" style="margin:-6px 0 14px">${icone("file-text")} ${ultima ? `Último extrato: ${esc(ultima.arquivo)} em ${fmtDia(ultima.data)} (${plural(ultima.novas, "linha nova", "linhas novas")})` : "Nenhum extrato importado nesta conta."}</p>` : ""}
      ${corpo}`;
  },
});
