// Início (dashboard): o que precisa de atenção hoje, saldos, fluxo de caixa previsto e próximos vencimentos.

ponto("tela-inicio", "Início", "A tela inicial mostra o que importa no dia: vencidas, o que vence na semana, saldos, pendências do banco e o fluxo previsto.");
ponto("regra-fluxo-previsto", "Início", "O fluxo de caixa previsto usa a data de vencimento das contas em aberto e das provisões; o realizado usa a data em que o dinheiro saiu ou entrou.");

function saldoBancos() {
  return soma(S.contasBancarias, (b) => b.saldoInicial + soma(S.extrato.filter((e) => e.conta === b.id), (e) => e.valor));
}

function fluxoSemanas() {
  const abertasPagar = S.contasPagar.filter(emAberto);
  const abertasReceber = S.contasReceber.filter((r) => saldoReceber(r) > 0);
  const faixas = [{ rotulo: "Atrasadas", de: "0000-01-01", ate: somarDias(HOJE, -1) }];
  for (let i = 0; i < 4; i++) {
    const de = somarDias(HOJE, i * 7);
    const ate = somarDias(de, 6);
    faixas.push({ rotulo: `${fmtDia(de).slice(0, 5)} a ${fmtDia(ate).slice(0, 5)}`, de, ate });
  }
  let saldo = saldoBancos();
  return faixas.map((f) => {
    const dentro = (d) => d >= f.de && d <= f.ate;
    const entradas = soma(abertasReceber.filter((r) => dentro(r.vencimento)), saldoReceber);
    const saidas = soma(abertasPagar.filter((c) => dentro(c.vencimento)), saldoPagar);
    const provisao = soma(abertasPagar.filter((c) => c.tipo === "provisao" && dentro(c.vencimento)), saldoPagar);
    saldo += entradas - saidas;
    return { ...f, entradas, saidas, provisao, saldo };
  });
}

function itensAtencao() {
  const itens = [];
  const sit = (s) => S.contasPagar.filter((c) => situacaoPagar(c) === s);
  const vencidas = sit("Vencida");
  if (vencidas.length) itens.push({ ic: "triangle-alert", cor: "cor-vermelho", titulo: `${plural(vencidas.length, "conta a pagar vencida", "contas a pagar vencidas")}`, texto: `${brl(soma(vencidas, saldoPagar))} em atraso`, link: "#/pagar", acao: "Ver contas" });
  for (const c of sit("Vence hoje")) itens.push({ ic: "calendar-clock", cor: "cor-ambar", titulo: `Vence hoje: ${esc(c.descricao)}`, texto: `${esc(quemRecebe(c))} · ${brl(saldoPagar(c))}${documentacaoAtrasada(c) ? " · documentação atrasada" : ""}`, link: "#/pagar", acao: "Abrir" });
  for (const c of sit("Devolvida")) itens.push({ ic: "undo-2", cor: "cor-vermelho", titulo: `Pix devolvido: ${esc(quemRecebe(c))}`, texto: `${brl(saldoPagar(c))} precisa ser pago de novo`, link: "#/pagar", acao: "Abrir" });
  const autorizar = sit("Pendente de autorização");
  if (autorizar.length) itens.push({ ic: "shield-alert", cor: "cor-roxo", titulo: `${plural(autorizar.length, "conta acima do orçamento", "contas acima do orçamento")}`, texto: "Aguardando um administrador autorizar", link: "#/pagar", acao: "Ver" });
  const inad = S.contasReceber.filter((r) => situacaoReceber(r) === "Vencida");
  if (inad.length) itens.push({ ic: "hand-coins", cor: "cor-vermelho", titulo: `${plural(inad.length, "título a receber vencido", "títulos a receber vencidos")}`, texto: `${brl(soma(inad, saldoReceber))} de ${plural(new Set(inad.map((r) => r.cliente)).size, "cliente", "clientes")}`, link: "#/receber", acao: "Ver" });
  const conferir = S.envios.filter((e) => e.situacao === "Pronto para conferir").length;
  if (conferir) itens.push({ ic: "file-check", cor: "cor-azul", titulo: `${plural(conferir, "envio de comprovantes para conferir", "envios de comprovantes para conferir")}`, texto: "Pagamento de entrevistadores", link: "#/entrevistadores", acao: "Conferir" });
  for (const p of S.projetos.filter((p) => p.orcamento && lancadoProjeto(p.id) > p.orcamento)) {
    itens.push({ ic: "gauge", cor: "cor-vermelho", titulo: `Orçamento estourado no ${codigoProjeto(p.id)}`, texto: `${brl(lancadoProjeto(p.id))} lançados de ${brl(p.orcamento)}`, link: `#/entrevistadores/${p.id}`, acao: "Ver projeto" });
  }
  const pendBanco = S.extrato.filter(linhaPendente).length;
  const semExtrato = S.contasBancarias.filter((b) => !S.extrato.some((e) => e.conta === b.id && e.data.startsWith("2026-10")));
  if (semExtrato.length) itens.push({ ic: "file-up", cor: "cor-roxo", titulo: `Importe o extrato de outubro: ${semExtrato.map((b) => esc(b.nome)).join(", ")}`, texto: "Para conferir e fechar o mês", link: "#/banco", acao: "Importar" });
  if (pendBanco) itens.push({ ic: "landmark", cor: "cor-roxo", titulo: `${plural(pendBanco, "linha do extrato para conferir", "linhas do extrato para conferir")}`, texto: "Conferir e classificar para fechar o mês", link: "#/banco", acao: "Conferir" });
  const provSemana = S.contasPagar.filter((c) => c.tipo === "provisao" && !c.substituidaPor && c.vencimento <= somarDias(HOJE, 10));
  if (provSemana.length) itens.push({ ic: "piggy-bank", cor: "cor-ambar", titulo: `${plural(provSemana.length, "provisão vence", "provisões vencem")} em até 10 dias`, texto: "Troque pelo valor real quando chegar", link: "#/folha", acao: "Ver" });
  return itens;
}

registrarTela({
  rota: "inicio",
  titulo: "Início",
  icone: "house",
  grupo: "Visão geral",
  render() {
    const vencidas = S.contasPagar.filter((c) => ["Vencida", "Devolvida"].includes(situacaoPagar(c)));
    const semana = S.contasPagar.filter((c) => emAberto(c) && c.tipo === "real" && c.vencimento >= HOJE && c.vencimento <= somarDias(HOJE, 7));
    const receber = S.contasReceber.filter((r) => saldoReceber(r) > 0);
    const receberVencidas = receber.filter((r) => situacaoReceber(r) === "Vencida");
    const atencao = itensAtencao();
    const fluxo = fluxoSemanas();
    const maior = Math.max(1, ...fluxo.flatMap((f) => [f.entradas, f.saidas]));
    const proximos = [
      ...S.contasPagar.filter((c) => emAberto(c)).map((c) => ({ tipo: c.tipo === "provisao" ? "Provisão" : "Pagar", nome: quemRecebe(c), desc: c.descricao, venc: c.vencimento, valor: saldoPagar(c), sit: situacaoPagar(c) })),
      ...receber.map((r) => ({ tipo: "Receber", nome: nomeCliente(r.cliente), desc: r.descricao, venc: r.vencimento, valor: saldoReceber(r), sit: situacaoReceber(r) })),
    ].sort((a, b) => a.venc.localeCompare(b.venc)).slice(0, 8);

    return `
      ${cabecalho({ sobretitulo: `Quarta-feira, ${fmtDia(HOJE)}`, titulo: "Bom dia, Bruna", icone: "house", subtitulo: "O que precisa da sua atenção hoje e como fica o caixa nas próximas semanas.", tela: "tela-inicio" })}

      <div class="kpis">
        ${kpi({ rotulo: "Contas vencidas", valor: brl(soma(vencidas, saldoPagar)), detalhe: plural(vencidas.length, "conta", "contas"), ic: "triangle-alert", cor: vencidas.length ? "cor-vermelho" : "cor-verde" })}
        ${kpi({ rotulo: "A pagar em 7 dias", valor: brl(soma(semana, saldoPagar)), detalhe: plural(semana.length, "conta", "contas"), ic: "calendar-days", cor: "cor-ambar" })}
        ${kpi({ rotulo: "A receber em aberto", valor: brl(soma(receber, saldoReceber)), detalhe: receberVencidas.length ? `${plural(receberVencidas.length, "título vencido", "títulos vencidos")}` : "nenhum vencido", ic: "hand-coins", cor: "cor-verde" })}
        ${kpi({ rotulo: "Saldo nos bancos", valor: brl(saldoBancos()), detalhe: `pelos extratos importados · ${plural(S.contasBancarias.length, "conta", "contas")}`, ic: "landmark", cor: "cor-azul" })}
      </div>

      <div class="grade grade-2 secao">
        <div class="card">
          <div class="card-titulo"><div><h2>Precisa da sua atenção</h2><p>${plural(atencao.length, "item", "itens")}</p></div></div>
          ${atencao.length ? `<ul class="lista">${atencao.map((i) => `
            <li>
              <span class="icone ${i.cor}">${icone(i.ic)}</span>
              <div class="texto"><strong>${i.titulo}</strong><span>${i.texto}</span></div>
              <a class="btn btn-outline btn-sm" href="${i.link}">${i.acao}</a>
            </li>`).join("")}</ul>` : `<p class="vazio">Tudo em dia. Nada pendente agora.</p>`}
        </div>

        <div class="card">
          <div class="card-titulo">
            <div><h2>Fluxo de caixa previsto</h2><p>Começa no saldo dos bancos e soma o que vence em cada semana (inclui provisões)</p></div>
            ${regra("regra-fluxo-previsto")}
          </div>
          <div class="tabela-wrap"><table>
            <thead><tr><th>Semana</th><th class="num">Entradas</th><th class="num">Saídas</th><th class="num">Saldo previsto</th></tr></thead>
            <tbody>${fluxo.map((f) => `
              <tr>
                <td class="nome">${f.rotulo}</td>
                <td class="num"><span class="barra-fluxo" style="width:${(f.entradas / maior) * 60}px;background:var(--brand-verde)"></span> ${f.entradas ? brl(f.entradas) : "—"}</td>
                <td class="num"><span class="barra-fluxo" style="width:${(f.saidas / maior) * 60}px;background:#f59e0b"></span> ${f.saidas ? brl(f.saidas) : "—"}${f.provisao ? `<span class="sub">${brl(f.provisao)} de provisão</span>` : ""}</td>
                <td class="num forte ${f.saldo < 0 ? "vermelho" : ""}">${brl(f.saldo)}</td>
              </tr>`).join("")}</tbody>
          </table></div>
        </div>
      </div>

      <div class="card">
        <div class="card-titulo"><div><h2>Próximos vencimentos</h2><p>Contas a pagar, provisões e contas a receber em aberto, da mais antiga para a mais nova</p></div></div>
        <div class="tabela-wrap"><table>
          <thead><tr><th>Vencimento</th><th>Tipo</th><th>Quem</th><th>Descrição</th><th>Situação</th><th class="num">Em aberto</th></tr></thead>
          <tbody>${proximos.map((p) => `
            <tr>
              <td>${fmtDia(p.venc)}</td>
              <td>${p.tipo === "Pagar" ? badge("Pagar", "ambar", "arrow-up-right") : p.tipo === "Provisão" ? badge("Provisão", "roxo", "piggy-bank") : badge("Receber", "verde", "arrow-down-left")}</td>
              <td class="nome">${esc(p.nome)}</td>
              <td>${esc(p.desc)}</td>
              <td>${badgeSituacao(p.sit)}</td>
              <td class="num forte">${brl(p.valor)}</td>
            </tr>`).join("")}</tbody>
        </table></div>
      </div>`;
  },
});
