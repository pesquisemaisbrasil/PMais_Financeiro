import {
  BookOpen,
  ChevronRight,
  CircleHelp,
  FileText,
  LayoutDashboard,
  Menu,
  Network,
  ShieldCheck,
  X,
  LogOut,
  Wallet, Users, Receipt, FolderKanban, ClipboardList, Landmark, BarChart3,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useDemoAccess } from "@/contexts/DemoAccess";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export type NavigationItem = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

export const navigationItems: NavigationItem[] = [
  {
    href: "/",
    label: "Visão geral",
    description: "Painel de demonstração",
    icon: LayoutDashboard,
  },
  { href: "/demo/pagamentos", label: "Pagamentos de campo", description: "M1 · Entrevistadores DEMO", icon: Wallet },
  { href: "/demo/cadastros", label: "Cadastros", description: "M2 · Base sintética", icon: Users },
  { href: "/demo/contas", label: "Contas a pagar / receber", description: "M3 · Títulos simulados", icon: Receipt },
  { href: "/demo/orcamento", label: "Projetos e orçamento", description: "M4 · Provisões DEMO", icon: FolderKanban },
  { href: "/demo/folha", label: "Folha e lotes", description: "M5 · Ciclos demonstrativos", icon: ClipboardList },
  { href: "/demo/conciliacao", label: "Conciliação", description: "M6 · Movimentos simulados", icon: Landmark },
  { href: "/demo/relatorios", label: "Relatórios", description: "M7 · Análises do mockup", icon: BarChart3 },
  {
    href: "/modulos",
    label: "Módulos",
    description: "Catálogo do produto",
    icon: Network,
  },
  {
    href: "/implantacao",
    label: "Implantação",
    description: "Estado técnico",
    icon: FileText,
  },
  {
    href: "/seguranca",
    label: "Segurança",
    description: "Salvaguardas previstas",
    icon: ShieldCheck,
  },
  {
    href: "/acesso",
    label: "Acesso",
    description: "Áreas adiadas",
    icon: CircleHelp,
  },
  {
    href: "/documentacao",
    label: "Documentação",
    description: "Guia simplificado",
    icon: BookOpen,
  },
];

const getCurrentSection = (pathname: string) => {
  if (pathname.startsWith("/modulos/")) return "Módulos";
  const item = navigationItems.find(({ href }) => href === pathname);
  return item?.label ?? "Página não encontrada";
};

function NavigationLinks({ onNavigate }: { onNavigate?: () => void }) {
  const [location] = useLocation();

  return (
    <nav className="sidebar-nav" aria-label="Navegação principal">
      <p className="sidebar-section-label">Workspace</p>
      {navigationItems.map(item => {
        const Icon = item.icon;
        const isActive =
          item.href === "/"
            ? location === "/"
            : location === item.href || location.startsWith(`${item.href}/`);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`sidebar-link${isActive ? " is-active" : ""}`}
            aria-current={isActive ? "page" : undefined}
          >
            <Icon className="sidebar-link-icon" size={18} aria-hidden="true" />
            <span className="sidebar-link-copy">
              <span>{item.label}</span>
              <small>{item.description}</small>
            </span>
            {isActive ? <ChevronRight className="sidebar-link-chevron" size={16} aria-hidden="true" /> : null}
          </Link>
        );
      })}
    </nav>
  );
}

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`brand-lockup${compact ? " brand-lockup-compact" : ""}`}>
      <img
        src="/manus-storage/Logo2025_branco_2abedc7a.png"
        alt="Pesquise+"
        className="brand-logo"
        onError={event => {
          const image = event.currentTarget;
          if (!image.dataset.localFallback) {
            image.dataset.localFallback = "true";
            image.src = "/brand/Logo2025_branco.png";
          }
        }}
      />
      <span className="brand-tagline">predict the future</span>
    </div>
  );
}

function Sidebar({ className = "" }: { className?: string }) {
  return (
    <aside className={`app-sidebar ${className}`} aria-label="Barra lateral">
      <div className="sidebar-brand">
        <BrandMark />
      </div>
      <NavigationLinks />
      <div className="sidebar-footnote">
        <span className="sidebar-footnote-dot" aria-hidden="true" />
        <div>
          <strong>Modo implantação</strong>
          <span>Mockup local · Nenhuma operação real</span>
        </div>
      </div>
    </aside>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { logout } = useDemoAccess();
  const [leaving, setLeaving] = useState(false);
  const [accessError, setAccessError] = useState("");
  const currentSection = getCurrentSection(location);
  const isModuleGuide = location.startsWith("/modulos/");

  return (
    <div className="app-shell">
      <Sidebar className="desktop-sidebar" />

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="mobile-sidebar-sheet">
          <SheetHeader className="mobile-sidebar-header">
            <BrandMark compact />
            <SheetTitle className="sr-only">Navegação do P+ Financeiro</SheetTitle>
            <SheetDescription className="sr-only">
              Acesse os módulos de demonstração local e os guias de implantação.
            </SheetDescription>
          </SheetHeader>
          <NavigationLinks onNavigate={() => setMobileOpen(false)} />
          <button
            type="button"
            className="mobile-sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Fechar menu"
          >
            <X size={17} aria-hidden="true" />
            Fechar menu
          </button>
        </SheetContent>
      </Sheet>

      <div className="app-main">
        <header className="app-header">
          <div className="header-leading">
            <button
              type="button"
              className="mobile-menu-button"
              onClick={() => setMobileOpen(true)}
              aria-label="Abrir menu principal"
              aria-expanded={mobileOpen}
            >
              <Menu size={21} aria-hidden="true" />
            </button>
            <div className="breadcrumb" aria-label="Trilha de navegação">
              <span>Pesquise+</span>
              <ChevronRight size={14} aria-hidden="true" />
              <strong>{isModuleGuide ? "Módulos" : currentSection}</strong>
            </div>
          </div>
          <div className="header-meta">
            <span className="read-only-chip">
              <span className="read-only-dot" aria-hidden="true" />
              MOCKUP <span aria-hidden="true">•</span> Dados sintéticos · Sem operação real
            </span>
            <button className="button-quiet" type="button" disabled={leaving} aria-label="Sair do acesso de demonstração adm" onClick={async () => {
              setLeaving(true); setAccessError("");
              const result = await logout();
              if (!result.ok) { setAccessError(result.message || "Não foi possível sair. Tente novamente."); setLeaving(false); }
            }}><LogOut size={16} aria-hidden="true" />{leaving ? "Saindo…" : "adm · Sair"}</button>
          </div>
        </header>
        {accessError ? <div className="inline-error" role="alert">{accessError}</div> : null}
        <main className="main-content">{children}</main>
        <footer className="app-footer">
          <span>P+ Financeiro</span>
          <span>Demonstração local · Não insira dados reais</span>
        </footer>
      </div>
    </div>
  );
}
