import { ArrowRight, BookOpen, KeyRound, Network, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { modules } from "@shared/catalog";
import { ModuleCard, PageHeader, ReadOnlyNotice } from "@/components/ProductComponents";
import {
  databaseStateLabel,
  useDeploymentStatus,
  useOnlineStatus,
} from "@/components/DeploymentStatus";

export default function Overview() {
  const status = useDeploymentStatus();
  const isOnline = useOnlineStatus();

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="P+ Financeiro / Fundação"
        title="Visão geral"
        description="Uma base clara para decisões financeiras, com o escopo visível antes de qualquer operação."
      />

      {!isOnline ? (
        <div className="offline-banner" role="status">
          <span className="status-dot status-dot-amber" aria-hidden="true" />
          Você está offline. O estado técnico será consultado novamente quando houver conexão.
        </div>
      ) : null}

      <section className="overview-hero" aria-labelledby="overview-hero-title">
        <div className="hero-copy">
          <p className="hero-kicker">Fundação do produto</p>
          <h2 id="overview-hero-title">Controle começa com clareza.</h2>
          <p>
            Esta é uma camada informativa de implantação. Ela organiza os sete módulos previstos,
            suas dependências e salvaguardas, sem expor registros financeiros ou pessoais.
          </p>
          <div className="hero-actions">
            <Link className="button-primary" href="/implantacao">
              Ver implantação <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <Link className="button-secondary" href="/modulos">
              Explorar módulos
            </Link>
          </div>
        </div>
        <div className="phase-marker" aria-label="Fase atual: Fundação em construção">
          <div className="phase-marker-line" aria-hidden="true">
            <span className="phase-marker-dot phase-marker-dot-active" />
            <span className="phase-marker-dot" />
            <span className="phase-marker-dot" />
          </div>
          <div>
            <span className="phase-label">Status da fase</span>
            <strong>Fundação em construção</strong>
            <small>Leitura técnica e catálogo do produto</small>
          </div>
        </div>
      </section>

      <section className="overview-stat-grid" aria-label="Resumo da implantação">
        <div className="stat-card">
          <span className="stat-icon stat-icon-blue"><Network size={18} aria-hidden="true" /></span>
          <div><strong>{modules.length}</strong><span>módulos previstos no catálogo</span></div>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-green"><ShieldCheck size={18} aria-hidden="true" /></span>
          <div><strong>Somente leitura</strong><span>sem dados financeiros nesta etapa</span></div>
        </div>
        <div className="stat-card">
          <span className="stat-icon stat-icon-purple"><BookOpen size={18} aria-hidden="true" /></span>
          <div><strong>Base informativa</strong><span>fluxos e salvaguardas documentados</span></div>
        </div>
      </section>

      <div className="section-heading-row">
        <div>
          <p className="eyebrow">O que está disponível</p>
          <h2>Uma leitura organizada do produto</h2>
        </div>
        <Link className="text-link" href="/documentacao">Como usar este guia <ArrowRight size={15} aria-hidden="true" /></Link>
      </div>
      <section className="overview-feature-grid">
        <article className="feature-card feature-card-accent">
          <div className="feature-card-icon"><Network size={19} aria-hidden="true" /></div>
          <h3>Catálogo e dependências</h3>
          <p>Sete módulos previstos com grupo, pré-requisito, fluxo e capacidades descritos de forma sanitizada.</p>
          <Link className="text-link" href="/modulos">Abrir catálogo <ArrowRight size={15} aria-hidden="true" /></Link>
        </article>
        <article className="feature-card">
          <div className="feature-card-icon feature-card-icon-cyan"><ShieldCheck size={19} aria-hidden="true" /></div>
          <h3>Salvaguardas explícitas</h3>
          <p>Regras de confirmação humana, precisão e separação do Connect aparecem antes de qualquer módulo operacional.</p>
          <Link className="text-link" href="/seguranca">Ler segurança <ArrowRight size={15} aria-hidden="true" /></Link>
        </article>
        <article className="feature-card">
          <div className="feature-card-icon feature-card-icon-purple"><KeyRound size={19} aria-hidden="true" /></div>
          <h3>Acesso ainda não ativo</h3>
          <p>Login, MFA e operações administrativas aguardam a configuração de segurança. Nenhum formulário é oferecido aqui.</p>
          <Link className="text-link" href="/acesso">Entender o adiamento <ArrowRight size={15} aria-hidden="true" /></Link>
        </article>
      </section>

      <section className="status-summary-card" aria-labelledby="status-summary-title">
        <div className="status-summary-heading">
          <div>
            <p className="eyebrow">Consulta ao servidor</p>
            <h2 id="status-summary-title">Estado técnico</h2>
          </div>
          <Link className="button-quiet" href="/implantacao">Ver detalhes <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
        {status.isPending ? (
          <div className="status-inline-loading" role="status"><span className="loading-spinner" /> Consultando o estado atual…</div>
        ) : status.isError ? (
          <div className="inline-error" role="alert">Não foi possível consultar o estado técnico. Acesse Implantação para tentar novamente.</div>
        ) : status.data ? (
          <div className="status-summary-grid">
            <div><span>Modo</span><strong>Somente leitura</strong></div>
            <div><span>Banco</span><strong>{databaseStateLabel(status.data.database.state)}</strong></div>
            <div><span>Connect</span><strong>{status.data.connect.validated ? "Validado" : "Não validado"}</strong></div>
          </div>
        ) : null}
      </section>

      <ReadOnlyNotice>Nenhum dado financeiro está disponível nesta etapa.</ReadOnlyNotice>

      <section className="catalog-preview" aria-labelledby="catalog-preview-title">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">Visão do catálogo</p>
            <h2 id="catalog-preview-title">Módulos previstos</h2>
          </div>
          <Link className="text-link" href="/modulos">Ver todos <ArrowRight size={15} aria-hidden="true" /></Link>
        </div>
        <div className="module-grid module-grid-preview">
          {modules.slice(0, 3).map(module => <ModuleCard key={module.id} module={module} />)}
        </div>
      </section>
    </div>
  );
}
