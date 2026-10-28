import {
  AlertTriangle,
  ArrowRightLeft,
  Ban,
  CalendarClock,
  CheckCircle2,
  Gauge,
  Plus,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
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
  settledCents,
  sumCents,
  titleStatus,
  todayInSaoPaulo,
  type DemoProvision,
  type DemoTitle,
} from "@/lib/demoModel";

const provisionStatusLabels: Record<DemoProvision["status"], string> = {
  prevista: "Prevista",
  substituida: "Convertida em título M3",
  cancelada: "Cancelada",
};

const titleStatusLabels: Record<ReturnType<typeof titleStatus>, string> = {
  em_aberto: "Em aberto",
  parcial: "Parcial",
  vencido: "Vencido",
  vence_hoje: "Vence hoje",
  a_vencer: "A vencer",
  liquidado_simulado: "Liquidado (demo)",
};

const titleSourceLabels: Record<DemoTitle["source"], string> = {
  manual: "Manual",
  provision: "Provisão M4",
  interviewer: "Lote de entrevistadores",
  field: "Folha de campo",
};

function formatPercent(value: number): string {
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value)}%`;
}

function provisionTone(
  status: DemoProvision["status"]
): "neutral" | "positive" | "warning" | "danger" | "info" {
  if (status === "prevista") return "warning";
  if (status === "substituida") return "info";
  return "danger";
}

function titleTone(
  status: ReturnType<typeof titleStatus>
): "neutral" | "positive" | "warning" | "danger" | "info" {
  if (status === "liquidado_simulado") return "positive";
  if (status === "parcial") return "info";
  if (status === "vencido") return "danger";
  if (status === "vence_hoje") return "warning";
  return "neutral";
}

function consumptionTone(
  percent: number
): "blue" | "green" | "purple" | "cyan" | "amber" {
  if (percent >= 100) return "amber";
  if (percent >= 80) return "purple";
  return "green";
}

export default function DemoBudgetPage() {
  const { state, addProvision, convertProvision, cancelProvision } =
    useDemoStore();
  const [selectedProjectId, setSelectedProjectId] = useState(
    state.projects[0]?.id ?? ""
  );
  const [provisionProjectId, setProvisionProjectId] = useState(
    state.projects[0]?.id ?? ""
  );
  const [provisionCategoryId, setProvisionCategoryId] = useState("");
  const [provisionDescription, setProvisionDescription] = useState("");
  const [provisionAmount, setProvisionAmount] = useState("");
  const [provisionDate, setProvisionDate] = useState(todayInSaoPaulo());
  const [vendorByProvision, setVendorByProvision] = useState<
    Record<string, string>
  >({});
  const [cancelReasonByProvision, setCancelReasonByProvision] = useState<
    Record<string, string>
  >({});
  const [feedback, setFeedback] = useState<{
    tone: "positive" | "danger" | "info";
    message: string;
  } | null>(null);

  useEffect(() => {
    if (state.projects.some(project => project.id === selectedProjectId))
      return;
    setSelectedProjectId(state.projects[0]?.id ?? "");
  }, [selectedProjectId, state.projects]);

  useEffect(() => {
    if (
      state.projects.some(
        project =>
          project.id === provisionProjectId && project.status === "ativo"
      )
    )
      return;
    setProvisionProjectId(
      state.projects.find(project => project.status === "ativo")?.id ?? ""
    );
  }, [provisionProjectId, state.projects]);

  useEffect(() => {
    if (
      provisionCategoryId &&
      state.categories.some(
        category =>
          category.id === provisionCategoryId &&
          category.type === "despesa" &&
          category.active
      )
    )
      return;
    setProvisionCategoryId(
      state.categories.find(
        category => category.type === "despesa" && category.active
      )?.id ?? ""
    );
  }, [provisionCategoryId, state.categories]);

  const selectedProject = state.projects.find(
    project => project.id === selectedProjectId
  );
  const activeProjects = state.projects.filter(
    project => project.status === "ativo"
  );
  const activeExpenseCategories = state.categories.filter(
    category => category.type === "despesa" && category.active
  );
  const activeVendors = state.parties.filter(
    party => party.type === "fornecedor" && party.active
  );

  const projectProvisions = useMemo(
    () =>
      state.provisions.filter(
        provision => provision.projectId === selectedProjectId
      ),
    [selectedProjectId, state.provisions]
  );
  const projectPayableTitles = useMemo(
    () =>
      state.titles.filter(
        title =>
          title.projectId === selectedProjectId && title.direction === "pagar"
      ),
    [selectedProjectId, state.titles]
  );
  const openPayableTitles = useMemo(
    () => projectPayableTitles.filter(title => pendingCents(title) > 0),
    [projectPayableTitles]
  );

  const plannedProvisionCents = sumCents(
    projectProvisions
      .filter(provision => provision.status === "prevista")
      .map(provision => provision.amountCents)
  );
  const committedCents = sumCents(
    openPayableTitles.map(title => pendingCents(title))
  );
  const realizedCents = sumCents(
    projectPayableTitles.map(title => settledCents(title))
  );
  const baselineCents = selectedProject?.budgetCents ?? 0;
  const consumptionCents = sumCents([
    plannedProvisionCents,
    committedCents,
    realizedCents,
  ]);
  const balanceCents = baselineCents - consumptionCents;
  const consumptionPercent =
    baselineCents > 0 ? (consumptionCents * 100) / baselineCents : 0;
  const consumptionStatusTone =
    consumptionPercent >= 100 ? "danger" : "warning";

  const sortedProvisions = [...projectProvisions].sort((left, right) =>
    left.dueDate.localeCompare(right.dueDate)
  );
  const sortedPayableTitles = [...projectPayableTitles].sort((left, right) =>
    left.dueDate.localeCompare(right.dueDate)
  );

  const handleProjectChange = (projectId: string) => {
    setSelectedProjectId(projectId);
    setProvisionProjectId(projectId);
    setFeedback(null);
  };

  const handleAddProvision = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const amountCents = parseBrlToCents(provisionAmount);
    if (amountCents === null) {
      setFeedback({
        tone: "danger",
        message: "Informe um valor válido em reais, como R$ 1.250,00.",
      });
      return;
    }
    const result = addProvision({
      projectId: provisionProjectId,
      categoryId: provisionCategoryId,
      description: provisionDescription,
      amountCents,
      dueDate: provisionDate,
    });
    if (!result.ok) {
      setFeedback({ tone: "danger", message: result.message });
      return;
    }
    setProvisionDescription("");
    setProvisionAmount("");
    setFeedback({
      tone: "positive",
      message: "Provisão sintética criada e incluída no previsto da baseline.",
    });
  };

  const handleConvertProvision = (provision: DemoProvision) => {
    const vendorId =
      vendorByProvision[provision.id] ?? activeVendors[0]?.id ?? "";
    if (!vendorId) {
      setFeedback({
        tone: "danger",
        message: "Selecione um fornecedor DEMO ativo para criar o título M3.",
      });
      return;
    }
    const result = convertProvision(provision.id, vendorId);
    if (!result.ok) {
      setFeedback({ tone: "danger", message: result.message });
      return;
    }
    setFeedback({
      tone: "positive",
      message:
        "Provisão convertida em título M3. Ela saiu do previsto e entrou em comprometido.",
    });
  };

  const handleCancelProvision = (provision: DemoProvision) => {
    const reason = cancelReasonByProvision[provision.id]?.trim() ?? "";
    if (!reason) {
      setFeedback({
        tone: "danger",
        message: "Informe o motivo antes de cancelar a provisão.",
      });
      return;
    }
    const result = cancelProvision(provision.id, reason);
    if (!result.ok) {
      setFeedback({ tone: "danger", message: result.message });
      return;
    }
    setCancelReasonByProvision(current => ({ ...current, [provision.id]: "" }));
    setFeedback({
      tone: "positive",
      message: "Provisão cancelada com motivo registrado no histórico DEMO.",
    });
  };

  return (
    <DemoPageShell
      module="M4"
      title="Projetos, orçamento e provisões"
      description="Acompanhe a baseline de um projeto DEMO, seus títulos a pagar, provisões sintéticas e o histórico de transições."
      actions={<DemoStatus tone="info">M4 · ambiente local</DemoStatus>}
    >
      <DemoPanel
        title="Projeto DEMO"
        subtitle="Selecione o projeto usado em todas as métricas e no histórico abaixo."
      >
        <div className="demo-form">
          <div className="demo-field">
            <label className="demo-label" htmlFor="demo-budget-project">
              Projeto
            </label>
            <select
              id="demo-budget-project"
              className="demo-select"
              value={selectedProjectId}
              onChange={event => handleProjectChange(event.target.value)}
            >
              {state.projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.code} · {project.name} ·{" "}
                  {project.status === "ativo" ? "Ativo" : "Fechado"}
                </option>
              ))}
            </select>
          </div>
          <div className="demo-field demo-project-baseline-note" role="status">
            <span className="demo-label">Conexão</span>
            <strong>baseline fictícia para mockup</strong>
            <span>M4 não altera Connect e não faz chamadas de API real.</span>
          </div>
        </div>
      </DemoPanel>

      {feedback ? (
        <div
          className={`demo-feedback demo-feedback-${feedback.tone}`}
          role="status"
          aria-live="polite"
        >
          {feedback.tone === "positive" ? (
            <CheckCircle2 size={18} aria-hidden="true" />
          ) : (
            <AlertTriangle size={18} aria-hidden="true" />
          )}
          <span>{feedback.message}</span>
        </div>
      ) : null}

      {!selectedProject ? (
        <DemoEmpty title="Nenhum projeto DEMO disponível">
          Cadastre um projeto sintético antes de consultar orçamento e
          provisões.
        </DemoEmpty>
      ) : (
        <>
          <section
            className="demo-grid demo-grid-metrics"
            aria-label="Métricas da baseline do projeto"
          >
            <DemoMetric
              label="Baseline / orçamento"
              value={formatBrl(baselineCents)}
              detail="Valor fictício do projeto"
              icon={WalletCards}
              tone="blue"
            />
            <DemoMetric
              label="Provisionado previsto"
              value={formatBrl(plannedProvisionCents)}
              detail="Somente provisions.status = prevista"
              icon={CalendarClock}
              tone="purple"
            />
            <DemoMetric
              label="Comprometido em aberto"
              value={formatBrl(committedCents)}
              detail={`${openPayableTitles.length} título(s), usando pendingCents`}
              icon={Gauge}
              tone="amber"
            />
            <DemoMetric
              label="Realizado"
              value={formatBrl(realizedCents)}
              detail="Settlements de títulos a pagar"
              icon={CheckCircle2}
              tone="cyan"
            />
            <DemoMetric
              label="Saldo disponível"
              value={formatBrl(balanceCents)}
              detail="Baseline − realizado − comprometido − previsto"
              icon={WalletCards}
              tone="green"
            />
            <DemoMetric
              label="Consumo da baseline"
              value={formatPercent(consumptionPercent)}
              detail={formatBrl(consumptionCents) + " considerados"}
              icon={Gauge}
              tone={consumptionTone(consumptionPercent)}
            />
          </section>

          {consumptionPercent >= 100 ? (
            <div
              className="demo-alert demo-alert-danger"
              role="status"
              aria-live="polite"
            >
              <AlertTriangle size={20} aria-hidden="true" />
              <div>
                <strong>
                  Consumo atingiu ou ultrapassou 100% da baseline.
                </strong>
                <span>
                  O alerta é visual e não altera a baseline fictícia para
                  mockup.
                </span>
              </div>
            </div>
          ) : consumptionPercent >= 80 ? (
            <div
              className="demo-alert demo-alert-warning"
              role="status"
              aria-live="polite"
            >
              <AlertTriangle size={20} aria-hidden="true" />
              <div>
                <strong>Atenção: consumo atingiu 80% da baseline.</strong>
                <span>
                  O alerta é visual e não altera a baseline fictícia para
                  mockup.
                </span>
              </div>
            </div>
          ) : (
            <div
              className="demo-alert demo-alert-ok"
              role="status"
              aria-live="polite"
            >
              <CheckCircle2 size={20} aria-hidden="true" />
              <div>
                <strong>Consumo abaixo da faixa de atenção.</strong>
                <span>
                  Baseline fictícia para mockup; nenhum limite é alterado
                  automaticamente.
                </span>
              </div>
            </div>
          )}

          <DemoPanel
            title="Como o consumo é composto"
            subtitle="A mesma fonte de estado alimenta orçamento, provisões, títulos e liquidações."
          >
            <div className="demo-grid demo-grid-breakdown" role="status">
              <div className="demo-breakdown-item">
                <span>Previsto</span>
                <strong>{formatBrl(plannedProvisionCents)}</strong>
                <small>Provisões ainda previstas</small>
              </div>
              <div className="demo-breakdown-item">
                <span>Comprometido</span>
                <strong>{formatBrl(committedCents)}</strong>
                <small>Saldo pending de pagar</small>
              </div>
              <div className="demo-breakdown-item">
                <span>Realizado</span>
                <strong>{formatBrl(realizedCents)}</strong>
                <small>Settlements de pagar</small>
              </div>
              <div className="demo-breakdown-item">
                <span>Fórmula</span>
                <strong>{formatBrl(balanceCents)}</strong>
                <small>Saldo após os três componentes</small>
              </div>
            </div>
            <p className="demo-note">
              Provisão convertida não é contada duas vezes: ao virar título M3,
              seu estado passa a ser “substituída” e o valor aparece apenas em
              comprometido ou realizado, conforme os settlements.
            </p>
          </DemoPanel>

          <div className="demo-grid demo-grid-content">
            <DemoPanel
              title="Nova provisão sintética"
              subtitle="Crie uma previsão local sem integração externa. O valor é convertido para integer cents."
            >
              <form className="demo-form" onSubmit={handleAddProvision}>
                <div className="demo-field">
                  <label
                    className="demo-label"
                    htmlFor="demo-provision-project"
                  >
                    Projeto
                  </label>
                  <select
                    id="demo-provision-project"
                    className="demo-select"
                    value={provisionProjectId}
                    onChange={event =>
                      setProvisionProjectId(event.target.value)
                    }
                    required
                  >
                    <option value="">Selecione um projeto ativo</option>
                    {activeProjects.map(project => (
                      <option key={project.id} value={project.id}>
                        {project.code} · {project.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="demo-field">
                  <label
                    className="demo-label"
                    htmlFor="demo-provision-category"
                  >
                    Categoria de despesa
                  </label>
                  <select
                    id="demo-provision-category"
                    className="demo-select"
                    value={provisionCategoryId}
                    onChange={event =>
                      setProvisionCategoryId(event.target.value)
                    }
                    required
                  >
                    <option value="">Selecione uma categoria ativa</option>
                    {activeExpenseCategories.map(category => (
                      <option key={category.id} value={category.id}>
                        {category.code} · {category.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="demo-field">
                  <label
                    className="demo-label"
                    htmlFor="demo-provision-description"
                  >
                    Descrição
                  </label>
                  <input
                    id="demo-provision-description"
                    className="demo-input"
                    value={provisionDescription}
                    onChange={event =>
                      setProvisionDescription(event.target.value)
                    }
                    placeholder="Ex.: próxima rodada de entrevistas"
                    required
                  />
                </div>
                <div className="demo-form demo-form-inline">
                  <div className="demo-field">
                    <label
                      className="demo-label"
                      htmlFor="demo-provision-amount"
                    >
                      Valor
                    </label>
                    <input
                      id="demo-provision-amount"
                      className="demo-input"
                      value={provisionAmount}
                      onChange={event => setProvisionAmount(event.target.value)}
                      placeholder="R$ 0,00"
                      inputMode="decimal"
                      required
                    />
                  </div>
                  <div className="demo-field">
                    <label className="demo-label" htmlFor="demo-provision-date">
                      Data prevista
                    </label>
                    <input
                      id="demo-provision-date"
                      className="demo-input"
                      type="date"
                      value={provisionDate}
                      onChange={event => setProvisionDate(event.target.value)}
                      required
                    />
                  </div>
                </div>
                <div className="demo-actions">
                  <button
                    className="demo-button demo-button-primary"
                    type="submit"
                    disabled={
                      !activeProjects.length || !activeExpenseCategories.length
                    }
                  >
                    <Plus size={16} aria-hidden="true" /> Criar provisão
                  </button>
                  <span className="demo-note">
                    Apenas estado DEMO local; sem API real.
                  </span>
                </div>
              </form>
            </DemoPanel>

            <DemoPanel
              title="Baseline selecionada"
              subtitle={`${selectedProject.code} · ${selectedProject.name}`}
            >
              <div className="demo-baseline-summary">
                <div>
                  <span>Cliente DEMO</span>
                  <strong>
                    {partyById(state, selectedProject.clientId)?.name ??
                      "Cliente não identificado"}
                  </strong>
                </div>
                <div>
                  <span>Status do projeto</span>
                  <DemoStatus
                    tone={
                      selectedProject.status === "ativo"
                        ? "positive"
                        : "neutral"
                    }
                  >
                    {selectedProject.status === "ativo" ? "Ativo" : "Fechado"}
                  </DemoStatus>
                </div>
                <div>
                  <span>Baseline</span>
                  <strong>{formatBrl(selectedProject.budgetCents)}</strong>
                </div>
                <div>
                  <span>Progresso operacional</span>
                  <strong>{selectedProject.progressPercent}%</strong>
                </div>
              </div>
              <div className="demo-status-line" role="status">
                <CheckCircle2 size={16} aria-hidden="true" />
                <span>
                  Alterações desta tela são sintéticas e não alteram Connect.
                </span>
              </div>
            </DemoPanel>
          </div>

          <DemoPanel
            title="Provisões e histórico de estados"
            subtitle="Prevista pode ser convertida em título M3 ou cancelada com motivo. Estados substituída e cancelada permanecem no histórico."
          >
            {sortedProvisions.length === 0 ? (
              <DemoEmpty title="Nenhuma provisão para este projeto">
                Use o formulário acima para criar a primeira previsão sintética.
              </DemoEmpty>
            ) : (
              <div className="demo-table-wrap">
                <table className="demo-table">
                  <thead>
                    <tr>
                      <th scope="col">Descrição</th>
                      <th scope="col">Categoria</th>
                      <th scope="col">Data</th>
                      <th scope="col">Valor</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Ações M4</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProvisions.map(provision => (
                      <tr key={provision.id}>
                        <td>
                          <strong>{provision.description}</strong>
                          <small>{provision.id}</small>
                        </td>
                        <td>
                          {categoryById(state, provision.categoryId)?.name ??
                            "Categoria DEMO"}
                        </td>
                        <td>{formatDemoDate(provision.dueDate)}</td>
                        <td>
                          <strong>{formatBrl(provision.amountCents)}</strong>
                        </td>
                        <td>
                          <DemoStatus tone={provisionTone(provision.status)}>
                            {provisionStatusLabels[provision.status]}
                          </DemoStatus>
                          {provision.status === "substituida" &&
                          provision.titleId ? (
                            <small>Título: {provision.titleId}</small>
                          ) : null}
                          {provision.status === "cancelada" &&
                          provision.cancelReason ? (
                            <small>Motivo: {provision.cancelReason}</small>
                          ) : null}
                        </td>
                        <td>
                          {provision.status === "prevista" ? (
                            <div className="demo-actions">
                              <label
                                className="demo-label"
                                htmlFor={`demo-vendor-${provision.id}`}
                              >
                                Fornecedor para título M3
                              </label>
                              <select
                                id={`demo-vendor-${provision.id}`}
                                className="demo-select"
                                value={vendorByProvision[provision.id] ?? ""}
                                onChange={event =>
                                  setVendorByProvision(current => ({
                                    ...current,
                                    [provision.id]: event.target.value,
                                  }))
                                }
                                disabled={!activeVendors.length}
                              >
                                <option value="">
                                  Selecione um fornecedor
                                </option>
                                {activeVendors.map(vendor => (
                                  <option key={vendor.id} value={vendor.id}>
                                    {vendor.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                className="demo-button demo-button-secondary"
                                type="button"
                                onClick={() =>
                                  handleConvertProvision(provision)
                                }
                                disabled={
                                  !activeVendors.length ||
                                  !vendorByProvision[provision.id]
                                }
                              >
                                <ArrowRightLeft size={15} aria-hidden="true" />{" "}
                                Converter em título M3
                              </button>
                              <label
                                className="demo-label"
                                htmlFor={`demo-cancel-${provision.id}`}
                              >
                                Motivo do cancelamento
                              </label>
                              <input
                                id={`demo-cancel-${provision.id}`}
                                className="demo-input"
                                value={
                                  cancelReasonByProvision[provision.id] ?? ""
                                }
                                onChange={event =>
                                  setCancelReasonByProvision(current => ({
                                    ...current,
                                    [provision.id]: event.target.value,
                                  }))
                                }
                                placeholder="Obrigatório para cancelar"
                              />
                              <button
                                className="demo-button demo-button-danger"
                                type="button"
                                onClick={() => handleCancelProvision(provision)}
                                disabled={
                                  !cancelReasonByProvision[provision.id]?.trim()
                                }
                              >
                                <Ban size={15} aria-hidden="true" /> Cancelar
                                provisão
                              </button>
                            </div>
                          ) : (
                            <span className="demo-note">
                              Sem ação: estado histórico preservado.
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DemoPanel>

          <DemoPanel
            title="Títulos a pagar do projeto"
            subtitle="Comprometido usa apenas pendingCents; realizado soma settlements dos mesmos títulos."
          >
            {sortedPayableTitles.length === 0 ? (
              <DemoEmpty title="Nenhum título a pagar para este projeto">
                Títulos de receita não entram no consumo desta baseline.
              </DemoEmpty>
            ) : (
              <div className="demo-table-wrap">
                <table className="demo-table">
                  <thead>
                    <tr>
                      <th scope="col">Título</th>
                      <th scope="col">Origem / fornecedor</th>
                      <th scope="col">Vencimento</th>
                      <th scope="col">Estado</th>
                      <th scope="col">Realizado</th>
                      <th scope="col">Pendente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPayableTitles.map(title => {
                      const status = titleStatus(title);
                      const titleRealizedCents = settledCents(title);
                      const titlePendingCents = pendingCents(title);
                      return (
                        <tr key={title.id}>
                          <td>
                            <strong>{title.description}</strong>
                            <small>{title.id}</small>
                          </td>
                          <td>
                            <span>
                              {partyById(state, title.partyId)?.name ??
                                "Fornecedor DEMO"}
                            </span>
                            <small>{titleSourceLabels[title.source]}</small>
                          </td>
                          <td>{formatDemoDate(title.dueDate)}</td>
                          <td>
                            <DemoStatus tone={titleTone(status)}>
                              {titleStatusLabels[status]}
                            </DemoStatus>
                          </td>
                          <td>{formatBrl(titleRealizedCents)}</td>
                          <td>
                            <strong>{formatBrl(titlePendingCents)}</strong>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </DemoPanel>

          <div className="demo-status-line" role="status">
            <WalletCards size={16} aria-hidden="true" />
            <span>
              Projeto {selectedProject.code}: {formatBrl(realizedCents)}{" "}
              realizado + {formatBrl(committedCents)} comprometido +{" "}
              {formatBrl(plannedProvisionCents)} previsto ={" "}
              {formatPercent(consumptionPercent)} do orçamento DEMO.
            </span>
          </div>
        </>
      )}
    </DemoPageShell>
  );
}
