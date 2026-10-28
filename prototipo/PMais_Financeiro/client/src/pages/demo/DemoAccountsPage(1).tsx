import { confirmDemo } from "@/lib/demoConfirm";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Plus,
  ReceiptText,
  Search,
  WalletCards,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import {
  DemoEmpty,
  DemoMetric,
  DemoPageShell,
  DemoPanel,
  DemoStatus,
} from "@/components/DemoComponents";
import { useDemoStore } from "@/contexts/DemoStore";
import {
  categoryById,
  formatBrl,
  formatDemoDate,
  parseBrlToCents,
  partyById,
  pendingCents,
  projectById,
  settledCents,
  titleStatus,
  todayInSaoPaulo,
  type DemoDirection,
  type DemoTitle,
  type DemoTitleStatus,
} from "@/lib/demoModel";

type TitleForm = {
  direction: DemoDirection;
  partyId: string;
  categoryId: string;
  centerId: string;
  projectId: string;
  description: string;
  issueDate: string;
  competenceDate: string;
  dueDate: string;
  amount: string;
};

type Feedback = { tone: "success" | "error"; message: string };
type StatusFilter = "todos" | DemoTitleStatus;

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: "todos", label: "Todos os status" },
  { value: "em_aberto", label: "Em aberto" },
  { value: "parcial", label: "Parcial" },
  { value: "vencido", label: "Vencido" },
  { value: "vence_hoje", label: "Vence hoje" },
  { value: "a_vencer", label: "A vencer" },
  { value: "liquidado_simulado", label: "Liquidado (simulado)" },
];

const sourceLabels: Record<DemoTitle["source"], string> = {
  manual: "Manual",
  provision: "Provisão",
  interviewer: "Entrevistadores",
  field: "Campo",
};

function createInitialTitleForm(direction: DemoDirection = "pagar"): TitleForm {
  const today = todayInSaoPaulo();
  return {
    direction,
    partyId: "",
    categoryId: "",
    centerId: "",
    projectId: "",
    description: "",
    issueDate: today,
    competenceDate: today,
    dueDate: today,
    amount: "",
  };
}

function statusLabel(status: DemoTitleStatus): string {
  switch (status) {
    case "em_aberto":
      return "Em aberto";
    case "parcial":
      return "Parcial";
    case "vencido":
      return "Vencido";
    case "vence_hoje":
      return "Vence hoje";
    case "liquidado_simulado":
      return "Liquidado (simulado)";
    case "a_vencer":
      return "A vencer";
  }
}

function statusTone(
  status: DemoTitleStatus
): "neutral" | "positive" | "warning" | "danger" | "info" {
  switch (status) {
    case "liquidado_simulado":
      return "positive";
    case "parcial":
      return "info";
    case "vencido":
      return "danger";
    case "vence_hoje":
      return "warning";
    default:
      return "neutral";
  }
}

function directionLabel(direction: DemoDirection): string {
  return direction === "pagar" ? "Pagar" : "Receber";
}

function DemoSettlementHistory({ title }: { title: DemoTitle }) {
  const settled = settledCents(title);
  return (
    <details className="demo-history" open={title.settlements.length > 0}>
      <summary>Histórico de liquidações ({title.settlements.length})</summary>
      {title.settlements.length ? (
        <ul className="demo-history-list">
          {title.settlements.map(settlement => (
            <li key={settlement.id}>
              <span>
                <strong>{formatBrl(settlement.amountCents)}</strong> em{" "}
                {formatDemoDate(settlement.date)}
              </span>
              <small>
                Liquidação local <span aria-hidden="true">•</span> linha de
                extrato {settlement.bankTransactionId}
              </small>
            </li>
          ))}
          <li className="demo-history-total">
            <span>
              <strong>Total liquidado</strong>
            </span>
            <strong>{formatBrl(settled)}</strong>
          </li>
        </ul>
      ) : (
        <p className="demo-history-empty">
          Nenhuma liquidação registrada neste título.
        </p>
      )}
    </details>
  );
}

export default function DemoAccountsPage() {
  const { state, addTitle, settleTitle, resolveDemoDocument } = useDemoStore();
  const [titleForm, setTitleForm] = useState<TitleForm>(() =>
    createInitialTitleForm()
  );
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [search, setSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState<
    "todos" | DemoDirection
  >("todos");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [projectFilter, setProjectFilter] = useState("todos");
  const [settlementTitleId, setSettlementTitleId] = useState<string | null>(
    null
  );
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementDate, setSettlementDate] = useState(() => todayInSaoPaulo());
  const [settlementConfirmed, setSettlementConfirmed] = useState(false);

  const activeParties = useMemo(() => {
    const expectedType =
      titleForm.direction === "pagar" ? "fornecedor" : "cliente";
    return state.parties.filter(
      party => party.active && party.type === expectedType
    );
  }, [state.parties, titleForm.direction]);

  const activeCategories = useMemo(() => {
    const expectedType =
      titleForm.direction === "pagar" ? "despesa" : "receita";
    return state.categories.filter(
      category => category.active && category.type === expectedType
    );
  }, [state.categories, titleForm.direction]);

  const activeProjects = useMemo(
    () => state.projects.filter(project => project.status === "ativo"),
    [state.projects]
  );

  const visibleTitles = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return state.titles.filter(title => {
      const party = partyById(state, title.partyId);
      const project = projectById(state, title.projectId);
      const category = categoryById(state, title.categoryId);
      const status = titleStatus(title);
      const searchable = [
        title.description,
        party?.name,
        project?.name,
        project?.code,
        category?.name,
        category?.code,
        sourceLabels[title.source],
        title.sourceId,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase();

      if (normalizedSearch && !searchable.includes(normalizedSearch))
        return false;
      if (directionFilter !== "todos" && title.direction !== directionFilter)
        return false;
      if (statusFilter !== "todos" && status !== statusFilter) return false;
      if (projectFilter === "none" && title.projectId !== null) return false;
      if (
        projectFilter !== "todos" &&
        projectFilter !== "none" &&
        title.projectId !== projectFilter
      )
        return false;
      return true;
    });
  }, [directionFilter, projectFilter, search, state, statusFilter]);

  const totals = useMemo(
    () =>
      visibleTitles.reduce(
        (summary, title) => ({
          settled: summary.settled + settledCents(title),
          pending: summary.pending + pendingCents(title),
        }),
        { settled: 0, pending: 0 }
      ),
    [visibleTitles]
  );

  const selectedSettlementTitle = settlementTitleId
    ? (state.titles.find(title => title.id === settlementTitleId) ?? null)
    : null;
  const parsedSettlementAmount = parseBrlToCents(settlementAmount);
  const settlementBalance = selectedSettlementTitle
    ? pendingCents(selectedSettlementTitle)
    : 0;
  const settlementAmountTooHigh =
    parsedSettlementAmount !== null &&
    parsedSettlementAmount > settlementBalance;
  const settlementReady = Boolean(
    selectedSettlementTitle &&
      parsedSettlementAmount !== null &&
      parsedSettlementAmount <= settlementBalance &&
      selectedSettlementTitle.fiscalDocument !== "aguardando_demo" &&
      (!(selectedSettlementTitle.source === "field" || selectedSettlementTitle.source === "interviewer") || parsedSettlementAmount === settlementBalance) &&
      settlementDate &&
      settlementConfirmed
  );

  function updateTitleForm(field: keyof TitleForm, value: string) {
    setTitleForm(current => ({ ...current, [field]: value }) as TitleForm);
  }

  function handleDirectionChange(direction: DemoDirection) {
    setTitleForm(current => ({
      ...current,
      direction,
      partyId: "",
      categoryId: "",
    }));
  }

  function handleCreateTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    const amountCents = parseBrlToCents(titleForm.amount);
    if (!titleForm.description.trim()) {
      setFeedback({
        tone: "error",
        message: "Informe uma descrição para o título demo.",
      });
      return;
    }
    if (!titleForm.partyId || !titleForm.categoryId) {
      setFeedback({
        tone: "error",
        message:
          "Selecione a contraparte e a categoria correspondentes à direção escolhida.",
      });
      return;
    }
    if (
      !titleForm.issueDate ||
      !titleForm.competenceDate ||
      !titleForm.dueDate
    ) {
      setFeedback({
        tone: "error",
        message: "Informe as datas de emissão, competência e vencimento.",
      });
      return;
    }
    if (amountCents === null) {
      setFeedback({
        tone: "error",
        message: "Informe um valor em reais válido, por exemplo: 1.250,00.",
      });
      return;
    }

    const result = addTitle({
      direction: titleForm.direction,
      description: titleForm.description,
      partyId: titleForm.partyId,
      projectId: titleForm.projectId || null,
      categoryId: titleForm.categoryId,
      centerId: titleForm.centerId || null,
      issueDate: titleForm.issueDate,
      competenceDate: titleForm.competenceDate,
      dueDate: titleForm.dueDate,
      amountCents,
    });
    if (!result.ok) {
      setFeedback({ tone: "error", message: result.message });
      return;
    }

    setFeedback({
      tone: "success",
      message:
        "Título demo criado localmente. Nenhuma operação real foi realizada.",
    });
    setTitleForm(current => createInitialTitleForm(current.direction));
  }

  function openSettlement(title: DemoTitle) {
    setFeedback(null);
    setSettlementTitleId(title.id);
    setSettlementAmount("");
    setSettlementDate(todayInSaoPaulo());
    setSettlementConfirmed(false);
  }

  function closeSettlement() {
    setSettlementTitleId(null);
    setSettlementAmount("");
    setSettlementConfirmed(false);
  }

  async function handleSettleTitle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    if (!selectedSettlementTitle) {
      setFeedback({
        tone: "error",
        message: "Selecione um título demo pendente para registrar uma baixa.",
      });
      return;
    }
    const amountCents = parseBrlToCents(settlementAmount);
    const balance = pendingCents(selectedSettlementTitle);
    if (amountCents === null) {
      setFeedback({
        tone: "error",
        message: "Informe um valor de baixa válido.",
      });
      return;
    }
    if (amountCents > balance) {
      setFeedback({
        tone: "error",
        message: `A baixa não pode exceder o saldo pendente de ${formatBrl(balance)}.`,
      });
      return;
    }
    if (!settlementDate) {
      setFeedback({
        tone: "error",
        message: "Informe a data da baixa simulada.",
      });
      return;
    }
    if (!settlementConfirmed) {
      setFeedback({
        tone: "error",
        message:
          "Marque a confirmação explícita antes de registrar a baixa local.",
      });
      return;
    }
    if (
      !(await confirmDemo(
        "Confirmar esta baixa somente na simulação local? Nenhum pagamento ou recebimento real será feito."
      ))
    ) {
      setFeedback({
        tone: "error",
        message: "Baixa cancelada. Nenhum registro foi alterado.",
      });
      return;
    }

    const result = settleTitle(
      selectedSettlementTitle.id,
      amountCents,
      settlementDate
    );
    if (!result.ok) {
      setFeedback({ tone: "error", message: result.message });
      return;
    }
    setFeedback({
      tone: "success",
      message:
        "Liquidação simulada registrada. O store criou uma linha de extrato local.",
    });
    closeSettlement();
  }

  function clearFilters() {
    setSearch("");
    setDirectionFilter("todos");
    setStatusFilter("todos");
    setProjectFilter("todos");
  }

  return (
    <DemoPageShell
      module="M3"
      title="Contas a pagar / receber"
      description="Controle títulos demo, acompanhe saldos e simule liquidações sem movimentar dinheiro real."
    >
      <div className="demo-grid">
        <DemoMetric
          label="Títulos exibidos"
          value={String(visibleTitles.length)}
          detail={
            state.titles.length === visibleTitles.length
              ? "Base demo completa"
              : `de ${state.titles.length} títulos`
          }
          icon={ReceiptText}
          tone="blue"
        />
        <DemoMetric
          label="Saldo pendente"
          value={formatBrl(totals.pending)}
          detail="A pagar ou receber"
          icon={WalletCards}
          tone="amber"
        />
        <DemoMetric
          label="Total liquidado"
          value={formatBrl(totals.settled)}
          detail="Somente simulações"
          icon={CheckCircle2}
          tone="green"
        />
      </div>

      {feedback ? (
        <div
          className={`demo-feedback demo-feedback-${feedback.tone}`}
          role={feedback.tone === "error" ? "alert" : "status"}
          aria-live="polite"
          aria-atomic="true"
        >
          {feedback.message}
        </div>
      ) : null}

      <DemoPanel
        title="Novo título demo"
        subtitle="A contraparte e a categoria são limitadas aos cadastros ativos e compatíveis com a direção."
      >
        <form className="demo-form" onSubmit={handleCreateTitle}>
          <div className="demo-field">
            <label className="demo-label" htmlFor="demo-title-direction">
              Direção
            </label>
            <select
              id="demo-title-direction"
              className="demo-select"
              value={titleForm.direction}
              onChange={event =>
                handleDirectionChange(
                  event.currentTarget.value as DemoDirection
                )
              }
            >
              <option value="pagar">Pagar (saída)</option>
              <option value="receber">Receber (entrada)</option>
            </select>
          </div>
          <div className="demo-field">
            <label className="demo-label" htmlFor="demo-title-party">
              Contraparte ativa
            </label>
            <select
              id="demo-title-party"
              className="demo-select"
              required
              value={titleForm.partyId}
              onChange={event =>
                updateTitleForm("partyId", event.currentTarget.value)
              }
            >
              <option value="" disabled>
                Selecione{" "}
                {titleForm.direction === "pagar"
                  ? "um fornecedor"
                  : "um cliente"}
              </option>
              {activeParties.map(party => (
                <option key={party.id} value={party.id}>
                  {party.name}
                </option>
              ))}
            </select>
          </div>
          <div className="demo-field">
            <label className="demo-label" htmlFor="demo-title-category">
              Categoria correspondente
            </label>
            <select
              id="demo-title-category"
              className="demo-select"
              required
              value={titleForm.categoryId}
              onChange={event =>
                updateTitleForm("categoryId", event.currentTarget.value)
              }
            >
              <option value="" disabled>
                Selecione uma categoria de{" "}
                {titleForm.direction === "pagar" ? "despesa" : "receita"}
              </option>
              {activeCategories.map(category => (
                <option key={category.id} value={category.id}>
                  {category.code} · {category.name}
                </option>
              ))}
            </select>
          </div>
          <div className="demo-field">
            <label className="demo-label" htmlFor="demo-title-project">
              Projeto ativo (opcional)
            </label>
            <select
              id="demo-title-project"
              className="demo-select"
              value={titleForm.projectId}
              onChange={event =>
                updateTitleForm("projectId", event.currentTarget.value)
              }
            >
              <option value="">Sem projeto</option>
              {activeProjects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.code} · {project.name}
                </option>
              ))}
            </select>
          </div>
          <div className="demo-field">
            <label className="demo-label" htmlFor="demo-title-center">Centro de custo DEMO</label>
            <select id="demo-title-center" className="demo-select" value={titleForm.centerId} onChange={event => updateTitleForm("centerId", event.target.value)}>
              <option value="">Centro ativo padrão</option>
              {state.centers.filter(item => item.active).map(center => <option key={center.id} value={center.id}>{center.code} · {center.name}</option>)}
            </select>
          </div>
          <div className="demo-field demo-field-wide">
            <label className="demo-label" htmlFor="demo-title-description">
              Descrição
            </label>
            <input
              id="demo-title-description"
              className="demo-input"
              required
              value={titleForm.description}
              onChange={event =>
                updateTitleForm("description", event.currentTarget.value)
              }
              placeholder="Ex.: mensalidade de plataforma"
            />
          </div>
          <div className="demo-field">
            <label className="demo-label" htmlFor="demo-title-amount">
              Valor
            </label>
            <input
              id="demo-title-amount"
              className="demo-input"
              required
              inputMode="decimal"
              value={titleForm.amount}
              onChange={event =>
                updateTitleForm("amount", event.currentTarget.value)
              }
              placeholder="R$ 0,00"
              aria-describedby="demo-title-amount-help"
            />
            <small id="demo-title-amount-help" className="demo-help">
              Use reais, como 1.250,00.
            </small>
          </div>
          <div className="demo-field">
            <label className="demo-label" htmlFor="demo-title-issue-date">
              Data de emissão
            </label>
            <input
              id="demo-title-issue-date"
              className="demo-input"
              required
              type="date"
              value={titleForm.issueDate}
              onChange={event =>
                updateTitleForm("issueDate", event.currentTarget.value)
              }
            />
          </div>
          <div className="demo-field">
            <label className="demo-label" htmlFor="demo-title-competence-date">
              Data de competência
            </label>
            <input
              id="demo-title-competence-date"
              className="demo-input"
              required
              type="date"
              value={titleForm.competenceDate}
              onChange={event =>
                updateTitleForm("competenceDate", event.currentTarget.value)
              }
            />
          </div>
          <div className="demo-field">
            <label className="demo-label" htmlFor="demo-title-due-date">
              Data de vencimento
            </label>
            <input
              id="demo-title-due-date"
              className="demo-input"
              required
              type="date"
              value={titleForm.dueDate}
              onChange={event =>
                updateTitleForm("dueDate", event.currentTarget.value)
              }
            />
          </div>
          <div className="demo-actions demo-form-actions">
            <button className="demo-button demo-button-primary" type="submit">
              <Plus size={16} aria-hidden="true" /> Criar título demo
            </button>
          </div>
        </form>
        <p className="demo-note">
          <strong>simulação • nenhum pagamento/recebimento real</strong>. Este
          cadastro permanece local neste navegador.
        </p>
      </DemoPanel>

      <DemoPanel
        title="Filtros e títulos"
        subtitle="Pesquise por descrição, contraparte, projeto, categoria ou identificador de origem."
        actions={
          visibleTitles.length ? (
            <span className="demo-count">
              {visibleTitles.length} resultado(s)
            </span>
          ) : null
        }
      >
        <div
          className="demo-form demo-filter-form"
          role="search"
          aria-label="Filtros de títulos demo"
        >
          <div className="demo-field demo-field-wide">
            <label className="demo-label" htmlFor="demo-title-search">
              <Search size={14} aria-hidden="true" /> Buscar
            </label>
            <input
              id="demo-title-search"
              className="demo-input"
              type="search"
              value={search}
              onChange={event => setSearch(event.currentTarget.value)}
              placeholder="Descrição, contraparte ou projeto"
            />
          </div>
          <div className="demo-field">
            <label className="demo-label" htmlFor="demo-direction-filter">
              Direção
            </label>
            <select
              id="demo-direction-filter"
              className="demo-select"
              value={directionFilter}
              onChange={event =>
                setDirectionFilter(
                  event.currentTarget.value as "todos" | DemoDirection
                )
              }
            >
              <option value="todos">Pagar e receber</option>
              <option value="pagar">Pagar</option>
              <option value="receber">Receber</option>
            </select>
          </div>
          <div className="demo-field">
            <label className="demo-label" htmlFor="demo-status-filter">
              Status
            </label>
            <select
              id="demo-status-filter"
              className="demo-select"
              value={statusFilter}
              onChange={event =>
                setStatusFilter(event.currentTarget.value as StatusFilter)
              }
            >
              {statusOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="demo-field">
            <label className="demo-label" htmlFor="demo-project-filter">
              Projeto
            </label>
            <select
              id="demo-project-filter"
              className="demo-select"
              value={projectFilter}
              onChange={event => setProjectFilter(event.currentTarget.value)}
            >
              <option value="todos">Todos os projetos</option>
              <option value="none">Sem projeto</option>
              {state.projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.code} · {project.name}
                </option>
              ))}
            </select>
          </div>
          <div className="demo-actions demo-filter-actions">
            <button
              className="demo-button demo-button-secondary"
              type="button"
              onClick={clearFilters}
              disabled={
                !search &&
                directionFilter === "todos" &&
                statusFilter === "todos" &&
                projectFilter === "todos"
              }
            >
              Limpar filtros
            </button>
          </div>
        </div>

        <div className="demo-table-wrap">
          <table className="demo-table">
            <caption className="sr-only">
              Títulos demo a pagar e receber
            </caption>
            <thead>
              <tr>
                <th scope="col">Título</th>
                <th scope="col">Direção / status</th>
                <th scope="col">Contraparte</th>
                <th scope="col">Projeto / categoria</th>
                <th scope="col">Datas</th>
                <th scope="col">Valores</th>
                <th scope="col">Liquidações</th>
                <th scope="col">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visibleTitles.length ? (
                visibleTitles.map(title => {
                  const party = partyById(state, title.partyId);
                  const project = projectById(state, title.projectId);
                  const category = categoryById(state, title.categoryId);
                  const status = titleStatus(title);
                  const pending = pendingCents(title);
                  const settled = settledCents(title);
                  return (
                    <tr key={title.id}>
                      <td>
                        <strong>{title.description}</strong>
                        <small>Centro: {state.centers.find(center => center.id === title.centerId)?.name ?? "Não definido DEMO"}</small>
                        {title.fiscalDocument === "aguardando_demo" ? <div className="demo-actions">
                          <button type="button" className="demo-button" onClick={async () => {
                            if (!(await confirmDemo("Resolver a pendência documental sintética? Nenhuma nota ou arquivo real será recebido."))) return;
                            const result = resolveDemoDocument(title.id);
                            setFeedback(result.ok ? { tone: "success", message: "Pendência DEMO resolvida localmente. Nenhum documento real foi validado." } : { tone: "error", message: result.message });
                          }}>Resolver pendência DEMO</button>
                        </div> : null}
                        <small>Origem: {sourceLabels[title.source]}</small>
                        {title.sourceId ? (
                          <small>
                            ID de origem (somente leitura): {title.sourceId}
                          </small>
                        ) : null}
                      </td>
                      <td>
                        <span className="demo-direction">
                          {title.direction === "pagar" ? (
                            <ArrowUpRight size={15} aria-hidden="true" />
                          ) : (
                            <ArrowDownLeft size={15} aria-hidden="true" />
                          )}
                          {directionLabel(title.direction)}
                        </span>
                        <DemoStatus tone={statusTone(status)}>
                          {statusLabel(status)}
                        </DemoStatus>
                      </td>
                      <td>{party?.name ?? "Contraparte não encontrada"}</td>
                      <td>
                        <strong>{project?.code ?? "Sem projeto"}</strong>
                        <small>{project?.name ?? "Título sem projeto"}</small>
                        <small>
                          {category
                            ? `${category.code} · ${category.name}`
                            : "Categoria não encontrada"}
                        </small>
                      </td>
                      <td>
                        <small>
                          <CalendarDays size={13} aria-hidden="true" /> Emissão:{" "}
                          {formatDemoDate(title.issueDate)}
                        </small>
                        <small>
                          Competência: {formatDemoDate(title.competenceDate)}
                        </small>
                        <small>
                          Vencimento: {formatDemoDate(title.dueDate)}
                        </small>
                      </td>
                      <td>
                        <strong>{formatBrl(title.amountCents)}</strong>
                        <small>Liquidado: {formatBrl(settled)}</small>
                        <small>Pendente: {formatBrl(pending)}</small>
                      </td>
                      <td>
                        <DemoSettlementHistory title={title} />
                      </td>
                      <td>
                        {pending > 0 ? (
                          <button
                            className="demo-button demo-button-secondary"
                            type="button"
                            onClick={() => openSettlement(title)}
                          >
                            <WalletCards size={15} aria-hidden="true" /> Baixar
                          </button>
                        ) : (
                          <span className="demo-settled-note">Sem saldo</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8}>
                    <DemoEmpty title="Nenhum título demo encontrado">
                      Ajuste a busca ou os filtros para visualizar outros
                      títulos.
                    </DemoEmpty>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DemoPanel>

      {selectedSettlementTitle ? (
        <DemoPanel
          title="Registrar baixa local"
          subtitle={`Saldo pendente: ${formatBrl(settlementBalance)} • ${selectedSettlementTitle.description}`}
        >
          <form className="demo-form" onSubmit={handleSettleTitle}>
            <div className="demo-field">
              <label className="demo-label" htmlFor="demo-settlement-amount">
                Valor da baixa
              </label>
              <input
                id="demo-settlement-amount"
                className="demo-input"
                required
                inputMode="decimal"
                value={settlementAmount}
                onChange={event =>
                  setSettlementAmount(event.currentTarget.value)
                }
                placeholder={formatBrl(settlementBalance)}
                aria-describedby="demo-settlement-amount-help"
              />
              <small id="demo-settlement-amount-help" className="demo-help">
                Parcial ou total; nunca acima do saldo pendente.
              </small>
              {settlementAmountTooHigh ? (
                <small className="demo-field-error" role="alert">
                  O valor informado excede o saldo de{" "}
                  {formatBrl(settlementBalance)}.
                </small>
              ) : null}
            </div>
            <div className="demo-field">
              <label className="demo-label" htmlFor="demo-settlement-date">
                Data da baixa simulada
              </label>
              <input
                id="demo-settlement-date"
                className="demo-input"
                required
                type="date"
                value={settlementDate}
                onChange={event => setSettlementDate(event.currentTarget.value)}
              />
            </div>
            <div className="demo-field demo-field-wide">
              <label
                className="demo-checkbox-label"
                htmlFor="demo-settlement-confirmed"
              >
                <input
                  id="demo-settlement-confirmed"
                  type="checkbox"
                  checked={settlementConfirmed}
                  onChange={event =>
                    setSettlementConfirmed(event.currentTarget.checked)
                  }
                />
                <span>
                  Confirmo explicitamente esta baixa apenas na simulação local;
                  nenhum pagamento/recebimento real será feito.
                </span>
              </label>
            </div>
            <div className="demo-actions demo-form-actions">
              <button
                className="demo-button demo-button-primary"
                type="submit"
                disabled={!settlementReady}
              >
                <CheckCircle2 size={16} aria-hidden="true" /> Confirmar baixa
                simulada
              </button>
              <button
                className="demo-button demo-button-secondary"
                type="button"
                onClick={closeSettlement}
              >
                Cancelar
              </button>
              <button
                className="demo-button demo-button-quiet"
                type="button"
                onClick={() =>
                  setSettlementAmount(formatBrl(settlementBalance))
                }
              >
                Usar saldo total
              </button>
            </div>
          </form>
        </DemoPanel>
      ) : null}

      <DemoPanel
        title="Integração simulada"
        subtitle="A baixa permanece local e auditável no estado demo."
      >
        <p className="demo-note">
          Ao confirmar uma baixa, o store gera uma linha de extrato sintética
          para este título. Consulte o registro em{" "}
          <Link className="text-link" href="/demo/conciliacao">
            Conciliação
          </Link>{" "}
          e o reflexo em{" "}
          <Link className="text-link" href="/demo/relatorios">
            relatórios
          </Link>
          .
        </p>
        <p className="demo-note">
          IDs de origem de provisões, campo e entrevistadores são gerados pelos
          módulos correspondentes e aparecem aqui somente para leitura.
        </p>
        <p className="demo-note">
          <strong>simulação • nenhum pagamento/recebimento real</strong>
        </p>
      </DemoPanel>
    </DemoPageShell>
  );
}
