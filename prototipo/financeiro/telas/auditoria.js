// Auditoria: quem fez o quê, quando. Toda mudança de título, baixa, conferência, cadastro e fechamento cai aqui.

ponto("tela-auditoria", "Auditoria", "A auditoria registra quem fez o quê e quando: lançamentos, baixas, estornos, reclassificações, conferências, downloads e fechamentos.");

registrarTela({
  rota: "auditoria",
  titulo: "Auditoria",
  icone: "scroll-text",
  grupo: "Configuração",
  render() {
    const ui = (UI.auditoria ??= { busca: "" });
    const termo = (ui.busca || "").trim().toLowerCase();
    const lista = S.auditoria.filter((a) => !termo || `${a.texto} ${a.quem} ${a.alvo}`.toLowerCase().includes(termo));
    const { itens, controles } = paginar("auditoria", lista, 20);
    return `
      ${cabecalho({ titulo: "Auditoria", icone: "scroll-text", tela: "tela-auditoria", subtitulo: "Tudo o que muda no sistema fica registrado aqui, do mais recente para o mais antigo." })}
      <div class="card">
        <div class="barra">${campoBusca("auditoria", ui.busca || "", "Buscar na auditoria…")}<span class="pequeno muted">${plural(lista.length, "registro", "registros")}</span></div>
        ${itens.length ? `<div class="tabela-wrap"><table>
          <thead><tr><th>Quando</th><th>Quem</th><th>Onde</th><th>O que aconteceu</th></tr></thead>
          <tbody>${itens.map((a) => `<tr><td class="pequeno" style="white-space:nowrap">${fmtDia(a.quando.slice(0, 10))} ${a.quando.slice(11)}</td><td>${esc(a.quem)}</td><td class="mono">${esc(a.alvo)}</td><td>${esc(a.texto)}</td></tr>`).join("")}</tbody>
        </table></div>${controles}` : `<p class="vazio">${termo ? "Nada encontrado com essa busca." : "Nada registrado ainda."}</p>`}
      </div>`;
  },
});
