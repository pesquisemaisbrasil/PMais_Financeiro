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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, listPeople, setPersonCompanies, setPersonScreens, type PeopleList, type PersonRow } from "@/lib/api";
import { useFormAction } from "@/lib/use-form-action";

const ROLE_COLORS: Record<string, "roxo" | "azul" | "cinza"> = { superadmin: "roxo", admin: "azul", financeiro: "cinza" };

/**
 * Aba "Pessoas e telas" do Acessos (Bruno, 19/11/2026): o nível de cada pessoa, as telas que ela não vê e as empresas
 * que ela vê (27/11/2026). Admin muda os usuários; o super admin, também os admins. As empresas, só quem vê todas muda.
 */
export function PeopleAdmin({ myRole }: { myRole: string }) {
  const [data, setData] = useState<PeopleList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<PersonRow | null>(null);
  const [choosing, setChoosing] = useState<PersonRow | null>(null);

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

  const companiesText = (row: PersonRow) => {
    if (row.companyIds === null) return "Todas";
    const names = data.companies.filter((company) => row.companyIds?.includes(company.id)).map((company) => company.name);
    // quem vê só algumas empresas não enxerga o nome das outras
    const others = row.companyIds.length - names.length;
    if (others) names.push(`${others} ${others === 1 ? "outra" : "outras"}`);
    return names.join(", ");
  };

  return (
    <>
      <p className="border-b border-border px-4 py-3 text-xs text-muted-foreground">
        Tela bloqueada some do menu e não abre nem pelo endereço. O Início, a busca e o Abrir demanda ficam para todos.
        Empresa não liberada some de todas as telas, dos relatórios, das planilhas e da busca.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={TH}>Pessoa</TableHead>
            <TableHead className={TH}>Nível</TableHead>
            <TableHead className={TH}>Telas bloqueadas</TableHead>
            <TableHead className={TH}>Empresas</TableHead>
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
              <TableCell className={`${TD} whitespace-normal`}>{companiesText(row)}</TableCell>
              <TableCell className={`${TD} text-right`}>
                {row.canEdit ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" size="sm" aria-label={`Telas de ${row.name}`} onClick={() => setEditing(row)}>
                      Telas
                    </Button>
                    {row.canEditCompanies && (
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Empresas de ${row.name}`}
                        onClick={() => setChoosing(row)}
                      >
                        Empresas
                      </Button>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">{why(row)}</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {choosing && (
        <CompaniesDialog
          person={choosing}
          companies={data.companies}
          onClose={() => setChoosing(null)}
          onDone={async () => {
            setChoosing(null);
            await load();
          }}
        />
      )}
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

/** As empresas que a pessoa vê (Bruno, 27/11/2026): todas, ou só as marcadas. */
function CompaniesDialog({
  person,
  companies,
  onClose,
  onDone,
}: {
  person: PersonRow;
  companies: PeopleList["companies"];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { error, submitting, run } = useFormAction();
  const [some, setSome] = useState(person.companyIds !== null);
  const [chosen, setChosen] = useState<number[]>(person.companyIds ?? []);
  const toggle = (id: number, on: boolean) =>
    setChosen((current) => (on ? [...current, id] : current.filter((item) => item !== id)));

  async function save() {
    await run(async () => {
      await setPersonCompanies(person.id, some ? chosen : null);
      toast.success("Empresas salvas. Já vale para a pessoa; a tela dela muda quando ela recarregar a página.");
      await onDone();
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>Empresas de {person.name}</DialogTitle>
          <DialogDescription>
            A empresa não liberada some de todas as telas, dos relatórios, das planilhas e da busca da pessoa.
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={some ? "some" : "all"} onValueChange={(value) => setSome(value === "some")} className="py-2">
          <div className="flex items-center gap-2.5">
            <RadioGroupItem value="all" id="empresas-todas" />
            <Label htmlFor="empresas-todas" className="font-normal">
              Todas as empresas (também as cadastradas depois)
            </Label>
          </div>
          <div className="flex items-center gap-2.5">
            <RadioGroupItem value="some" id="empresas-algumas" />
            <Label htmlFor="empresas-algumas" className="font-normal">
              Só algumas
            </Label>
          </div>
        </RadioGroup>
        {some && (
          <div className="flex flex-col gap-2.5 border-t border-border/60 py-2 pl-6">
            {companies.map((company) => (
              <div key={company.id} className="flex items-center gap-2.5">
                <Checkbox
                  id={`empresa-${company.id}`}
                  checked={chosen.includes(company.id)}
                  onCheckedChange={(checked) => toggle(company.id, checked === true)}
                />
                <Label htmlFor={`empresa-${company.id}`} className="font-normal">
                  {company.name}
                </Label>
              </div>
            ))}
          </div>
        )}
        <FormError message={error} />
        <DialogFooter>
          <Button type="button" variant="outline" disabled={submitting} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" disabled={submitting || (some && !chosen.length)} onClick={() => void save()}>
            {submitting ? "Salvando…" : "Salvar empresas"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
