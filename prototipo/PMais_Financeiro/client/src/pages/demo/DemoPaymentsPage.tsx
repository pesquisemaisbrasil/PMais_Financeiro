import { useMemo, useState, type FormEvent } from "react";
import { DemoEmpty, DemoPageShell, DemoPanel, DemoStatus } from "@/components/DemoComponents";
import { useDemoStore } from "@/contexts/DemoStore";
import {
  formatBrl,
  formatDemoDate,
  pendingCents,
  projectById,
  sumCents,
  titleStatus,
  todayInSaoPaulo,
} from "@/lib/demoModel";

type DemoTone = "neutral" | "positive" | "warning" | "danger" | "info";
type Feedback = { role: "status" | "alert"; tone: DemoTone; message: string };

const SIMULATION_NOTICE = "SIMULAÇÃO local; nenhum Pix/Connect será acionado";

function titleStatusLabel(status: ReturnType<typeof titleStatus>): string {
  switch (status) {
    case "em_aberto": return "Em aberto";
    case "parcial": return "Parcial";
    case "vencido": return "Vencido";
    case "vence_hoje": return "Vence hoje";
    case "a_vencer": return "A vencer";
    case "liquidado_simulado": return "Paga simulada";
  }
}

function titleStatusTone(status: ReturnType<typeof titleStatus>): DemoTone {
  switch (status) {
    case "liquidado_simulado": return "positive";
    case "vencido": return "danger";
    case "vence_hoje": return "warning";
    case "parcial": return "info";
    default: return "neutral";
  }
}

function itemStatusLabel(status: "pendente" | "em_lote" | "paga_simulada"): string {
  switch (status) {
    case "pendente": return "Pendente";
    case "em_lote": return "No lote";
    case "paga_simulada": return "Paga simulada";
  }
}

function itemStatusTone(status: "pendente" | "em_lote" | "paga_simulada"): DemoTone {
  switch (status) {
    case "paga_simulada": return "positive";
    case "em_lote": return "info";
    default: return "warning";
  }
}

export default function DemoPaymentsPage() {
  const { state, createInterviewerBatch, payInterviewerBatch } = useDemoStore();
  const today = todayInSaoPaulo();
  const [projectFilter, setProjectFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState(today);
  const [confirmingTitleId, setConfirmingTitleId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const pendingItems = useMemo(
    () => state.interviewerItems.filter(item => item.status === "pendente"),
    [state.interviewerItems],
  );
  const visiblePendingItems = useMemo(
    () => pendingItems.filter(item => projectFilter === "all" || item.projectId === projectFilter),
    [pendingItems, projectFilter],
  );
  const selectedItems = useMemo(
    () => visiblePendingItems.filter(item => selectedIds.includes(item.id) && item.projectId === projectFilter),
    [projectFilter, selectedIds, visiblePendingItems],
  );
  const interviewerTitles = useMemo(
    () => state.titles.filter(title => title.source === "interviewer"),
    [state.titles],
  );
  const pendingTotal = sumCents(pendingItems.map(item => item.amountCents));
  const visiblePendingTotal = sumCents(visiblePendingItems.map(item => item.amountCents));
  const selectedTotal = sumCents(selectedItems.map(item => item.amountCents));
  const batchTotal = sumCents(interviewerTitles.map(title => title.amountCents));
  const batchPendingTotal = sumCents(interviewerTitles.map(title => pendingCents(title)));
  const selectedProject = projectFilter === "all" ? undefined : projectById(state, projectFilter);
  const canCreateBatch = Boolean(selectedProject && selectedItems.length > 0 && dueDate);

  function handleProjectChange(value: string) {
    setProjectFilter(value);
    setSelectedIds([]);
    setFeedback(null);
  }

  function toggleItem(itemId: string) {
    setSelectedIds(current => current.includes(itemId)
      ? current.filter(id => id !== itemId)
      : [...current, itemId]);
    setFeedback(null);
  }

  function handleCreateBatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedProject || !selectedItems.length) {
      setFeedback({ role: "alert", tone: "warning", message: "Selecione um projeto e pelo menos um item DEMO pendente do mesmo projeto." });
      return;
    }
    const itemIds = selectedItems.map(item => item.id);
    const exactTotal = sumCents(selectedItems.map(item => item.amountCents));
    const result = createInterviewerBatch(selectedProject.id, itemIds, dueDate);
    if (!result.ok) {
      setFeedback({ role: "alert", tone: "danger", message: result.message });
      return;
    }
    setSelectedIds([]);
    setFeedback({
      role: "status",
      tone: "positive",
      message: `Lote DEMO criado localmente com ${selectedItems.length} item(ns) e total exato de ${formatBrl(exactTotal)}.`,
    });
  }

  function confirmPayment(titleId: string) {
    const result = payInterviewerBatch(titleId, todayInSaoPaulo());
    if (!result.ok) {
      setFeedback({ role: "alert", tone: "danger", message: result.message });
      setConfirmingTitleId(null);
      return;
    }
    setConfirmingTitleId(null);
    setFeedback({
      role: "status",
      tone: "positive",
      message: `Pagamento marcado como pago simulado e evento local criado. ${SIMULATION_NOTICE}.`,
    });
  }

  return (
    <DemoPageShell
      module="Pagamentos"
      title="Pagamento de entrevistadores"
      description="Monte lotes demonstrativos por projeto, confira a soma dos itens e simule a liquidação local."
    >
      <section aria-labelledby="interviewer-payment-overview">
        <h2 id="interviewer-payment-overview" className="sr-only">Resumo de pagamentos de entrevistadores</h2>
        <div className="demo-grid demo-grid-4">
          <article className="demo-card">
            <span className="demo-label">Itens DEMO pendentes</span>
            <strong>{pendingItems.length}</strong>
            <small>{formatBrl(pendingTotal)} no total</small>
          </article>
          <article className="demo-card">
            <span className="demo-label">Itens no filtro</span>
            <strong>{visiblePendingItems.length}</strong>
            <small>{formatBrl(visiblePendingTotal)} disponíveis</small>
          </article>
          <article className="demo-card">
            <span className="demo-label">Itens selecionados</span>
            <strong>{selectedItems.length}</strong>
            <small>{formatBrl(selectedTotal)} no lote atual</small>
          </article>
          <article className="demo-card">
            <span className="demo-label">Lotes DEMO</span>
            <strong>{interviewerTitles.length}</strong>
            <small>{formatBrl(batchPendingTotal)} pendentes</small>
          </article>
        </div>
      </section>

      {feedback ? (
        <p className={`demo-status demo-status-${feedback.tone}`} role={feedback.role}>
          {feedback.message}
        </p>
      ) : null}

      <div className="demo-grid demo-grid-2">
        <DemoPanel
          title="1. Montar lote"
          subtitle="Filtre por projeto e selecione somente itens DEMO ainda pendentes."
        >
          <form className="demo-form" onSubmit={handleCreateBatch}>
            <div className="demo-field">
              <label className="demo-label" htmlFor="interviewer-project">Projeto do lote</label>
              <select
                id="interviewer-project"
                className="demo-select"
                value={projectFilter}
                onChange={event => handleProjectChange(event.target.value)}
              >
                <option value="all">Todos os projetos (selecione um projeto para montar)</option>
                {state.projects.map(project => (
                  <option key={project.id} value={project.id}>
                    {project.code} · {project.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="demo-grid demo-grid-3">
              <div className="demo-field">
                <span className="demo-label">Projeto selecionado</span>
                <strong>{selectedProject ? `${selectedProject.code} · ${selectedProject.name}` : "Nenhum projeto selecionado"}</strong>
              </div>
              <div className="demo-field">
                <span className="demo-label">Itens disponíveis</span>
                <strong>{visiblePendingItems.length} · {formatBrl(visiblePendingTotal)}</strong>
              </div>
              <div className="demo-field">
                <span className="demo-label">Total exato selecionado</span>
                <strong>{formatBrl(selectedTotal)}</strong>
              </div>
            </div>

            <div className="demo-field">
              <label className="demo-label" htmlFor="interviewer-due-date">Vencimento do lote</label>
              <input
                id="interviewer-due-date"
                className="demo-input"
                type="date"
                value={dueDate}
                min={today}
                onChange={event => setDueDate(event.target.value)}
              />
            </div>

            <div className="demo-table-wrap">
              <table className="demo-table">
                <caption>Itens DEMO pendentes para o filtro selecionado</caption>
                <thead>
                  <tr>
                    <th scope="col">Selecionar</th>
                    <th scope="col">Entrevistador</th>
                    <th scope="col">Projeto</th>
                    <th scope="col">Vencimento</th>
                    <th scope="col">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePendingItems.map(item => {
                    const project = projectById(state, item.projectId);
                    const selectionDisabled = projectFilter === "all";
                    return (
                      <tr key={item.id}>
                        <td>
                          <label className="demo-label" htmlFor={`interviewer-item-${item.id}`}>
                            <input
                              id={`interviewer-item-${item.id}`}
                              className="demo-input"
                              type="checkbox"
                              checked={selectedIds.includes(item.id)}
                              disabled={selectionDisabled}
                              onChange={() => toggleItem(item.id)}
                              aria-label={`Selecionar ${item.label}`}
                            />
                            <span>{selectedIds.includes(item.id) ? "Selecionado" : "Selecionar"}</span>
                          </label>
                        </td>
                        <td>{item.label}</td>
                        <td>{project ? `${project.code} · ${project.name}` : "—"}</td>
                        <td>{formatDemoDate(item.dueDate)}</td>
                        <td>{formatBrl(item.amountCents)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {projectFilter === "all" && visiblePendingItems.length > 0 ? (
              <p className="demo-status demo-status-info" role="status">
                Selecione um único projeto acima para habilitar a escolha dos itens e preservar a regra de mesmo projeto.
              </p>
            ) : null}
            {!visiblePendingItems.length ? (
              <DemoEmpty title="Nenhum item DEMO pendente neste filtro.">
                Os itens já podem estar em lote ou pagos na simulação local.
              </DemoEmpty>
            ) : null}

            <div className="demo-actions">
              <button className="demo-button" type="submit" disabled={!canCreateBatch}>
                Criar lote DEMO · {formatBrl(selectedTotal)}
              </button>
              <span className="demo-label">A soma usa centavos inteiros e precisa fechar exatamente.</span>
            </div>
          </form>
        </DemoPanel>

        <DemoPanel
          title="2. Lotes criados"
          subtitle="Títulos com source interviewer e seus itens associados."
        >
          {!interviewerTitles.length ? (
            <DemoEmpty title="Ainda não há lotes de entrevistadores.">
              Crie um lote na etapa anterior para acompanhar o título DEMO.
            </DemoEmpty>
          ) : (
            <div className="demo-grid demo-grid-2">
              {interviewerTitles.map(title => {
                const project = projectById(state, title.projectId);
                const associatedItems = state.interviewerItems.filter(item => item.batchTitleId === title.id);
                const status = titleStatus(title, today);
                const canPay = associatedItems.some(item => item.status === "em_lote") && pendingCents(title) > 0;
                const isConfirming = confirmingTitleId === title.id;
                return (
                  <article className="demo-card" key={title.id}>
                    <div className="demo-card-heading">
                      <div>
                        <h3>{title.description}</h3>
                        <p>{project ? `${project.code} · ${project.name}` : "Projeto DEMO não localizado"}</p>
                      </div>
                      <DemoStatus tone={titleStatusTone(status)}>{titleStatusLabel(status)}</DemoStatus>
                    </div>
                    <div className="demo-grid demo-grid-3">
                      <div className="demo-field">
                        <span className="demo-label">Total do lote</span>
                        <strong>{formatBrl(title.amountCents)}</strong>
                      </div>
                      <div className="demo-field">
                        <span className="demo-label">Saldo pendente</span>
                        <strong>{formatBrl(pendingCents(title))}</strong>
                      </div>
                      <div className="demo-field">
                        <span className="demo-label">Vencimento</span>
                        <strong>{formatDemoDate(title.dueDate)}</strong>
                      </div>
                    </div>

                    <div className="demo-table-wrap">
                      <table className="demo-table">
                        <caption>Itens associados ao lote {title.description}</caption>
                        <thead>
                          <tr>
                            <th scope="col">Entrevistador</th>
                            <th scope="col">Status</th>
                            <th scope="col">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {associatedItems.map(item => (
                            <tr key={item.id}>
                              <td>{item.label}</td>
                              <td><DemoStatus tone={itemStatusTone(item.status)}>{itemStatusLabel(item.status)}</DemoStatus></td>
                              <td>{formatBrl(item.amountCents)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {isConfirming ? (
                      <div className="demo-actions" role="alert">
                        <p className="demo-status demo-status-warning">
                          Confirme a liquidação deste lote. {SIMULATION_NOTICE}.
                        </p>
                        <button className="demo-button" type="button" onClick={() => confirmPayment(title.id)}>
                          Confirmar pagamento simulado
                        </button>
                        <button className="demo-button" type="button" onClick={() => setConfirmingTitleId(null)}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="demo-actions">
                        <button
                          className="demo-button"
                          type="button"
                          disabled={!canPay}
                          onClick={() => {
                            setFeedback(null);
                            setConfirmingTitleId(title.id);
                          }}
                        >
                          Pagar lote (simulação local)
                        </button>
                        <span className="demo-label">
                          {canPay ? `${formatBrl(pendingCents(title))} será liquidado localmente.` : "Lote já pago ou sem itens em lote."}
                        </span>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </DemoPanel>
      </div>

      <DemoPanel
        title="Conferência da simulação"
        subtitle="Nada nesta tela solicita credenciais, dados pessoais ou informações financeiras reais."
      >
        <div className="demo-grid demo-grid-3">
          <div className="demo-field">
            <span className="demo-label">Total dos títulos interviewer</span>
            <strong>{formatBrl(batchTotal)}</strong>
          </div>
          <div className="demo-field">
            <span className="demo-label">Saldo pendente dos lotes</span>
            <strong>{formatBrl(batchPendingTotal)}</strong>
          </div>
          <div className="demo-field">
            <span className="demo-label">Evento após pagamento</span>
            <strong>Local, com status paga_simulada</strong>
          </div>
        </div>
      </DemoPanel>
    </DemoPageShell>
  );
}
