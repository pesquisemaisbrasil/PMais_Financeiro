import { confirmDemo } from "@/lib/demoConfirm";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Plus,
  ShieldCheck,
  XCircle,
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
  projectById,
  sumCents,
  todayInSaoPaulo,
  type DemoFieldItem,
  type DemoFieldSheet,
} from "@/lib/demoModel";

const PAYMENT_CONFIRMATION = "SIMULAÇÃO local, nenhum banco/Connect/Itaú é chamado";

type Feedback = {
  message: string;
  tone: "positive" | "danger" | "info";
};

type StatusTone = "neutral" | "positive" | "warning" | "danger" | "info";

function parseQuantityToHundredths(input: string): number | null {
  const text = input.trim().replace(/\s/g, "");
  if (!text) return null;

  let whole = "";
  let fraction = "";
  if (text.includes(",")) {
    const parts = text.split(",");
    if (parts.length !== 2 || !/^\d{1,2}$/.test(parts[1])) return null;
    whole = parts[0].replace(/\./g, "");
    fraction = parts[1].padEnd(2, "0");
  } else if (/^\d+$/.test(text)) {
    whole = text;
  } else if (/^\d+\.\d{1,2}$/.test(text)) {
    const [integer, decimals = ""] = text.split(".");
    whole = integer;
    fraction = decimals.padEnd(2, "0");
  } else {
    return null;
  }

  const hundredths = Number(whole || "0") * 100 + Number(fraction || "0");
  return Number.isSafeInteger(hundredths) && hundredths > 0 ? hundredths : null;
}

function formatQuantity(hundredths: number): string {
  const whole = Math.floor(hundredths / 100).toLocaleString("pt-BR");
  const fraction = String(hundredths % 100).padStart(2, "0");
  return `${whole},${fraction}`;
}

function itemStatusTone(status: DemoFieldItem["status"]): StatusTone {
  if (status === "paga_simulada") return "positive";
  if (status === "em_lote") return "info";
  return "neutral";
}

function sheetStatusTone(status: DemoFieldSheet["status"]): StatusTone {
  if (status === "paga_simulada") return "positive";
  if (status === "aprovada_demo") return "info";
  return "warning";
}

function resultMessage(ok: boolean, success: string, failure: string): Feedback {
  return ok
    ? { message: success, tone: "positive" }
    : { message: failure, tone: "danger" };
}

export default function DemoPayrollPage() {
  const {
    state,
    addFieldItem,
    approveFieldSheet,
    cancelFieldSheet,
    createFieldSheet,
    payFieldSheet,
  } = useDemoStore();

  const activeProjects = state.projects.filter(project => project.status === "ativo");
  const expenseCategories = state.categories.filter(category => category.type === "despesa" && category.active);
  const firstFieldCategory = expenseCategories.find(category => category.id === "cat-demo-field") ?? expenseCategories[0];
  const [selectedProjectId, setSelectedProjectId] = useState(activeProjects[0]?.id ?? "");
  const [selectedCategoryId, setSelectedCategoryId] = useState(firstFieldCategory?.id ?? "");
  const [description, setDescription] = useState("");
  const [quantityInput, setQuantityInput] = useState("1,00");
  const [unitValueInput, setUnitValueInput] = useState("");
  const [sheetDate, setSheetDate] = useState(() => todayInSaoPaulo());
  const [paymentDates, setPaymentDates] = useState<Record<string, string>>({});
  const [paymentConfirmations, setPaymentConfirmations] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const effectiveProjectId = activeProjects.some(project => project.id === selectedProjectId)
    ? selectedProjectId
    : activeProjects[0]?.id ?? "";
  const effectiveCategoryId = expenseCategories.some(category => category.id === selectedCategoryId)
    ? selectedCategoryId
    : firstFieldCategory?.id ?? "";

  const parsedQuantity = parseQuantityToHundredths(quantityInput);
  const parsedUnitCents = parseBrlToCents(unitValueInput);
  const calculatedItemCents = parsedQuantity !== null && parsedUnitCents !== null
    ? Math.floor((parsedQuantity * parsedUnitCents + 50) / 100)
    : null;

  const totalItemsCents = useMemo(
    () => sumCents(state.fieldItems.map(item => item.amountCents)),
    [state.fieldItems],
  );
  const pendingItemsCount = state.fieldItems.filter(item => item.status === "pendente").length;
  const openSheetsCount = state.fieldSheets.filter(sheet => sheet.status === "aberta").length;
  const approvedSheetsCount = state.fieldSheets.filter(sheet => sheet.status === "aprovada_demo").length;

  function setActionFeedback(result: { ok: true } | { ok: false; message: string }, success: string) {
    setFeedback(resultMessage(result.ok, success, result.ok ? "" : result.message));
  }

  function handleAddItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!effectiveProjectId || !effectiveCategoryId) {
      setFeedback({ message: "Cadastre projeto ativo e categoria de despesa DEMO antes de adicionar o item.", tone: "danger" });
      return;
    }
    if (!description.trim()) {
      setFeedback({ message: "Informe a descrição do item DEMO.", tone: "danger" });
      return;
    }
    if (parsedQuantity === null) {
      setFeedback({ message: "Informe uma quantidade positiva com até duas casas decimais.", tone: "danger" });
      return;
    }
    if (parsedUnitCents === null) {
      setFeedback({ message: "Informe um valor unitário DEMO válido, como 30,00.", tone: "danger" });
      return;
    }

    const result = addFieldItem({
      projectId: effectiveProjectId,
      categoryId: effectiveCategoryId,
      description,
      quantityHundredths: parsedQuantity,
      unitCents: parsedUnitCents,
    });
    setActionFeedback(result, "Item DEMO adicionado; o total foi calculado em centavos inteiros.");
    if (result.ok) {
      setDescription("");
      setQuantityInput("1,00");
      setUnitValueInput("");
    }
  }

  function handleCreateSheet(projectId: string) {
    if (!sheetDate) {
      setFeedback({ message: "Informe a data da folha DEMO.", tone: "danger" });
      return;
    }
    const result = createFieldSheet(projectId, sheetDate);
    setActionFeedback(result, "Folha DEMO criada com os itens pendentes do projeto.");
  }

  function handleApproveSheet(sheetId: string) {
    const result = approveFieldSheet(sheetId);
    setActionFeedback(result, "Folha DEMO aprovada; um título demonstrativo foi criado em Contas a pagar.");
  }

  async function handleCancelSheet(sheet: DemoFieldSheet) {
    const project = projectById(state, sheet.projectId);
    if (!(await confirmDemo(`Cancelar a folha aberta de ${project?.code ?? "este projeto"}? Os itens voltarão a ficar pendentes.`))) {
      return;
    }
    const result = cancelFieldSheet(sheet.id);
    setActionFeedback(result, "Folha DEMO cancelada; seus itens voltaram para pendentes.");
  }

  function handlePaySheet(sheet: DemoFieldSheet) {
    const date = paymentDates[sheet.id] ?? todayInSaoPaulo();
    if (!date) {
      setFeedback({ message: "Informe a data da liquidação simulada.", tone: "danger" });
      return;
    }
    if (!paymentConfirmations[sheet.id]) {
      setFeedback({ message: `Para pagar, confirme exatamente: ${PAYMENT_CONFIRMATION}.`, tone: "danger" });
      return;
    }
    const result = payFieldSheet(sheet.id, date);
    setActionFeedback(result, "Folha DEMO paga com status paga_simulada; nenhum serviço externo foi chamado.");
  }

  return (
    <DemoPageShell
      module="M5"
      title="Folha e lotes de campo"
      description="Organize itens demonstrativos por projeto, feche a soma com precisão e percorra o ciclo local de uma folha até paga_simulada."
      actions={(
        <div className="demo-actions" aria-label="Atalhos para módulos relacionados">
          <Link className="demo-button demo-button-secondary" href="/demo/contas">
            M3 Contas a pagar <ArrowRight size={15} aria-hidden="true" />
          </Link>
          <Link className="demo-button demo-button-secondary" href="/demo/conciliacao">
            M6 Conciliação <ArrowRight size={15} aria-hidden="true" />
          </Link>
        </div>
      )}
    >
      {feedback ? (
        <div
          className={`demo-feedback demo-feedback-${feedback.tone}`}
          role={feedback.tone === "danger" ? "alert" : "status"}
          aria-live="polite"
        >
          {feedback.tone === "positive" ? <CheckCircle2 size={17} aria-hidden="true" /> : null}
          <span>{feedback.message}</span>
        </div>
      ) : null}

      <section className="demo-grid demo-summary-grid" aria-label="Resumo da folha de campo">
        <DemoMetric
          label="Itens DEMO"
          value={String(state.fieldItems.length)}
          detail={`${pendingItemsCount} pendente(s)`}
          icon={ClipboardList}
          tone="blue"
        />
        <DemoMetric
          label="Total calculado"
          value={formatBrl(totalItemsCents)}
          detail="soma exata dos itens"
          icon={ShieldCheck}
          tone="green"
        />
        <DemoMetric
          label="Folhas abertas"
          value={String(openSheetsCount)}
          detail={`${approvedSheetsCount} aprovada(s)`}
          icon={ClipboardList}
          tone="amber"
        />
      </section>

      <DemoPanel
        title="Adicionar item de folha"
        subtitle="O item é sempre sintético, vinculado a um projeto e a uma categoria de despesa DEMO."
      >
        <form className="demo-form" onSubmit={handleAddItem} noValidate>
          <div className="demo-field">
            <label className="demo-label" htmlFor="field-project">Projeto DEMO</label>
            <select
              className="demo-select"
              id="field-project"
              value={effectiveProjectId}
              onChange={event => setSelectedProjectId(event.target.value)}
              required
            >
              <option value="" disabled>Selecione um projeto</option>
              {activeProjects.map(project => (
                <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
              ))}
            </select>
          </div>

          <div className="demo-field">
            <label className="demo-label" htmlFor="field-category">Categoria de despesa DEMO</label>
            <select
              className="demo-select"
              id="field-category"
              value={effectiveCategoryId}
              onChange={event => setSelectedCategoryId(event.target.value)}
              required
            >
              <option value="" disabled>Selecione uma categoria</option>
              {expenseCategories.map(category => (
                <option key={category.id} value={category.id}>{category.code} · {category.name}</option>
              ))}
            </select>
          </div>

          <div className="demo-field demo-field-wide">
            <label className="demo-label" htmlFor="field-description">Descrição</label>
            <input
              className="demo-input"
              id="field-description"
              type="text"
              value={description}
              onChange={event => setDescription(event.target.value)}
              placeholder="Ex.: aplicação de questionários"
              autoComplete="off"
              required
            />
          </div>

          <div className="demo-field">
            <label className="demo-label" htmlFor="field-quantity">Quantidade</label>
            <input
              className="demo-input"
              id="field-quantity"
              type="text"
              inputMode="decimal"
              value={quantityInput}
              onChange={event => setQuantityInput(event.target.value)}
              placeholder="0,00"
              aria-describedby="field-quantity-help"
              required
            />
            <small className="demo-help" id="field-quantity-help">Duas casas, armazenadas como centésimos inteiros.</small>
          </div>

          <div className="demo-field">
            <label className="demo-label" htmlFor="field-unit-value">Valor unitário</label>
            <input
              className="demo-input"
              id="field-unit-value"
              type="text"
              inputMode="decimal"
              value={unitValueInput}
              onChange={event => setUnitValueInput(event.target.value)}
              placeholder="R$ 0,00"
              required
            />
          </div>

          <div className="demo-field demo-calculation" aria-live="polite">
            <span className="demo-label">Valor calculado</span>
            <output>{calculatedItemCents !== null ? formatBrl(calculatedItemCents) : "Informe quantidade e valor"}</output>
            <small>Arredondamento determinístico em centavos.</small>
          </div>

          <div className="demo-actions demo-form-actions">
            <button className="demo-button demo-button-primary" type="submit">
              <Plus size={16} aria-hidden="true" /> Adicionar item DEMO
            </button>
          </div>
        </form>
      </DemoPanel>

      <section aria-labelledby="field-items-title">
        <div className="demo-section-heading">
          <div>
            <p className="eyebrow">Itens demonstrativos</p>
            <h2 id="field-items-title">Itens agrupados por projeto</h2>
          </div>
          <span className="demo-section-total">Total geral: <strong>{formatBrl(totalItemsCents)}</strong></span>
        </div>
        <div className="demo-grid demo-project-grid">
          {state.projects.map(project => {
            const projectItems = state.fieldItems.filter(item => item.projectId === project.id);
            const projectTotalCents = sumCents(projectItems.map(item => item.amountCents));
            const pendingProjectItems = projectItems.filter(item => item.status === "pendente");
            return (
              <DemoPanel
                key={project.id}
                className="demo-project-card"
                title={`${project.code} · ${project.name}`}
                subtitle={`${projectItems.length} item(ns) · soma exata ${formatBrl(projectTotalCents)}`}
                actions={(
                  <DemoStatus tone={project.status === "ativo" ? "positive" : "neutral"}>
                    projeto {project.status}
                  </DemoStatus>
                )}
              >
                {projectItems.length ? (
                  <div className="demo-table-wrap">
                    <table className="demo-table">
                      <caption className="sr-only">Itens DEMO do projeto {project.code}</caption>
                      <thead>
                        <tr>
                          <th scope="col">Descrição</th>
                          <th scope="col">Categoria</th>
                          <th scope="col">Qtd.</th>
                          <th scope="col">Unitário</th>
                          <th scope="col">Calculado</th>
                          <th scope="col">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {projectItems.map(item => (
                          <tr key={item.id}>
                            <td>{item.description}</td>
                            <td>{categoryById(state, item.categoryId)?.name ?? "Categoria DEMO"}</td>
                            <td>{formatQuantity(item.quantityHundredths)}</td>
                            <td>{formatBrl(item.unitCents)}</td>
                            <td><strong>{formatBrl(item.amountCents)}</strong></td>
                            <td><DemoStatus tone={itemStatusTone(item.status)}>{item.status}</DemoStatus></td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th scope="row" colSpan={4}>Soma exata dos itens</th>
                          <td><strong>{formatBrl(projectTotalCents)}</strong></td>
                          <td>{pendingProjectItems.length} pendente(s)</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <DemoEmpty title="Nenhum item DEMO neste projeto">Adicione um item acima para iniciar a folha.</DemoEmpty>
                )}
              </DemoPanel>
            );
          })}
        </div>
      </section>

      <DemoPanel
        title="Criar folhas por projeto"
        subtitle="Uma nova folha reúne automaticamente todos os itens pendentes daquele projeto na data informada."
      >
        <div className="demo-form demo-sheet-create-form">
          <div className="demo-field">
            <label className="demo-label" htmlFor="field-sheet-date">Data da folha</label>
            <input
              className="demo-input"
              id="field-sheet-date"
              type="date"
              value={sheetDate}
              onChange={event => setSheetDate(event.target.value)}
              required
            />
          </div>
        </div>
        {activeProjects.length ? (
          <div className="demo-grid demo-project-actions">
            {activeProjects.map(project => {
              const pending = state.fieldItems.filter(item => item.projectId === project.id && item.status === "pendente");
              const pendingTotal = sumCents(pending.map(item => item.amountCents));
              return (
                <article className="demo-card demo-project-action-card" key={project.id}>
                  <div>
                    <span className="demo-kicker">Projeto DEMO</span>
                    <h3>{project.code} · {project.name}</h3>
                    <p>{pending.length} item(ns) pendente(s) · {formatBrl(pendingTotal)}</p>
                  </div>
                  <button
                    className="demo-button demo-button-primary"
                    type="button"
                    disabled={!pending.length}
                    onClick={() => handleCreateSheet(project.id)}
                  >
                    <ClipboardList size={16} aria-hidden="true" /> Criar folha
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <DemoEmpty title="Nenhum projeto DEMO ativo">Não é possível criar uma folha sem projeto ativo.</DemoEmpty>
        )}
      </DemoPanel>

      <section aria-labelledby="sheets-title">
        <div className="demo-section-heading">
          <div>
            <p className="eyebrow">Ciclo local</p>
            <h2 id="sheets-title">Folhas e lotes de campo</h2>
          </div>
          <span className="demo-section-total">A soma é conferida antes de aprovar e pagar.</span>
        </div>

        {state.fieldSheets.length ? (
          <div className="demo-grid demo-sheet-grid">
            {state.fieldSheets.map(sheet => {
              const project = projectById(state, sheet.projectId);
              const sheetItems = state.fieldItems.filter(item => sheet.itemIds.includes(item.id));
              const exactSheetTotal = sumCents(sheetItems.map(item => item.amountCents));
              const exactSumMatches = exactSheetTotal === sheet.amountCents;
              const paymentDate = paymentDates[sheet.id] ?? todayInSaoPaulo();
              const paymentConfirmed = paymentConfirmations[sheet.id] ?? false;
              return (
                <article className="demo-card demo-sheet-card" key={sheet.id}>
                  <div className="demo-card-heading">
                    <div>
                      <span className="demo-kicker">Folha DEMO</span>
                      <h3>{project?.code ?? "Projeto"} · {project?.name ?? "não encontrado"}</h3>
                      <p>{formatDemoDate(sheet.date)} · {sheet.itemIds.length} item(ns)</p>
                    </div>
                    <DemoStatus tone={sheetStatusTone(sheet.status)}>{sheet.status}</DemoStatus>
                  </div>

                  <div className="demo-sheet-total" aria-label="Total da folha">
                    <span>Total da folha</span>
                    <strong>{formatBrl(sheet.amountCents)}</strong>
                  </div>
                  <div className={`demo-sum-check ${exactSumMatches ? "is-exact" : "is-divergent"}`} role="status">
                    <ShieldCheck size={16} aria-hidden="true" />
                    <span>
                      {exactSumMatches
                        ? `Soma exata conferida: ${formatBrl(exactSheetTotal)}`
                        : `Divergência: itens ${formatBrl(exactSheetTotal)} vs. folha ${formatBrl(sheet.amountCents)}`}
                    </span>
                  </div>

                  {sheet.titleId ? (
                    <p className="demo-inline-note">
                      Título criado em Contas a pagar: <Link className="text-link" href="/demo/contas">M3 · {sheet.titleId}</Link>
                    </p>
                  ) : null}

                  {sheet.status === "aberta" ? (
                    <div className="demo-actions demo-sheet-actions">
                      <button
                        className="demo-button demo-button-primary"
                        type="button"
                        onClick={() => handleApproveSheet(sheet.id)}
                        disabled={!exactSumMatches}
                      >
                        <CheckCircle2 size={16} aria-hidden="true" /> Aprovar folha
                      </button>
                      <button className="demo-button demo-button-danger" type="button" onClick={() => handleCancelSheet(sheet)}>
                        <XCircle size={16} aria-hidden="true" /> Cancelar folha
                      </button>
                    </div>
                  ) : null}

                  {sheet.status === "aprovada_demo" ? (
                    <div className="demo-form demo-payment-form">
                      <div className="demo-field">
                        <label className="demo-label" htmlFor={`payment-date-${sheet.id}`}>Data do pagamento simulado</label>
                        <input
                          className="demo-input"
                          id={`payment-date-${sheet.id}`}
                          type="date"
                          value={paymentDate}
                          onChange={event => setPaymentDates(current => ({ ...current, [sheet.id]: event.target.value }))}
                        />
                      </div>
                      <label className="demo-confirmation" htmlFor={`payment-confirmation-${sheet.id}`}>
                        <input
                          id={`payment-confirmation-${sheet.id}`}
                          type="checkbox"
                          checked={paymentConfirmed}
                          onChange={event => setPaymentConfirmations(current => ({ ...current, [sheet.id]: event.target.checked }))}
                        />
                        <span>Confirmo: {PAYMENT_CONFIRMATION}</span>
                      </label>
                      <div className="demo-actions">
                        <button
                          className="demo-button demo-button-primary"
                          type="button"
                          disabled={!paymentConfirmed || !paymentDate || !exactSumMatches}
                          onClick={() => handlePaySheet(sheet)}
                        >
                          <CheckCircle2 size={16} aria-hidden="true" /> Pagar demonstrativamente
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {sheet.status === "paga_simulada" ? (
                    <div className="demo-paid-note" role="status">
                      <CheckCircle2 size={16} aria-hidden="true" />
                      <span>Baixa local concluída com status <strong>paga_simulada</strong>. O lançamento segue disponível para conferência no M6.</span>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <DemoEmpty title="Nenhuma folha DEMO criada">Crie uma folha a partir dos itens pendentes de um projeto.</DemoEmpty>
        )}
      </section>

      <div className="demo-card demo-local-boundary" role="note">
        <ShieldCheck size={19} aria-hidden="true" />
        <div>
          <strong>Simulação local e soma rastreável</strong>
          <p>Todos os valores são calculados em centavos inteiros, a folha fecha exatamente com suas linhas e nenhuma chamada a banco, Connect ou Itaú é realizada.</p>
        </div>
      </div>
    </DemoPageShell>
  );
}
