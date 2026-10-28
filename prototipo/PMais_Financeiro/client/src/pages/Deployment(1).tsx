import { AlertTriangle, Check, CircleSlash2, Database, RefreshCw, Server, ShieldCheck, Unplug } from "lucide-react";
import { Link } from "wouter";
import { PageHeader, ReadOnlyNotice } from "@/components/ProductComponents";
import {
  databaseStateLabel,
  formatCheckedAt,
  useDeploymentStatus,
  useOnlineStatus,
} from "@/components/DeploymentStatus";

function LoadingLine() {
  return <div className="status-inline-loading" role="status"><span className="loading-spinner" /> Consultando o estado atual…</div>;
}

function StateIcon({ ok }: { ok: boolean }) {
  return ok ? <Check size={16} aria-hidden="true" /> : <CircleSlash2 size={16} aria-hidden="true" />;
}

export default function Deployment() {
  const status = useDeploymentStatus();
  const isOnline = useOnlineStatus();

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Fundação / Operação técnica"
        title="Implantação"
        description="O estado abaixo é consultado no servidor. Quando a consulta falha, nenhum resultado é inferido ou substituído por exemplo."
        action={
          <button type="button" className="button-secondary" onClick={() => void status.refetch()} disabled={status.isFetching}>
            <RefreshCw size={16} className={status.isFetching ? "spin" : ""} aria-hidden="true" />
            {status.isFetching ? "Consultando…" : "Atualizar estado"}
          </button>
        }
      />

      {!isOnline ? (
        <div className="offline-banner" role="alert">
          <span className="status-dot status-dot-amber" aria-hidden="true" />
          Sem conexão. A atualização depende do retorno da rede.
        </div>
      ) : null}

      {status.isPending ? <LoadingLine /> : null}
      {status.isError ? (
        <section className="error-state-card" role="alert">
          <div className="error-state-icon"><AlertTriangle size={20} aria-hidden="true" /></div>
          <div><h2>Estado técnico indisponível</h2><p>Não foi possível consultar o servidor agora. Tente novamente sem assumir que o estado foi confirmado.</p></div>
          <button type="button" className="button-primary" onClick={() => void status.refetch()} disabled={status.isFetching}>Tentar novamente</button>
        </section>
      ) : null}

      {status.data ? (
        <>
          <section className="deployment-hero-card" aria-labelledby="deployment-status-title">
            <div className="deployment-hero-copy">
              <span className="status-pill status-pill-blue"><span className="status-dot status-dot-blue" aria-hidden="true" /> Fundação em construção</span>
              <h2 id="deployment-status-title">Modo implantação · somente leitura</h2>
              <p>O produto ainda não está habilitado para dados de negócio, contas ou operações financeiras.</p>
            </div>
            <div className="checked-at">
              <span>Última consulta confirmada</span>
              <strong>{formatCheckedAt(status.data.checkedAt)}</strong>
            </div>
          </section>

          <section className="technical-grid" aria-label="Estado técnico confirmado">
            <article className="technical-card">
              <div className="technical-card-heading"><span className="technical-icon technical-icon-blue"><Server size={18} aria-hidden="true" /></span><span>Aplicação</span></div>
              <strong>P+ Financeiro</strong><small>Modo: {status.data.mode === "read_only" ? "somente leitura" : status.data.mode}</small>
            </article>
            <article className="technical-card">
              <div className="technical-card-heading"><span className="technical-icon technical-icon-cyan"><Database size={18} aria-hidden="true" /></span><span>Banco</span></div>
              <strong>{databaseStateLabel(status.data.database.state)}</strong><small>Consulta técnica sem dados de negócio</small>
            </article>
            <article className="technical-card">
              <div className="technical-card-heading"><span className="technical-icon technical-icon-amber"><Unplug size={18} aria-hidden="true" /></span><span>Connect</span></div>
              <strong>{status.data.connect.validated ? "Validado" : "Não validado"}</strong><small>Integração ativa não disponível</small>
            </article>
          </section>

          <section className="deployment-detail-card" aria-labelledby="security-state-title">
            <div className="panel-heading">
              <div className="panel-icon panel-icon-purple"><ShieldCheck size={18} aria-hidden="true" /></div>
              <div><p className="eyebrow">Gates de segurança</p><h2 id="security-state-title">O que permanece bloqueado</h2></div>
            </div>
            <div className="deployment-check-list">
              <div><StateIcon ok={status.data.security.signingConfigured} /><span>Assinatura de serviço</span><strong>{status.data.security.signingConfigured ? "Configurada" : "Aguardando configuração"}</strong></div>
              <div><StateIcon ok={status.data.security.mfaConfigured} /><span>Configuração de MFA</span><strong>{status.data.security.mfaConfigured ? "Configurada" : "Aguardando configuração"}</strong></div>
              <div><StateIcon ok={status.data.security.accessEnabled} /><span>Acesso a áreas protegidas</span><strong>{status.data.security.accessEnabled ? "Ativo" : "Não ativo"}</strong></div>
              <div><StateIcon ok={status.data.businessDataEnabled} /><span>Dados de negócio</span><strong>{status.data.businessDataEnabled ? "Disponíveis" : "Não disponíveis"}</strong></div>
            </div>
          </section>
        </>
      ) : null}

      <ReadOnlyNotice>Login, MFA e operações administrativas aguardam a configuração de segurança.</ReadOnlyNotice>
      <div className="page-bottom-link"><Link className="text-link" href="/seguranca">Consultar salvaguardas de segurança <ShieldCheck size={15} aria-hidden="true" /></Link></div>
    </div>
  );
}
