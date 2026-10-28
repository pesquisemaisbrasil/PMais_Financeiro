import { Search, SlidersHorizontal, X } from "lucide-react";
import { useMemo, useState } from "react";
import { groupLabels, modules, type ModuleGroup } from "@shared/catalog";
import { ModuleCard, PageHeader } from "@/components/ProductComponents";

const groups: Array<"todos" | ModuleGroup> = ["todos", "operacao", "planejamento", "analise"];

export default function ModulesCatalog() {
  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<(typeof groups)[number]>("todos");
  const filteredModules = useMemo(() => {
    const normalize = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    const normalizedQuery = normalize(query.trim());
    return modules.filter(module => {
      const matchesGroup = selectedGroup === "todos" || module.group === selectedGroup;
      const searchable = normalize([module.title, module.shortTitle, module.description, groupLabels[module.group]].join(" "));
      return matchesGroup && (!normalizedQuery || searchable.includes(normalizedQuery));
    });
  }, [query, selectedGroup]);

  return (
    <div className="page-stack">
      <PageHeader eyebrow="Produto / Catálogo" title="Módulos"
        description="Explore o mapa informativo do P+ Financeiro. Cada guia mostra intenção, fluxo, dependências e salvaguardas — não uma operação ativa." />
      <section className="catalog-toolbar" aria-label="Filtros do catálogo">
        <div className="search-control">
          <label className="search-label" htmlFor="module-search">Buscar módulos</label>
          <div className="search-field">
            <Search size={18} aria-hidden="true" />
            <input id="module-search" type="search" value={query} onChange={event => setQuery(event.target.value)}
              placeholder="Nome ou descrição" />
            {query ? <button type="button" className="clear-search" onClick={() => setQuery("")} aria-label="Limpar busca">
              <X size={16} aria-hidden="true" />
            </button> : null}
          </div>
        </div>
        <div className="filter-label"><SlidersHorizontal size={16} aria-hidden="true" /> Filtrar por grupo</div>
      </section>
      <div className="catalog-tabs" role="group" aria-label="Filtrar por grupo de módulos">
        {groups.map(group => (
          <button type="button" aria-pressed={selectedGroup === group}
            className={`catalog-tab${selectedGroup === group ? " is-selected" : ""}`}
            key={group} onClick={() => setSelectedGroup(group)}>
            {group === "todos" ? "Todos" : groupLabels[group]}
          </button>
        ))}
      </div>
      <div className="catalog-result-line" role="status" aria-live="polite">
        <span><strong>{filteredModules.length}</strong> {filteredModules.length === 1 ? "módulo encontrado" : "módulos encontrados"}</span>
        <span>Catálogo de produto, sem registros</span>
      </div>
      {filteredModules.length ? (
        <section className="module-grid" aria-label="Módulos do catálogo">
          {filteredModules.map(module => <ModuleCard key={module.id} module={module} />)}
        </section>
      ) : (
        <div className="empty-state">
          <Search size={24} aria-hidden="true" />
          <h2>Nenhum módulo corresponde à busca</h2>
          <p>Altere o termo ou remova o filtro para consultar o catálogo completo.</p>
          <button type="button" className="button-secondary" onClick={() => { setQuery(""); setSelectedGroup("todos"); }}>Limpar filtros</button>
        </div>
      )}
    </div>
  );
}
