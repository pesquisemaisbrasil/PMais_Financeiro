import { BookOpen, Check, Printer, Route, ShieldCheck } from "lucide-react";
import { Link } from "wouter";
import { PageHeader, ReadOnlyNotice } from "@/components/ProductComponents";

const sections = [
  { icon: Route, title: "1. Explore a demonstração", text: "A barra lateral abre os sete módulos. Cadastros, títulos, provisões, folhas, movimentos e relatórios usam o mesmo estado sintético deste navegador." },
  { icon: BookOpen, title: "2. Teste um fluxo", text: "Converta uma provisão em título ou aprove uma folha; simule sua liquidação; depois abra Conciliação e Relatórios para ver o efeito local. Use Restaurar demonstração no dashboard para recomeçar." },
  { icon: ShieldCheck, title: "3. Leia os gates", text: "Estados como Aguarda integração e Aguarda definição indicam dependências reais, não tarefas que podem ser executadas nesta base." },
];

export default function Documentation() {
  return (
    <div className="page-stack print-page">
      <PageHeader
        eyebrow="Referência / Uso"
        title="Documentação"
        description="Um guia curto para interpretar esta interface de implantação sem confundir documentação com operação financeira."
        action={<button type="button" className="button-secondary no-print" onClick={() => window.print()}><Printer size={16} aria-hidden="true" /> Imprimir guia</button>}
      />

      <section className="documentation-callout">
        <BookOpen size={21} aria-hidden="true" />
        <div><strong>MOCKUP • DADOS SINTÉTICOS • NENHUMA OPERAÇÃO REAL</strong><p>As ações alteram somente o estado local do navegador. Entre com o acesso compartilhado à demonstração e use Sair no cabeçalho. O servidor continua sem operações financeiras, contas individuais ou MFA; não existe integração ativa com Connect ou banco. Não insira dados reais.</p></div>
      </section>

      <section className="documentation-steps" aria-label="Como usar a interface">
        {sections.map(({ icon: Icon, title, text }) => (
          <article key={title} className="documentation-step"><span className="step-icon"><Icon size={18} aria-hidden="true" /></span><h2>{title}</h2><p>{text}</p></article>
        ))}
      </section>

      <section className="documentation-two-column">
        <article className="documentation-panel">
          <p className="eyebrow">Configuração</p>
          <h2>O que acontece depois</h2>
          <ul className="documentation-list">
            <li><Check size={16} aria-hidden="true" /> Chaves e políticas serão tratadas em ambiente protegido.</li>
            <li><Check size={16} aria-hidden="true" /> Integrações só avançam após contrato e validação do Connect.</li>
            <li><Check size={16} aria-hidden="true" /> Dados de negócio só entram com autorização e controles aprovados.</li>
          </ul>
        </article>
        <article className="documentation-panel">
          <p className="eyebrow">Conteúdo seguro</p>
          <h2>O que não é exibido</h2>
          <ul className="documentation-list">
            <li><Check size={16} aria-hidden="true" /> Documentos internos completos ou transcrições.</li>
            <li><Check size={16} aria-hidden="true" /> Senha configurada, segredos ou dados pessoais; o identificador demo não é um perfil financeiro.</li>
            <li><Check size={16} aria-hidden="true" /> Saldos, documentos e registros financeiros reais; os números do mockup são exclusivamente sintéticos.</li>
          </ul>
        </article>
      </section>

      <div className="documentation-links no-print">
        <Link className="text-link" href="/modulos">Explorar módulos <span aria-hidden="true">→</span></Link>
        <Link className="text-link" href="/implantacao">Ver estado de implantação <span aria-hidden="true">→</span></Link>
      </div>
      <ReadOnlyNotice>A demonstração local não comprova integração, auditoria, segurança de acesso ou prontidão para operar dados financeiros reais.</ReadOnlyNotice>
    </div>
  );
}
