import { ArrowLeft, FileQuestion } from "lucide-react";
import { useEffect } from "react";
import { Link } from "wouter";

export default function NotFound() {
  useEffect(() => {
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "noindex";
    document.head.appendChild(robots);
    if (window.location.pathname.replace(/\/$/, "") !== "/404") window.location.replace("/404");
    return () => robots.remove();
  }, []);

  return (
    <main className="not-found-page">
      <section className="not-found-card" aria-labelledby="not-found-title">
        <span className="eyebrow">P+ Financeiro • 404</span>
        <FileQuestion size={48} aria-hidden="true" />
        <h1 id="not-found-title">Página não encontrada</h1>
        <p>Este endereço não está disponível. Volte à visão geral para consultar os módulos e o estado da implantação.</p>
        <Link href="/" className="button-primary"><ArrowLeft size={18} aria-hidden="true" /> Voltar à visão geral</Link>
      </section>
    </main>
  );
}
