import { ArrowLeft, ArrowRight, CheckCircle2, LockKeyhole, Route, ShieldCheck } from "lucide-react";
import { Link, useRoute } from "wouter";
import { modules, groupLabels, readinessLabels } from "@shared/catalog";
import { PageHeader, ReadinessBadge, ReadOnlyNotice, SafeguardList } from "@/components/ProductComponents";
import NotFound from "@/pages/NotFound";

export default function ModuleGuide() {
  const [, params] = useRoute<{ id: string }>("/modulos/:id");
  const module = modules.find(item => item.id === params?.id);

  if (!module) return <NotFound />;

  const moduleIndex = modules.findIndex(item => item.id === module.id);
  const nextModule = modules[moduleIndex + 1];

  return (
    <div className="page-stack">
      <Link className="back-link" href="/modulos"><ArrowLeft size={16} aria-hidden="true" /> Voltar ao catálogo</Link>
      <PageHeader
        eyebrow={`Módulo ${module.number} / ${groupLabels[module.group]}`}
        title={module.title}
        description={module.description}
        action={<ReadinessBadge readiness={module.readiness} />}
      />

      <section className="module-guide-summary">
        <div>
          <span className="summary-label">Pré-requisito desta etapa</span>
          <p>{module.prerequisite}</p>
        </div>
        <div className="summary-status">
          <span className="status-dot status-dot-amber" aria-hidden="true" />
          <div><strong>{readinessLabels[module.readiness]}</strong><span>Guia informativo, sem operação disponível</span></div>
        </div>
      </section>

      <div className="module-guide-layout">
        <section className="timeline-panel" aria-labelledby="flow-title">
          <div className="panel-heading">
            <div className="panel-icon panel-icon-blue"><Route size={18} aria-hidden="true" /></div>
            <div><p className="eyebrow">Roteiro conceitual</p><h2 id="flow-title">Como o fluxo se organiza</h2></div>
          </div>
          <ol className="flow-timeline">
            {module.flow.map((step, index) => (
              <li key={step}>
                <span className="timeline-index">{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{step}</strong><span>Etapa prevista para uma fase posterior, após os gates necessários.</span></div>
              </li>
            ))}
          </ol>
        </section>

        <section className="safeguards-panel" aria-labelledby="safeguards-title">
          <div className="panel-heading">
            <div className="panel-icon panel-icon-green"><ShieldCheck size={18} aria-hidden="true" /></div>
            <div><p className="eyebrow">Regras preservadas</p><h2 id="safeguards-title">Salvaguardas</h2></div>
          </div>
          <SafeguardList items={module.safeguards} />
          <div className="safeguard-footnote"><LockKeyhole size={15} aria-hidden="true" /> A implementação futura deve validar cada regra no servidor.</div>
        </section>
      </div>

      <section className="capabilities-section" aria-labelledby="capabilities-title">
        <div className="section-heading-row">
          <div><p className="eyebrow">Escopo previsto</p><h2 id="capabilities-title">Capacidades descritas</h2></div>
          <span className="muted-note"><CheckCircle2 size={15} aria-hidden="true" /> Somente documentação</span>
        </div>
        <div className="capability-list">
          {module.capabilities.map(capability => <span key={capability} className="capability-chip">{capability}</span>)}
        </div>
      </section>

      <ReadOnlyNotice>Nenhuma operação deste módulo está disponível. Este guia não cria registros nem solicita credenciais.</ReadOnlyNotice>

      {nextModule ? (
        <div className="next-module-row">
          <div><span className="eyebrow">Próximo no catálogo</span><strong>{nextModule.number} · {nextModule.title}</strong></div>
          <Link className="button-secondary" href={`/modulos/${nextModule.id}`}>Ver próximo guia <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
      ) : null}
    </div>
  );
}
