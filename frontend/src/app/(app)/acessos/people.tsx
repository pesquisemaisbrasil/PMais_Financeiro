"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorBox, FormError, TD, TH, Tag } from "@/components/finance";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, listPeople, setPersonScreens, type PeopleList, type PersonRow } from "@/lib/api";
import { useFormAction } from "@/lib/use-form-action";

const ROLE_COLORS: Record<string, "roxo" | "azul" | "cinza"> = { superadmin: "roxo", admin: "azul", financeiro: "cinza" };

/**
 * Aba "Pessoas e telas" do Acessos (Bruno, 19/11/2026): o nível de cada pessoa e as telas que ela não
 * vê. Admin muda as telas dos usuários; o super admin, também as dos admins.
 */
export function PeopleAdmin({ myRole }: { myRole: string }) {
  const [data, setData] = useState<PeopleList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PersonRow | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await listPeople());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Não foi possível carregar as pessoas");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca da aba ao abrir
    void load();
  }, [load]);

  if (error) return <div className="p-4"><ErrorBox message={error} onRetry={load} /></div>;
  if (!data) {
    return (
      <div className="flex justify-center p-8">
        <Spinner aria-label="Carregando" className="size-6 text-brand-cinza-escuro/70" />
      </div>
    );
  }
  const label = (id: string) => data.screens.find((screen) => screen.id === id)?.label ?? id;
  const why = (row: PersonRow) =>
    row.role === "superadmin" ? "O super admin vê tudo" : myRole === "superadmin" ? "É você" : "Só o super admin muda";

  return (
    <>
      <p className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
        Tela bloqueada some do menu e não abre nem pelo endereço. O Início, a busca e o Abrir demanda ficam para todos.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={TH}>Pessoa</TableHead>
            <TableHead className={TH}>Nível</TableHead>
            <TableHead className={TH}>Telas bloqueadas</TableHead>
            <TableHead className={TH} />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.people.map((row) => (
            <TableRow key={row.id}>
              <TableCell className={TD}>
                <div className="font-semibold text-brand-cinza-escuro">{row.name}</div>
                <div className="text-xs text-muted-foreground">{row.email}</div>
              </TableCell>
              <TableCell className={TD}>
                <Tag color={ROLE_COLORS[row.role] ?? "cinza"}>{row.roleLabel}</Tag>
              </TableCell>
              <TableCell className={TD}>
                {row.blockedScreens.length ? row.blockedScreens.map(label).join(", ") : "Nenhuma"}
              </TableCell>
              <TableCell className={`${TD} text-right`}>
                {row.canEdit ? (
                  <Button variant="outline" size="sm" aria-label={`Telas de ${row.name}`} onClick={() => setEditing(row)}>
                    Telas
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">{why(row)}</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {editing && (
        <ScreensDialog
          person={editing}
          screens={data.screens}
          onClose={() => setEditing(null)}
          onDone={async () => {
            setEditing(null);
            await load();
          }}
        />
      )}
    </>
  );
}

function ScreensDialog({
  person,
  screens,
  onClose,
  onDone,
}: {
  person: PersonRow;
  screens: PeopleList["screens"];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { error, submitting, run } = useFormAction();
  const [blocked, setBlocked] = useState<string[]>(person.blockedScreens);
  const toggle = (id: string, allowed: boolean) =>
    setBlocked((current) => (allowed ? current.filter((item) => item !== id) : [...current, id]));

  async function save() {
    await run(async () => {
      await setPersonScreens(person.id, blocked);
      toast.success("Telas salvas. Já vale para a pessoa; o menu dela muda quando ela recarregar a página.");
      await onDone();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Telas de {person.name}</DialogTitle>
          <DialogDescription>Marque as telas que a pessoa pode usar. A desmarcada some do menu dela.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2.5 py-2">
          {screens.map((screen) => (
            <div key={screen.id} className="flex items-center gap-2.5">
              <Checkbox
                id={`tela-${screen.id}`}
                checked={!blocked.includes(screen.id)}
                onCheckedChange={(checked) => toggle(screen.id, checked === true)}
              />
              <Label htmlFor={`tela-${screen.id}`} className="font-normal">
                {screen.label}
              </Label>
            </div>
          ))}
        </div>
        <FormError message={error} />
        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={submitting} onClick={() => void save()}>
            {submitting ? "Salvando…" : "Salvar telas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
