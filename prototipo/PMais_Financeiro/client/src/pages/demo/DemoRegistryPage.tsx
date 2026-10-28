import { confirmDemo } from "@/lib/demoConfirm";
import { useState, type FormEvent } from "react";
import DemoCentersPanel from "@/components/DemoCentersPanel";
import {
  DemoEmpty,
  DemoPageShell,
  DemoPanel,
  DemoStatus,
} from "@/components/DemoComponents";
import { useDemoStore } from "@/contexts/DemoStore";
import {
  formatBrl,
  parseBrlToCents,
  partyById,
  type DemoPartyType,
} from "@/lib/demoModel";

type Notice = {
  kind: "success" | "error";
  text: string;
};

const partyTypeLabels: Record<DemoPartyType, string> = {
  fornecedor: "Fornecedor",
  cliente: "Cliente",
};

function formatProjectStatus(status: "ativo" | "fechado"): string {
  return status === "ativo" ? "Ativo" : "Fechado";
}

export default function DemoRegistryPage() {
  const {
    state,
    addParty,
    toggleParty,
    renameParty,
    addCategory,
    addProject,
    setProjectStatus,
  } = useDemoStore();

  const [notice, setNotice] = useState<Notice | null>(null);

  const [partyName, setPartyName] = useState("");
  const [editingPartyId, setEditingPartyId] = useState<string | null>(null);
  const [partySearch, setPartySearch] = useState("");
  const [partyType, setPartyType] = useState<DemoPartyType>("fornecedor");

  const [categoryName, setCategoryName] = useState("");
  const [categoryCode, setCategoryCode] = useState("");
  const [categoryType, setCategoryType] = useState<"despesa" | "receita">(
    "despesa"
  );

  const [projectCode, setProjectCode] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectClientId, setProjectClientId] = useState("");
  const [projectBudget, setProjectBudget] = useState("");

  const activeClients = state.parties.filter(
    party => party.type === "cliente" && party.active
  );

  function announceSuccess(text: string) {
    setNotice({ kind: "success", text });
  }

  function announceError(text: string) {
    setNotice({ kind: "error", text });
  }

  function handlePartySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    const result = editingPartyId ? renameParty(editingPartyId, partyName) : addParty({ name: partyName, type: partyType });
    if (!result.ok) {
      announceError(result.message);
      return;
    }

    setPartyName("");
    setEditingPartyId(null);
    announceSuccess("Cadastro DEMO salvo. IDs e histórico preservados.");
  }

  function handleCategorySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    const result = addCategory({
      name: categoryName,
      code: categoryCode,
      type: categoryType,
    });
    if (!result.ok) {
      announceError(result.message);
      return;
    }

    setCategoryName("");
    setCategoryCode("");
    announceSuccess("Categoria criada no estado DEMO.");
  }

  function handleProjectSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    const budgetCents = parseBrlToCents(projectBudget);
    if (budgetCents === null) {
      announceError(
        "Informe um orçamento sintético válido, como R$ 24.000,00."
      );
      return;
    }

    const result = addProject({
      code: projectCode,
      name: projectName,
      clientId: projectClientId,
      budgetCents,
    });
    if (!result.ok) {
      announceError(result.message);
      return;
    }

    setProjectCode("");
    setProjectName("");
    setProjectBudget("");
    announceSuccess("Projeto criado no estado DEMO com orçamento sintético.");
  }

  function handlePartyStatus(
    partyId: string,
    isActive: boolean,
    partyNameForNotice: string
  ) {
    toggleParty(partyId);
    announceSuccess(
      `${partyNameForNotice} foi ${isActive ? "inativado" : "reativado"} na simulação. O histórico foi preservado.`
    );
  }

  async function handleProjectStatus(
    projectId: string,
    currentStatus: "ativo" | "fechado",
    projectNameForNotice: string
  ) {
    const nextStatus = currentStatus === "ativo" ? "fechado" : "ativo";
    const action = nextStatus === "fechado" ? "fechar" : "reabrir";
    const confirmed = await confirmDemo(
      `Deseja ${action} ${projectNameForNotice}? Esta ação somente altera a simulação DEMO local.`
    );
    if (!confirmed) return;

    setProjectStatus(projectId, nextStatus);
    announceSuccess(
      `${projectNameForNotice} agora está ${formatProjectStatus(nextStatus).toLowerCase()}. Esta alteração somente afeta a simulação DEMO.`
    );
  }

  return (
    <DemoPageShell
      module="M2 Cadastros"
      title="Cadastros DEMO"
      description="Crie registros sintéticos para explorar fornecedores, clientes, categorias e projetos sem conectar serviços ou movimentar dados reais."
      actions={<DemoStatus tone="info">Somente simulação local</DemoStatus>}
    >
      {notice?.kind === "success" ? (
        <div
          className="demo-status demo-status-positive"
          role="status"
          aria-live="polite"
        >
          {notice.text}
        </div>
      ) : null}
      {notice?.kind === "error" ? (
        <div
          className="demo-status demo-status-danger"
          role="alert"
          aria-live="assertive"
        >
          {notice.text}
        </div>
      ) : null}

      <DemoCentersPanel />
      <div className="demo-grid demo-grid-3">
        <DemoPanel
          title={editingPartyId ? "Editar cadastro DEMO" : "Novo fornecedor ou cliente"}
          subtitle="Use apenas um nome demonstrativo; a store acrescenta o prefixo DEMO."
        >
          <form className="demo-form" onSubmit={handlePartySubmit}>
            <div className="demo-field">
              <label className="demo-label" htmlFor="demo-party-name">
                Nome demonstrativo
              </label>
              <input
                id="demo-party-name"
                className="demo-input"
                value={partyName}
                onChange={event => setPartyName(event.currentTarget.value)}
                placeholder="Ex.: Operação Horizonte"
                required
              />
            </div>
            <div className="demo-field">
              <label className="demo-label" htmlFor="demo-party-type">
                Tipo de cadastro
              </label>
              <select
                id="demo-party-type"
                className="demo-select"
                disabled={editingPartyId !== null}
                value={partyType}
                onChange={event =>
                  setPartyType(event.currentTarget.value as DemoPartyType)
                }
              >
                <option value="fornecedor">Fornecedor</option>
                <option value="cliente">Cliente</option>
              </select>
            </div>
            <div className="demo-actions">
              <button className="demo-button" type="submit">
                {editingPartyId ? "Salvar edição DEMO" : "Criar cadastro DEMO"}
              </button>
              {editingPartyId ? <button type="button" className="demo-button" onClick={() => { setEditingPartyId(null); setPartyName(""); }}>Cancelar edição</button> : null}
            </div>
          </form>
        </DemoPanel>

        <DemoPanel
          title="Nova categoria sintética"
          subtitle="Código e nome são demonstrativos e não representam uma classificação real."
        >
          <form className="demo-form" onSubmit={handleCategorySubmit}>
            <div className="demo-field">
              <label className="demo-label" htmlFor="demo-category-name">
                Nome da categoria
              </label>
              <input
                id="demo-category-name"
                className="demo-input"
                value={categoryName}
                onChange={event => setCategoryName(event.currentTarget.value)}
                placeholder="Ex.: Pesquisa exploratória"
                required
              />
            </div>
            <div className="demo-field">
              <label className="demo-label" htmlFor="demo-category-code">
                Código sintético
              </label>
              <input
                id="demo-category-code"
                className="demo-input"
                value={categoryCode}
                onChange={event => setCategoryCode(event.currentTarget.value)}
                placeholder="Ex.: SINT-04"
                required
              />
            </div>
            <div className="demo-field">
              <label className="demo-label" htmlFor="demo-category-type">
                Natureza
              </label>
              <select
                id="demo-category-type"
                className="demo-select"
                value={categoryType}
                onChange={event =>
                  setCategoryType(
                    event.currentTarget.value as "despesa" | "receita"
                  )
                }
              >
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
              </select>
            </div>
            <div className="demo-actions">
              <button className="demo-button" type="submit">
                Criar categoria DEMO
              </button>
            </div>
          </form>
        </DemoPanel>

        <DemoPanel
          title="Novo projeto DEMO"
          subtitle="O projeto precisa de um cliente DEMO ativo e de um orçamento sintético."
        >
          <form className="demo-form" onSubmit={handleProjectSubmit}>
            <div className="demo-field">
              <label className="demo-label" htmlFor="demo-project-code">
                Código do projeto
              </label>
              <input
                id="demo-project-code"
                className="demo-input"
                value={projectCode}
                onChange={event => setProjectCode(event.currentTarget.value)}
                placeholder="Ex.: 003"
                required
              />
            </div>
            <div className="demo-field">
              <label className="demo-label" htmlFor="demo-project-name">
                Nome do projeto
              </label>
              <input
                id="demo-project-name"
                className="demo-input"
                value={projectName}
                onChange={event => setProjectName(event.currentTarget.value)}
                placeholder="Ex.: Piloto de mercado"
                required
              />
            </div>
            <div className="demo-field">
              <label className="demo-label" htmlFor="demo-project-client">
                Cliente DEMO ativo
              </label>
              <select
                id="demo-project-client"
                className="demo-select"
                value={projectClientId}
                onChange={event =>
                  setProjectClientId(event.currentTarget.value)
                }
                required
              >
                <option value="">Selecione um cliente DEMO</option>
                {activeClients.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="demo-field">
              <label className="demo-label" htmlFor="demo-project-budget">
                Orçamento sintético
              </label>
              <input
                id="demo-project-budget"
                className="demo-input"
                value={projectBudget}
                onChange={event => setProjectBudget(event.currentTarget.value)}
                placeholder="R$ 24.000,00"
                inputMode="decimal"
                required
              />
            </div>
            <div className="demo-actions">
              <button className="demo-button" type="submit">
                Criar projeto DEMO
              </button>
            </div>
          </form>
        </DemoPanel>
      </div>

      <div className="demo-grid demo-grid-2">
        <DemoPanel
          title="Fornecedores e clientes"
          subtitle="Busque, edite o nome ou inative. IDs e vínculos históricos permanecem; nenhum cadastro é removido."
        >
          <div className="demo-field" style={{ marginBottom: 14 }}><label htmlFor="demo-party-search">Buscar fornecedor ou cliente DEMO</label><input id="demo-party-search" className="demo-input" value={partySearch} onChange={event => setPartySearch(event.target.value)} /></div>
          {state.parties.length === 0 ? (
            <DemoEmpty title="Nenhum cadastro DEMO ainda">
              Crie um fornecedor ou cliente para começar a simulação.
            </DemoEmpty>
          ) : (
            <div className="demo-table-wrap">
              <table className="demo-table">
                <thead>
                  <tr>
                    <th scope="col">Nome</th>
                    <th scope="col">Tipo</th>
                    <th scope="col">Estado</th>
                    <th scope="col">
                      <span className="sr-only">Ação</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {state.parties.filter(party => `${party.name} ${party.type}`.toLocaleLowerCase("pt-BR").includes(partySearch.toLocaleLowerCase("pt-BR"))).map(party => (
                    <tr key={party.id}>
                      <td>{party.name}</td>
                      <td>{partyTypeLabels[party.type]}</td>
                      <td>
                        <DemoStatus
                          tone={party.active ? "positive" : "warning"}
                        >
                          {party.active ? "Ativo" : "Inativo"}
                        </DemoStatus>
                      </td>
                      <td>
                        <button type="button" className="demo-button" onClick={() => { setEditingPartyId(party.id); setPartyType(party.type); setPartyName(party.name.replace(/^DEMO\s*[—:-]\s*/i, "")); document.getElementById("demo-party-name")?.focus(); }}>Editar DEMO</button>
                        <button
                          className="demo-button"
                          type="button"
                          onClick={() =>
                            handlePartyStatus(
                              party.id,
                              party.active,
                              party.name
                            )
                          }
                        >
                          {party.active ? "Inativar" : "Reativar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DemoPanel>

        <DemoPanel
          title="Categorias"
          subtitle="Categorias sintéticas ficam disponíveis para consulta neste mockup."
        >
          {state.categories.length === 0 ? (
            <DemoEmpty title="Nenhuma categoria DEMO ainda">
              Crie uma categoria sintética no formulário acima.
            </DemoEmpty>
          ) : (
            <div className="demo-table-wrap">
              <table className="demo-table">
                <thead>
                  <tr>
                    <th scope="col">Categoria</th>
                    <th scope="col">Código</th>
                    <th scope="col">Natureza</th>
                    <th scope="col">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {state.categories.map(category => (
                    <tr key={category.id}>
                      <td>{category.name}</td>
                      <td>{category.code}</td>
                      <td>
                        {category.type === "despesa" ? "Despesa" : "Receita"}
                      </td>
                      <td>
                        <DemoStatus
                          tone={category.active ? "positive" : "warning"}
                        >
                          {category.active ? "Ativa" : "Inativa"}
                        </DemoStatus>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DemoPanel>
      </div>

      <DemoPanel
        title="Projetos DEMO"
        subtitle="O cliente é exibido pelo relacionamento com partyById; fechar ou reabrir só altera esta simulação local."
      >
        {state.projects.length === 0 ? (
          <DemoEmpty title="Nenhum projeto DEMO ainda">
            Crie um projeto ligado a um cliente DEMO ativo.
          </DemoEmpty>
        ) : (
          <div className="demo-table-wrap">
            <table className="demo-table">
              <thead>
                <tr>
                  <th scope="col">Código</th>
                  <th scope="col">Projeto</th>
                  <th scope="col">Cliente</th>
                  <th scope="col">Orçamento</th>
                  <th scope="col">Estado</th>
                  <th scope="col">
                    <span className="sr-only">Ação</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.projects.map(project => {
                  const client = partyById(state, project.clientId);
                  return (
                    <tr key={project.id}>
                      <td>{project.code}</td>
                      <td>{project.name}</td>
                      <td>{client?.name ?? "Cliente DEMO não encontrado"}</td>
                      <td>{formatBrl(project.budgetCents)}</td>
                      <td>
                        <DemoStatus
                          tone={
                            project.status === "ativo" ? "positive" : "warning"
                          }
                        >
                          {formatProjectStatus(project.status)}
                        </DemoStatus>
                      </td>
                      <td>
                        <button
                          className="demo-button"
                          type="button"
                          onClick={() =>
                            handleProjectStatus(
                              project.id,
                              project.status,
                              project.name
                            )
                          }
                        >
                          {project.status === "ativo" ? "Fechar" : "Reabrir"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </DemoPanel>
    </DemoPageShell>
  );
}
