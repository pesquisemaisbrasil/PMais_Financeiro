import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  CheckCircle2,
  LockKeyhole,
  ReceiptText,
  UnlockKeyhole,
} from "lucide-react";
import {
  DemoEmpty,
  DemoMetric,
  DemoPageShell,
  DemoPanel,
  DemoStatus,
} from "@/components/DemoComponents";
import { useDemoStore } from "@/contexts/DemoStore";
import { formatBrl, formatDemoDate, type DemoBankTransaction } from "@/lib/demoModel";

const CLASSIFICATIONS = ["pagamento", "recebimento", "tarifa DEMO", "outro DEMO"] as const;
type Classification = (typeof CLASSIFICATIONS)[number];
type StatusFilter = "all" | "pending" | "reconciled" | "exception";
type RowState = "pending" | "reconciled" | "exception";
type FeedbackTone = "positive" | "warning" | "danger" | "info";

type Feedback = {
  tone: FeedbackTone;
  message: string;
};

function rowState(transaction: DemoBankTransaction): RowState {
  if (!transaction.reconciled || !transaction.classification) return "pending";
  if (transaction.exceptionReason) return "exception";
  return "reconciled";
}

function periodLabel(period: string): string {
  const [year, month] = period.split("-").map(Number);
  if (!year || !month) return period;
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(Date.UTC(year, month - 1, 1, 12)));
}

function classificationFor(transaction: DemoBankTransaction): Classification {
  if (transaction.classification && CLASSIFICATIONS.includes(transaction.classification as Classification)) {
    return transaction.classification as Classification;
  }
  return transaction.flow === "entrada" ? "recebimento" : "pagamento";
}

function statusLabel(status: RowState): string {
  if (status === "reconciled") return "Conciliada";
  if (status === "exception") return "Exceção registrada";
  return "Pendente";
}

function statusTone(status: RowState): "neutral" | "positive" | "warning" | "danger" {
  if (status === "reconciled") return "positive";
  if (status === "exception") return "warning";
  return "danger";
}

function originFor(
  transaction: DemoBankTransaction,
  titles: ReturnType<typeof useDemoStore>["state"]["titles"],
): { kind: string; description: string } {
  const title = titles.find(item => item.id === transaction.originTitleId);
  if (!title) {
    return { kind: "Origem DEMO", description: "Origem sintética não localizada" };
  }
  if (title.source === "field") {
    return { kind: "Folha DEMO", description: title.description };
  }
  if (title.source === "interviewer") {
    return { kind: "Lote DEMO", description: title.description };
  }
  if (title.source === "provision") {
    return { kind: "Título DEMO · provisão", description: title.description };
  }
  return { kind: "Título DEMO", description: title.description };
}

export default function DemoReconciliationPage() {
  const { state, reconcileTransaction, markTransactionException, closePeriod, reopenPeriod } = useDemoStore();
  const monthOptions = useMemo(() => {
    const months = new Set([
      ...state.bankTransactions.map(transaction => transaction.date.slice(0, 7)),
      ...state.closedPeriods,
    ]);
    return [...months].sort((left, right) => right.localeCompare(left));
  }, [state.bankTransactions, state.closedPeriods]);
  const initialMonth = monthOptions[0] ?? "";

  const [selectedMonth, setSelectedMonth] = useState(initialMonth);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [classificationByTransaction, setClassificationByTransaction] = useState<Record<string, string>>({});
  const [localConfirmationByTransaction, setLocalConfirmationByTransaction] = useState<Record<string, boolean>>({});
  const [exceptionConfirmationByTransaction, setExceptionConfirmationByTransaction] = useState<Record<string, boolean>>({});
  const [exceptionReasonByTransaction, setExceptionReasonByTransaction] = useState<Record<string, string>>({});
  const [openExceptionId, setOpenExceptionId] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState("");
  const [reopenConfirmed, setReopenConfirmed] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  useEffect(() => {
    if (!monthOptions.length) {
      if (selectedMonth) setSelectedMonth("");
      return;
    }
    if (!monthOptions.includes(selectedMonth)) setSelectedMonth(monthOptions[0]);
  }, [monthOptions, selectedMonth]);

  useEffect(() => {
    setReopenReason("");
    setReopenConfirmed(false);
    setOpenExceptionId(null);
  }, [selectedMonth]);

  const periodTransactions = useMemo(
    () => state.bankTransactions.filter(transaction => transaction.date.startsWith(selectedMonth)),
    [selectedMonth, state.bankTransactions],
  );
  const pendingCount = periodTransactions.filter(transaction => rowState(transaction) === "pending").length;
  const exceptionCount = periodTransactions.filter(transaction => rowState(transaction) === "exception").length;
  const reconciledCount = periodTransactions.filter(transaction => rowState(transaction) === "reconciled").length;
  const totalCents = periodTransactions.reduce((total, transaction) => total + transaction.amountCents, 0);
  const isPeriodClosed = Boolean(selectedMonth) && state.closedPeriods.includes(selectedMonth);
  const canClosePeriod = Boolean(selectedMonth) && !isPeriodClosed && pendingCount === 0;

  const visibleTransactions = useMemo(() => {
    return [...periodTransactions]
      .filter(transaction => {
        if (statusFilter === "all") return true;
        if (statusFilter === "pending") return rowState(transaction) === "pending";
        if (statusFilter === "exception") return rowState(transaction) === "exception";
        return rowState(transaction) === "reconciled";
      })
      .sort((left, right) => right.date.localeCompare(left.date) || right.id.localeCompare(left.id));
  }, [periodTransactions, statusFilter]);

  const setFeedbackMessage = (tone: FeedbackTone, message: string) => {
    setFeedback({ tone, message });
  };

  const selectedClassification = (transaction: DemoBankTransaction): string => {
    return classificationByTransaction[transaction.id] ?? classificationFor(transaction);
  };

  const handleReconcile = (transaction: DemoBankTransaction) => {
    if (isPeriodClosed) {
      setFeedbackMessage("warning", "O período DEMO está fechado. Reabra-o com um motivo antes de agir sobre as linhas.");
      return;
    }
    if (transaction.reconciled) {
      setFeedbackMessage("info", "Esta linha DEMO já foi conciliada e permanece bloqueada contra dupla conciliação.");
      return;
    }
    if (!localConfirmationByTransaction[transaction.id]) {
      setFeedbackMessage("warning", "Confirme que a ação é local e usa somente dados sintéticos antes de conciliar.");
      return;
    }
    const classification = selectedClassification(transaction);
    const result = reconcileTransaction(transaction.id, classification);
    if (result.ok) {
      setFeedbackMessage("positive", "Conciliação local registrada. Nenhum extrato bancário real foi importado ou alterado.");
      setLocalConfirmationByTransaction(previous => ({ ...previous, [transaction.id]: false }));
    } else {
      setFeedbackMessage("danger", result.message);
    }
  };

  const handleExceptionSubmit = (event: FormEvent<HTMLFormElement>, transaction: DemoBankTransaction) => {
    event.preventDefault();
    if (isPeriodClosed) {
      setFeedbackMessage("warning", "O período DEMO está fechado. Reabra-o com um motivo antes de registrar uma exceção.");
      return;
    }
    if (transaction.reconciled) {
      setFeedbackMessage("info", "Esta linha DEMO já foi conciliada e não pode receber uma segunda classificação.");
      return;
    }
    const reason = exceptionReasonByTransaction[transaction.id]?.trim() ?? "";
    if (!exceptionConfirmationByTransaction[transaction.id]) {
      setFeedbackMessage("warning", "Confirme que a exceção é apenas local antes de registrá-la.");
      return;
    }
    if (!reason) {
      setFeedbackMessage("warning", "Informe o motivo da exceção DEMO para continuar.");
      return;
    }
    const result = markTransactionException(transaction.id, selectedClassification(transaction), reason);
    if (result.ok) {
      setFeedbackMessage("positive", "Exceção local registrada com motivo. A linha foi bloqueada contra dupla conciliação.");
      setOpenExceptionId(null);
      setExceptionReasonByTransaction(previous => ({ ...previous, [transaction.id]: "" }));
      setExceptionConfirmationByTransaction(previous => ({ ...previous, [transaction.id]: false }));
    } else {
      setFeedbackMessage("danger", result.message);
    }
  };

  const handleClosePeriod = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canClosePeriod) {
      setFeedbackMessage("warning", "Feche somente um período DEMO sem linhas pendentes ou não classificadas.");
      return;
    }
    const result = closePeriod(selectedMonth);
    if (result.ok) {
      setFeedbackMessage("positive", `Período ${periodLabel(selectedMonth)} fechado localmente. Novas ações ficam bloqueadas.`);
    } else {
      setFeedbackMessage("danger", result.message);
    }
  };

  const handleReopenPeriod = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reason = reopenReason.trim();
    if (!isPeriodClosed) {
      setFeedbackMessage("info", "Selecione um período DEMO fechado para reabrir.");
      return;
    }
    if (!reason) {
      setFeedbackMessage("warning", "Informe o motivo demonstrativo da reabertura.");
      return;
    }
    if (!reopenConfirmed) {
      setFeedbackMessage("warning", "Confirme que a reabertura é apenas local antes de continuar.");
      return;
    }
    const result = reopenPeriod(selectedMonth, reason);
    if (result.ok) {
      setFeedbackMessage("positive", `Período ${periodLabel(selectedMonth)} reaberto localmente com motivo registrado.`);
      setReopenReason("");
      setReopenConfirmed(false);
    } else {
      setFeedbackMessage("danger", result.message);
    }
  };

  return (
    <DemoPageShell
      module="M6"
      title="Conciliação demo"
      description="Relacione movimentos sintéticos às suas origens de título, folha ou lote sem sair do ambiente local da demonstração."
    >
      <div className="demo-card" role="note" aria-label="Limites da conciliação demo">
        <strong>Somente ações DEMO geram estes movimentos.</strong>
        <p>
          Este M6 não é Itaú, não importa extrato bancário e não realiza uma conciliação verdadeira. Os movimentos abaixo
          nascem exclusivamente de liquidações sintéticas feitas no mockup e ficam salvos apenas neste navegador.
        </p>
      </div>

      <div className="demo-grid">
        <DemoMetric
          label="Movimentos do mês"
          value={String(periodTransactions.length)}
          detail={selectedMonth ? periodLabel(selectedMonth) : "Nenhum mês selecionado"}
          icon={ReceiptText}
          tone="blue"
        />
        <DemoMetric
          label="Valor demonstrativo"
          value={formatBrl(totalCents)}
          detail="Soma dos movimentos sintéticos"
          icon={ReceiptText}
          tone="purple"
        />
        <DemoMetric
          label="Tratadas"
          value={String(reconciledCount)}
          detail={`${exceptionCount} com exceção local`}
          icon={CheckCircle2}
          tone="green"
        />
        <DemoMetric
          label="Pendências"
          value={String(pendingCount)}
          detail="Necessárias antes do fechamento"
          icon={AlertCircle}
          tone="amber"
        />
      </div>

      {feedback ? (
        <div className="demo-card" role="status" aria-live="polite">
          <DemoStatus tone={feedback.tone}>{feedback.message}</DemoStatus>
        </div>
      ) : null}

      <DemoPanel
        title="Filtros da conciliação"
        subtitle="Consulte somente movimentos DEMO criados pelo store a partir de liquidações sintéticas."
      >
        <div className="demo-form" aria-label="Filtros de movimentos demo">
          <div className="demo-field">
            <label className="demo-label" htmlFor="demo-reconciliation-month">Mês do movimento</label>
            <select
              className="demo-select"
              id="demo-reconciliation-month"
              value={selectedMonth}
              onChange={event => setSelectedMonth(event.target.value)}
            >
              {monthOptions.length ? (
                monthOptions.map(month => <option key={month} value={month}>{periodLabel(month)}</option>)
              ) : (
                <option value="">Nenhum mês disponível</option>
              )}
            </select>
          </div>
          <div className="demo-field">
            <label className="demo-label" htmlFor="demo-reconciliation-status">Estado da linha</label>
            <select
              className="demo-select"
              id="demo-reconciliation-status"
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value as StatusFilter)}
            >
              <option value="all">Todos os estados</option>
              <option value="pending">Pendentes / não classificadas</option>
              <option value="reconciled">Conciliadas</option>
              <option value="exception">Exceções locais</option>
            </select>
          </div>
          <div className="demo-field">
            <span className="demo-label">Período selecionado</span>
            <span className="demo-status" role="status">
              {isPeriodClosed ? <LockKeyhole size={14} aria-hidden="true" /> : null}
              {selectedMonth ? (isPeriodClosed ? "Fechado e bloqueado" : "Aberto para ações locais") : "Sem seleção"}
            </span>
          </div>
        </div>
      </DemoPanel>

      <DemoPanel
        title="Movimento demo × origem sintética"
        subtitle="A origem é exibida apenas para explicar a liquidação que criou cada movimento; não há upload ou leitura de extrato real."
      >
        {visibleTransactions.length ? (
          <div className="demo-table-wrap">
            <table className="demo-table">
              <caption className="sr-only">Movimentos DEMO e origem de título, folha ou lote</caption>
              <thead>
                <tr>
                  <th scope="col">Movimento DEMO</th>
                  <th scope="col">Origem sintética</th>
                  <th scope="col">Valor</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Classificação</th>
                  <th scope="col">Ação local</th>
                </tr>
              </thead>
              <tbody>
                {visibleTransactions.map(transaction => {
                  const status = rowState(transaction);
                  const origin = originFor(transaction, state.titles);
                  const controlsDisabled = transaction.reconciled || isPeriodClosed;
                  const localConfirmed = Boolean(localConfirmationByTransaction[transaction.id]);
                  const exceptionConfirmed = Boolean(exceptionConfirmationByTransaction[transaction.id]);
                  const exceptionOpen = openExceptionId === transaction.id && !transaction.reconciled;
                  const classification = selectedClassification(transaction);

                  return (
                    <tr key={transaction.id} aria-disabled={controlsDisabled || undefined}>
                      <th scope="row">
                        <strong>{transaction.description}</strong>
                        <span>{formatDemoDate(transaction.date)} · {transaction.flow === "entrada" ? "Entrada" : "Saída"}</span>
                      </th>
                      <td>
                        <strong>{origin.kind}</strong>
                        <span>{origin.description}</span>
                      </td>
                      <td><strong>{formatBrl(transaction.amountCents)}</strong></td>
                      <td>
                        <DemoStatus tone={statusTone(status)}>{statusLabel(status)}</DemoStatus>
                        {transaction.exceptionReason ? <small>Motivo: {transaction.exceptionReason}</small> : null}
                      </td>
                      <td>
                        {transaction.classification ? (
                          <span>{transaction.classification}</span>
                        ) : (
                          <span aria-label="Sem classificação">Não classificada</span>
                        )}
                      </td>
                      <td>
                        {transaction.reconciled ? (
                          <div className="demo-actions">
                            <DemoStatus tone="neutral">
                              <LockKeyhole size={13} aria-hidden="true" /> Linha bloqueada
                            </DemoStatus>
                          </div>
                        ) : (
                          <div className="demo-form">
                            <div className="demo-field">
                              <label className="demo-label" htmlFor={`classification-${transaction.id}`}>Classificação para esta ação</label>
                              <select
                                className="demo-select"
                                id={`classification-${transaction.id}`}
                                value={classification}
                                disabled={controlsDisabled}
                                onChange={event => setClassificationByTransaction(previous => ({
                                  ...previous,
                                  [transaction.id]: event.target.value,
                                }))}
                              >
                                {CLASSIFICATIONS.map(option => <option key={option} value={option}>{option}</option>)}
                              </select>
                            </div>
                            <label className="demo-label" htmlFor={`local-confirmation-${transaction.id}`}>
                              <input
                                className="demo-input"
                                id={`local-confirmation-${transaction.id}`}
                                type="checkbox"
                                checked={localConfirmed}
                                disabled={controlsDisabled}
                                onChange={event => setLocalConfirmationByTransaction(previous => ({
                                  ...previous,
                                  [transaction.id]: event.target.checked,
                                }))}
                              />
                              Confirmo que esta ação é apenas local e usa dados sintéticos.
                            </label>
                            <div className="demo-actions">
                              <button
                                className="demo-button"
                                type="button"
                                disabled={controlsDisabled || !localConfirmed}
                                onClick={() => handleReconcile(transaction)}
                              >
                                <CheckCircle2 size={15} aria-hidden="true" /> Conciliar localmente
                              </button>
                              <button
                                className="demo-button"
                                type="button"
                                disabled={controlsDisabled}
                                aria-expanded={exceptionOpen}
                                aria-controls={`exception-${transaction.id}`}
                                onClick={() => setOpenExceptionId(exceptionOpen ? null : transaction.id)}
                              >
                                <AlertCircle size={15} aria-hidden="true" /> Registrar exceção
                              </button>
                            </div>
                            {exceptionOpen ? (
                              <form
                                className="demo-form"
                                id={`exception-${transaction.id}`}
                                onSubmit={event => handleExceptionSubmit(event, transaction)}
                              >
                                <div className="demo-field">
                                  <label className="demo-label" htmlFor={`exception-reason-${transaction.id}`}>Motivo da exceção DEMO</label>
                                  <textarea
                                    className="demo-input"
                                    id={`exception-reason-${transaction.id}`}
                                    value={exceptionReasonByTransaction[transaction.id] ?? ""}
                                    disabled={controlsDisabled}
                                    onChange={event => setExceptionReasonByTransaction(previous => ({
                                      ...previous,
                                      [transaction.id]: event.target.value,
                                    }))}
                                    placeholder="Ex.: tarifa sintética sem título correspondente"
                                    rows={3}
                                    required
                                  />
                                </div>
                                <label className="demo-label" htmlFor={`exception-confirmation-${transaction.id}`}>
                                  <input
                                    className="demo-input"
                                    id={`exception-confirmation-${transaction.id}`}
                                    type="checkbox"
                                    checked={exceptionConfirmed}
                                    disabled={controlsDisabled}
                                    onChange={event => setExceptionConfirmationByTransaction(previous => ({
                                      ...previous,
                                      [transaction.id]: event.target.checked,
                                    }))}
                                  />
                                  Confirmo que a exceção será registrada somente neste mockup local.
                                </label>
                                <div className="demo-actions">
                                  <button
                                    className="demo-button"
                                    type="submit"
                                    disabled={controlsDisabled || !exceptionConfirmed}
                                  >
                                    Confirmar exceção local
                                  </button>
                                  <button
                                    className="demo-button"
                                    type="button"
                                    onClick={() => setOpenExceptionId(null)}
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </form>
                            ) : null}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <DemoEmpty title="Nenhum movimento DEMO encontrado">
            {selectedMonth
              ? "Ajuste o filtro de estado ou gere uma liquidação sintética em outro módulo da demonstração."
              : "As liquidações sintéticas ainda não geraram movimentos para este mockup."}
          </DemoEmpty>
        )}
      </DemoPanel>

      <DemoPanel
        title="Fechamento do período"
        subtitle="O fechamento só é habilitado quando todas as linhas do mês estão conciliadas ou classificadas como exceção."
      >
        <div className="demo-grid">
          <form className="demo-form" onSubmit={handleClosePeriod}>
            <div className="demo-field">
              <label className="demo-label" htmlFor="demo-period-to-close">Período YYYY-MM</label>
              <select
                className="demo-select"
                id="demo-period-to-close"
                value={selectedMonth}
                onChange={event => setSelectedMonth(event.target.value)}
                disabled={!monthOptions.length}
              >
                {monthOptions.length ? (
                  monthOptions.map(month => <option key={month} value={month}>{month} · {periodLabel(month)}</option>)
                ) : (
                  <option value="">Nenhum período disponível</option>
                )}
              </select>
            </div>
            <div className="demo-field">
              <span className="demo-label">Elegibilidade</span>
              <DemoStatus tone={isPeriodClosed ? "info" : pendingCount ? "warning" : "positive"}>
                {isPeriodClosed ? <LockKeyhole size={14} aria-hidden="true" /> : null}
                {isPeriodClosed ? "Período fechado" : pendingCount ? `${pendingCount} pendência(s) bloqueiam` : "Sem pendências"}
              </DemoStatus>
            </div>
            <div className="demo-actions">
              <button className="demo-button" type="submit" disabled={!canClosePeriod}>
                <LockKeyhole size={15} aria-hidden="true" /> Fechar período local
              </button>
            </div>
          </form>

          <form className="demo-form" onSubmit={handleReopenPeriod}>
            <div className="demo-field">
              <label className="demo-label" htmlFor="demo-reopen-reason">Motivo da reabertura</label>
              <textarea
                className="demo-input"
                id="demo-reopen-reason"
                value={reopenReason}
                onChange={event => setReopenReason(event.target.value)}
                disabled={!isPeriodClosed}
                placeholder={isPeriodClosed ? "Descreva o motivo demonstrativo" : "Disponível somente para período fechado"}
                rows={3}
                required
              />
            </div>
            <label className="demo-label" htmlFor="demo-reopen-confirmation">
              <input
                className="demo-input"
                id="demo-reopen-confirmation"
                type="checkbox"
                checked={reopenConfirmed}
                disabled={!isPeriodClosed}
                onChange={event => setReopenConfirmed(event.target.checked)}
              />
              Confirmo que a reabertura é somente local e exige este motivo.
            </label>
            <div className="demo-actions">
              <button
                className="demo-button"
                type="submit"
                disabled={!isPeriodClosed || !reopenReason.trim() || !reopenConfirmed}
              >
                <UnlockKeyhole size={15} aria-hidden="true" /> Reabrir período DEMO
              </button>
            </div>
          </form>
        </div>
        <p className="demo-label">
          <LockKeyhole size={14} aria-hidden="true" /> Período fechado bloqueia conciliação e exceções na tela. A reabertura
          chama o store somente com motivo informado e confirmação local.
        </p>
      </DemoPanel>
    </DemoPageShell>
  );
}
