"use client";

import { Building2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { savePreferredCompany } from "@/lib/preferred-company";

const ALL = "todas";

/**
 * A empresa da lista, no alto de Contas a pagar e Contas a receber (reunião de 26/11/2026: as empresas não se
 * misturam). A escolha fica lembrada para a pessoa: a tela abre nela da próxima vez.
 */
export function CompanyPicker({
  companies,
  value,
  onChange,
}: {
  companies: { id: number; name: string }[];
  value: string;
  onChange: (company: string) => void;
}) {
  const { user } = useAuth();
  const known = companies.some((company) => String(company.id) === value);
  return (
    <Select
      value={known ? value : ALL}
      onValueChange={(next) => {
        const company = next === ALL ? "" : next;
        savePreferredCompany(user?.id, company);
        onChange(company);
      }}
    >
      <SelectTrigger className="w-[210px] gap-2 bg-card" aria-label="Empresa">
        <Building2 size={16} className="shrink-0 text-muted-foreground" aria-hidden />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>Todas as empresas</SelectItem>
        {companies.map((company) => (
          <SelectItem key={company.id} value={String(company.id)}>
            {company.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
