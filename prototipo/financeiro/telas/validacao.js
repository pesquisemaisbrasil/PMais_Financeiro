// Validação: junta as respostas do financeiro (telas, regras e perguntas abertas) para exportar.

function todosOsPontos() {
  return [
    ...Object.values(PONTOS),
    ...PERGUNTAS_ABERTAS.map((q) => ({ id: q.id, tela: "Perguntas abertas", texto: q.texto })),
  ];
}

function rotuloResposta(r) {
  if (!r) return badge("Sem resposta", "cinza");
  return { sim: badge("Está certo", "verde", "thumbs-up"), nao: badge("Precisa mudar", "vermelho", "thumbs-down"), comentar: badge("Comentário", "azul", "message-circle") }[r.resposta];
}
const TEXTO_RESPOSTA = { sim: "Está certo", nao: "Precisa mudar", comentar: "Comentário" };

ACOES["validacao-csv"] = () => {
  baixarCsv("validacao-financeiro.csv", [
    ["Tela", "Ponto", "Resposta", "Comentário", "Quem", "Quando"],
    ...todosOsPontos().map((p) => {
      const r = RESPOSTAS[p.id];
      return [p.tela, p.texto, r ? TEXTO_RESPOSTA[r.resposta] : "Sem resposta", r?.comentario ?? "", r?.quem ?? "", r ? new Date(r.quando).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : ""];
    }),
  ]);
  toast("Respostas exportadas.");
};

ACOES["validacao-copiar"] = () => {
  const pontos = todosOsPontos();
  const linhas = ["Validação do protótipo do Financeiro", ""];
  for (const [chave, titulo] of [["nao", "Precisa mudar"], ["comentar", "Comentários"], ["sim", "Está certo"]]) {
    const daqui = pontos.filter((p) => RESPOSTAS[p.id]?.resposta === chave);
    if (!daqui.length) continue;
    linhas.push(`${titulo} (${daqui.length}):`);
    daqui.forEach((p) => linhas.push(`- [${p.tela}] ${p.texto}${RESPOSTAS[p.id].comentario ? ` → ${RESPOSTAS[p.id].comentario}` : ""}`));
    linhas.push("");
  }
  linhas.push(`Sem resposta: ${pontos.filter((p) => !RESPOSTAS[p.id]).length}`);
  navigator.clipboard?.writeText(linhas.join("\n")).then(() => toast("Resumo copiado. Cole no e-mail."), () => toast("Não deu para copiar.", true));
};

ACOES["validacao-limpar"] = () => confirmar({
  titulo: "Apagar respostas",
  mensagem: "Todas as respostas de validação serão apagadas deste navegador. Exporte antes se quiser guardar. Isso não pode ser desfeito.",
  botao: "Apagar respostas",
  perigo: true,
  acao: () => { RESPOSTAS = {}; gravarLocal(CHAVE_RESPOSTAS, RESPOSTAS); render(); toast("Respostas apagadas."); },
});

registrarTela({
  rota: "validacao",
  titulo: "Validação",
  icone: "clipboard-check",
  grupo: "Protótipo",
  render() {
    const pontos = todosOsPontos();
    const contar = (r) => pontos.filter((p) => RESPOSTAS[p.id]?.resposta === r).length;
    const semResposta = pontos.filter((p) => !RESPOSTAS[p.id]).length;
    const telas = [...new Set(pontos.map((p) => p.tela))];

    return `
      ${cabecalho({ titulo: "Validação", icone: "clipboard-check",
        subtitulo: "Tudo o que o financeiro respondeu nas telas. Exporte no fim da reunião e mande para o time.",
        acoes: `
          <button class="btn btn-ghost" data-acao="validacao-limpar">${icone("trash-2")}Apagar respostas</button>
          <button class="btn btn-outline" data-acao="validacao-copiar">${icone("copy")}Copiar resumo</button>
          <button class="btn" data-acao="validacao-csv">${icone("download")}Exportar CSV</button>` })}

      <div class="aviso aviso-azul">${icone("info")}<div>
        <strong>Como validar</strong>Em cada tela, clique em <em>Isto está certo?</em> no topo ou nas etiquetas <em>Regra a validar</em>. Responda Sim, Não ou Comentar com o seu nome. No site publicado, cada resposta também vai para o painel do Netlify (Forms), junto com as de todo mundo. Aqui ficam só as respostas deste navegador.
      </div></div>

      <div class="kpis">
        ${kpi({ rotulo: "Está certo", valor: String(contar("sim")), ic: "thumbs-up", cor: "cor-verde" })}
        ${kpi({ rotulo: "Precisa mudar", valor: String(contar("nao")), ic: "thumbs-down", cor: "cor-vermelho" })}
        ${kpi({ rotulo: "Comentários", valor: String(contar("comentar")), ic: "message-circle", cor: "cor-azul" })}
        ${kpi({ rotulo: "Sem resposta", valor: String(semResposta), detalhe: `de ${pontos.length} pontos`, ic: "circle-help", cor: "cor-ambar" })}
      </div>

      ${telas.map((tela) => `
        <div class="card secao">
          <div class="card-titulo"><h2>${tela}</h2></div>
          <div class="tabela-wrap"><table>
            <thead><tr><th style="width:50%">O que validar</th><th>Resposta</th><th>Comentário</th><th></th></tr></thead>
            <tbody>${pontos.filter((p) => p.tela === tela).map((p) => {
              const r = RESPOSTAS[p.id];
              return `<tr>
                <td>${PERGUNTAS_ABERTAS.some((q) => q.id === p.id) ? `<span class="mono">${p.id}</span> ` : ""}${esc(p.texto)}</td>
                <td>${rotuloResposta(r)}</td>
                <td class="pequeno">${r?.comentario ? esc(r.comentario) : '<span class="muted">—</span>'}${r?.quem ? `<span class="sub">${esc(r.quem)}</span>` : ""}</td>
                <td class="num"><button class="btn btn-outline btn-sm" data-acao="validar" data-id="${p.id}">${r ? "Mudar" : "Responder"}</button></td>
              </tr>`;
            }).join("")}</tbody>
          </table></div>
        </div>`).join("")}`;
  },
});
