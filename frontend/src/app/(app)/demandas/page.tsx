"use client";

import { CheckCircle2, ClipboardList, Download, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import { isSuperAdmin } from "@/lib/access";
import { ApiError, concludeDemand, downloadDemandAttachment, listDemands, type DemandRow } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { saveBlob } from "@/lib/documents";
import { pageLabel } from "@/lib/feedback";
import { formatDateTime } from "@/lib/payables";

const KIND_COLORS: Record<string, "azul" | "vermelho" | "ambar"> = { nova: "azul", bug: "vermelho", regra: "ambar" };

/** As demandas que a equipe abriu, da mais nova para a mais antiga. Só o super admin (19/11/2026). */
export default function DemandsPage() {
  const { user } = useAuth();
  if (!isSuperAdmin(user?.role)) {
    return (
      <main className="mx-auto w-full max-w-[1280px] px-6 pb-16 pt-8">
        <PageHeader title="Demandas" icon={ClipboardList} />
        <p className="text-sm text-muted-foreground">Esta tela é só do super admin.</p>
      </main>
    );
  }
  return <DemandList />;
}

function DemandList() {
  const [rows, setRows] = useState<DemandRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [concluding, setConcluding] = useState<DemandRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await listDemands());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar as demandas");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca da tela ao abrir
    void load();
  }, [load]);

  async function download(row: DemandRow) {
    try {
      saveBlob(await downloadDemandAttachment(row.id), row.fileName);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Não foi possível baixar o anexo");
    }
  }

  async function conclude() {
    if (!concluding) return;
    setBusy(true);
    try {
      await concludeDemand(concluding.id);
      toast.success(`Demanda concluída. ${concluding.sender} recebeu o aviso no sino.`);
      setConcluding(null);
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
        title="Demandas"
        icon={ClipboardList}
        subtitle="Os pedidos de mudança que a equipe abriu pelo menu (Abrir demanda), com o anexo de cada um."
        actions={
          <Button variant="outline" onClick={() => void load()}>
            <RefreshCw size={16} />
            Atualizar
          </Button>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} onRetry={load} />
        </div>
      )}

      <div className={CARD}>
        {!rows ? (
          !error && (
            <div className="flex justify-center p-8">
              <Spinner aria-label="Carregando" className="size-6 text-brand-cinza-escuro/70" />
            </div>
          )
        ) : rows.length ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH}>Aberta em</TableHead>
                <TableHead className={TH}>Tipo</TableHead>
                <TableHead className={TH}>Descrição</TableHead>
                <TableHead className={TH}>Tela</TableHead>
                <TableHead className={TH}>Quem abriu</TableHead>
                <TableHead className={TH}>Situação</TableHead>
                <TableHead className={TH} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className={`${TD} whitespace-nowrap tabular-nums`}>{formatDateTime(row.createdAt)}</TableCell>
                  <TableCell className={TD}>
                    <Tag color={KIND_COLORS[row.kind] ?? "azul"}>{row.kindLabel}</Tag>
                  </TableCell>
                  <TableCell className={`${TD} min-w-[280px] whitespace-pre-wrap`}>{row.description}</TableCell>
                  <TableCell className={TD}>{pageLabel(row.page)}</TableCell>
                  <TableCell className={TD}>{row.sender}</TableCell>
                  <TableCell className={TD}>
                    {row.doneAt ? (
                      <div className="flex flex-col items-start gap-0.5">
                        <Tag color="verde">Concluída</Tag>
                        <span className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTime(row.doneAt)}
                          {row.doneBy ? ` · ${row.doneBy}` : ""}
                        </span>
                      </div>
                    ) : (
                      <Tag color="ambar">Aberta</Tag>
                    )}
                  </TableCell>
                  <TableCell className={TD}>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" aria-label={`Baixar ${row.fileName}`} onClick={() => void download(row)}>
                        <Download size={14} />
                        Baixar
                      </Button>
                      {!row.doneAt && (
                        <Button size="sm" aria-label={`Concluir a demanda de ${row.sender}`} onClick={() => setConcluding(row)}>
                          <CheckCircle2 size={14} />
                          Concluído
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nenhuma demanda aberta ainda.</p>
        )}
      </div>

      <AlertDialog open={concluding !== null} onOpenChange={(open) => !open && !busy && setConcluding(null)}>
        <AlertDialogContent>
          {concluding && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Concluir esta demanda?</AlertDialogTitle>
                <AlertDialogDescription>
                  {concluding.kindLabel} de {concluding.sender}. Ela fica como concluída, e {concluding.sender} recebe
                  um aviso no sino.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={busy}>Voltar</AlertDialogCancel>
                <AlertDialogAction
                  disabled={busy}
                  onClick={(event) => {
                    event.preventDefault();
                    void conclude();
                  }}
                >
                  {busy ? "Salvando…" : "Concluir"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
