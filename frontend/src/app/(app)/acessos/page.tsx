"use client";

import { Ban, Check, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CARD, ErrorBox, PageHeader, TD, TH, Tag } from "@/components/finance";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isAdmin } from "@/lib/access";
import { ApiError, decideBrowser, listBrowsers, type BrowserStatus, type TrustedBrowserRow } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { PeopleAdmin } from "./people";

type TabId = "pedidos" | "liberados" | "outros" | "pessoas";
type Action = "liberar" | "recusar" | "revogar";

const TABS: { id: TabId; label: string; statuses: BrowserStatus[]; empty: string }[] = [
  { id: "pedidos", label: "Pedidos", statuses: ["pendente"], empty: "Nenhum pedido esperando." },
  { id: "liberados", label: "Liberados", statuses: ["liberado"], empty: "Nenhum navegador liberado ainda." },
  {
    id: "outros",
    label: "Recusados e revogados",
    statuses: ["recusado", "revogado"],
    empty: "Nenhum navegador recusado ou revogado.",
  },
];

const STATUS: Record<BrowserStatus, { label: string; color: "ambar" | "verde" | "vermelho" | "cinza" }> = {
  pendente: { label: "Esperando", color: "ambar" },
  liberado: { label: "Liberado", color: "verde" },
  recusado: { label: "Recusado", color: "vermelho" },
  revogado: { label: "Revogado", color: "cinza" },
};

const CONFIRM: Record<Action, { title: string; text: (row: TrustedBrowserRow) => string; button: string; done: string }> = {
  liberar: {
    title: "Liberar este computador?",
    text: (row) => `${row.userName} vai poder entrar pelo ${row.label}. Libere só se a pessoa confirmou que é ela.`,
    button: "Liberar",
    done: "Computador liberado. A pessoa já pode entrar.",
  },
  recusar: {
    title: "Recusar este pedido?",
    text: (row) => `${row.userName} não vai entrar pelo ${row.label}. Ela verá o aviso de que o computador não foi liberado.`,
    button: "Recusar",
    done: "Pedido recusado.",
  },
  revogar: {
    title: "Revogar este computador?",
    text: (row) =>
      `${row.userName} não vai mais entrar pelo ${row.label}, e as sessões abertas dela serão encerradas. Se ela tentar entrar de novo por ele, vira um pedido.`,
    button: "Revogar",
    done: "Computador revogado e sessões encerradas.",
  },
};

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" })
    : "—";

/** Os computadores (navegadores) liberados para cada conta. Só administrador (spec acesso-e-auditoria). */
export default function AccessPage() {
  const { user } = useAuth();
  if (!user || !isAdmin(user.role)) {
    return (
      <main className="mx-auto w-full max-w-[1280px] px-6 pb-16 pt-8">
        <PageHeader title="Acessos" icon={ShieldCheck} />
        <p className="text-sm text-muted-foreground">Esta tela é dos administradores.</p>
      </main>
    );
  }
  return <BrowserAdmin myId={user.id} myRole={user.role} />;
}

function BrowserAdmin({ myId, myRole }: { myId: number; myRole: string }) {
  const [rows, setRows] = useState<TrustedBrowserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("pedidos");
  const [asking, setAsking] = useState<{ row: TrustedBrowserRow; action: Action } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await listBrowsers());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar os acessos");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca da tela ao abrir
    void load();
  }, [load]);

  const current = TABS.find((option) => option.id === tab) ?? TABS[0];
  const shown = useMemo(
    () => (rows ?? []).filter((row) => current.statuses.includes(row.status)),
    [rows, current]
  );
  const count = (id: TabId) => (rows ?? []).filter((row) => TABS.find((t) => t.id === id)?.statuses.includes(row.status)).length;

  async function decide() {
    if (!asking) return;
    setBusy(true);
    try {
      await decideBrowser(asking.row.id, asking.action);
      toast.success(CONFIRM[asking.action].done);
      setAsking(null);
      await load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível concluir. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1280px] px-6 pb-16 pt-8">
      <PageHeader
        title="Acessos"
        icon={ShieldCheck}
        subtitle="O Financeiro só abre nos computadores liberados. O primeiro computador de cada pessoa é liberado sozinho, no cadastro do autenticador; os outros chegam aqui como pedido. Ninguém libera o próprio computador."
      />

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} onRetry={load} />
        </div>
      )}

      <div className={cn(CARD, "overflow-hidden")}>
        <div className="border-b border-border px-4 py-3">
          <Tabs value={tab} onValueChange={(value) => setTab(value as TabId)}>
            <TabsList className="h-auto flex-wrap justify-start">
              {TABS.map((option) => (
                <TabsTrigger key={option.id} value={option.id}>
                  {option.label} ({rows ? count(option.id) : "…"})
                </TabsTrigger>
              ))}
              {/* O nível de cada pessoa e as telas bloqueadas (19/11/2026) */}
              <TabsTrigger value="pessoas">Pessoas e telas</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {tab === "pessoas" ? (
          <PeopleAdmin myRole={myRole} />
        ) : !rows ? (
          !error && (
            <div className="flex justify-center p-8">
              <Spinner aria-label="Carregando" className="size-6 text-brand-cinza-escuro/70" />
            </div>
          )
        ) : shown.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Pessoa</TableHead>
                <TableHead className={TH}>Computador</TableHead>
                <TableHead className={TH}>Rede</TableHead>
                <TableHead className={TH}>{tab === "pedidos" ? "Pediu em" : "Situação"}</TableHead>
                {/* Pedido ainda não entrou nenhuma vez: "Visto por último" seria sempre "—" */}
                {tab !== "pedidos" && <TableHead className={TH}>Visto por último</TableHead>}
                <TableHead className={TH} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((row) => {
                const own = row.userId === myId;
                return (
                  <TableRow key={row.id}>
                    <TableCell className={cn(TD, "whitespace-normal")}>
                      <span className="font-semibold text-brand-cinza-escuro">{row.userName}</span>
                      <span className="block text-xs text-muted-foreground">{row.userEmail}</span>
                    </TableCell>
                    <TableCell className={TD}>{row.label}</TableCell>
                    <TableCell className={cn(TD, "tabular-nums")}>{row.ipMasked ?? "—"}</TableCell>
                    <TableCell className={cn(TD, "whitespace-normal")}>
                      {tab === "pedidos" ? (
                        when(row.requestedAt)
                      ) : (
                        <>
                          <Tag color={STATUS[row.status].color}>{STATUS[row.status].label}</Tag>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {row.decidedBy ? `por ${row.decidedBy}, ${when(row.decidedAt)}` : "primeiro computador da conta"}
                          </span>
                        </>
                      )}
                    </TableCell>
                    {tab !== "pedidos" && <TableCell className={TD}>{when(row.lastSeenAt)}</TableCell>}
                    <TableCell className={TD}>
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        {/* O próprio computador não se libera (ADR 0022): o aviso fica escrito, e não num botão apagado */}
                        {row.status !== "liberado" && own && (
                          <span className="max-w-48 text-right text-xs whitespace-normal text-muted-foreground">
                            É o seu computador: outro administrador libera.
                          </span>
                        )}
                        {row.status !== "liberado" && !own && (
                          <Button
                            size="sm"
                            variant={row.status === "pendente" ? "default" : "outline"}
                            aria-label={`Liberar o ${row.label} de ${row.userName}`}
                            onClick={() => setAsking({ row, action: "liberar" })}
                          >
                            <Check size={14} />
                            Liberar
                          </Button>
                        )}
                        {row.status === "pendente" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={`Recusar o ${row.label} de ${row.userName}`}
                            onClick={() => setAsking({ row, action: "recusar" })}
                          >
                            <X size={14} />
                            Recusar
                          </Button>
                        )}
                        {row.status === "liberado" && (
                          <Button
                            size="sm"
                            variant="outline"
                            aria-label={`Revogar o ${row.label} de ${row.userName}`}
                            onClick={() => setAsking({ row, action: "revogar" })}
                          >
                            <Ban size={14} />
                            Revogar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">{current.empty}</p>
        )}
      </div>

      <AlertDialog open={asking !== null} onOpenChange={(open) => !open && !busy && setAsking(null)}>
        <AlertDialogContent>
          {asking && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>{CONFIRM[asking.action].title}</AlertDialogTitle>
                <AlertDialogDescription>{CONFIRM[asking.action].text(asking.row)}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={busy}
                  onClick={(event) => {
                    event.preventDefault();
                    void decide();
                  }}
                >
                  {busy ? "Salvando…" : CONFIRM[asking.action].button}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
