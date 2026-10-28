import { ArrowRight, LockKeyhole, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { securityRequirements } from "@shared/catalog";
import { PageHeader, ReadOnlyNotice } from "@/components/ProductComponents";

export default function Security() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Governança / Proteção"
        title="Segurança"
        description="As regras abaixo orientam as fases futuras. O portal atual não ativa autenticação, não armazena registros e não oferece operações protegidas."
      />

      <section className="security-intro-card">
        <div className="security-intro-icon"><ShieldCheck size={23} aria-hidden="true" /></div>
        <div><h2>Segurança sem atalhos</h2><p>Login, MFA e operações administrativas aguardam a configuração de segurança. Não há conta demo, credencial padrão ou fallback de acesso nesta etapa.</p></div>
        <Link className="button-secondary" href="/acesso">Ver áreas adiadas <ArrowRight size={15} aria-hidden="true" /></Link>
      </section>

      <section className="security-grid" aria-label="Requisitos e salvaguardas">
        {securityRequirements.map((requirement, index) => (
          <article className="security-card" key={requirement.title}>
            <div className="security-card-topline"><span className="security-number">{String(index + 1).padStart(2, "0")}</span><LockKeyhole size={16} aria-hidden="true" /></div>
            <h2>{requirement.title}</h2>
            <p>{requirement.description}</p>
            <span className={`security-state${requirement.state.includes("Adiad") || requirement.state.includes("requer") ? " security-state-amber" : ""}`}>{requirement.state}</span>
          </article>
        ))}
      </section>

      <section className="security-boundary">
        <div><p className="eyebrow">Fronteira desta entrega</p><h2>Informação, não autorização</h2></div>
        <ul>
          <li>Nenhum dado financeiro está disponível nesta etapa.</li>
          <li>Nenhum documento interno completo, transcrição ou credencial é renderizado.</li>
          <li>Integrações e áreas financeiras permanecem recusadas até os gates correspondentes.</li>
        </ul>
      </section>
      <ReadOnlyNotice>Esta aplicação é somente informativa e somente leitura durante a implantação.</ReadOnlyNotice>
    </div>
  );
}
