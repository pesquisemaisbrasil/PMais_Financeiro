import { ArrowRight, KeyRound, ShieldAlert, UsersRound } from "lucide-react";
import { Link } from "wouter";
import { PageHeader, ReadOnlyNotice } from "@/components/ProductComponents";

const deferredAreas = [
  { icon: KeyRound, title: "Login e identidade", text: "A identidade própria do Financeiro será configurada em uma fase protegida, com políticas de senha e mensagens genéricas." },
  { icon: ShieldAlert, title: "MFA obrigatório", text: "O segundo fator depende de configuração segura de chaves. Não há desafio, código ou recuperação simulados neste portal." },
  { icon: UsersRound, title: "Usuários e administração", text: "Papéis, sessões, auditoria e operações administrativas aguardam acesso habilitado no servidor." },
];

export default function Access() {
  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Governança / Acesso"
        title="Acesso"
        description="O identificador adm abre somente esta demonstração. Contas individuais, permissões financeiras e MFA de produção continuam pendentes."
      />

      <section className="access-boundary-card">
        <div className="access-boundary-mark" aria-hidden="true"><span /></div>
        <div>
          <span className="status-pill status-pill-amber"><span className="status-dot status-dot-amber" aria-hidden="true" /> Acesso exclusivo à demonstração</span>
          <h2>Uma entrada para explorar o mockup, não para operar finanças.</h2>
          <p>A senha é validada no servidor e a sessão demo dura até 30 minutos; reiniciar o serviço encerra as sessões. Use Sair no cabeçalho. O identificador compartilhado não cria usuário administrador, MFA ou acesso a registros reais.</p>
        </div>
      </section>

      <section className="deferred-grid" aria-label="Áreas de acesso adiadas">
        {deferredAreas.map(({ icon: Icon, title, text }) => (
          <article className="deferred-card" key={title}>
            <span className="deferred-icon"><Icon size={19} aria-hidden="true" /></span>
            <h2>{title}</h2>
            <p>{text}</p>
            <span className="deferred-label">Adiado nesta etapa</span>
          </article>
        ))}
      </section>

      <section className="next-steps-card">
        <div><p className="eyebrow">Próximo passo seguro</p><h2>Configuração posterior em ambiente protegido</h2><p>Quando os gates forem aprovados, a implantação poderá conectar as políticas de identidade ao servidor. Nenhuma configuração real de chaves é feita aqui.</p></div>
        <Link className="button-secondary" href="/seguranca">Ler salvaguardas <ArrowRight size={15} aria-hidden="true" /></Link>
      </section>
      <ReadOnlyNotice>Acesso demo não substitui autenticação financeira, autorização por papel, MFA, auditoria ou proteção de dados financeiros reais.</ReadOnlyNotice>
    </div>
  );
}
