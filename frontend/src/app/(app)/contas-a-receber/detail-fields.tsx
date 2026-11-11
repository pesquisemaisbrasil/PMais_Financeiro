"use client";

import type { ReactNode } from "react";
import { DetailGroup as Group, DetailRow as Row } from "@/components/DetailRows";
import { adjustmentTotals, type AdjustmentKind } from "@/lib/adjustments";
import { brl, formatCompetence, formatDate } from "@/lib/payables";
import { daysLateText, type ReceivableDetail } from "@/lib/receivables";

function AdjustmentLines({ items }: { items: ReceivableDetail["adjustments"] }) {
  if (!items.length) return null;
  return (
    <span className="block text-xs font-normal text-muted-foreground">
      {items.map((item) => `${item.description} ${brl(item.amount)}`).join(" · ")}
    </span>
  );
}

/** A aba Detalhes do título: o mesmo desenho da conta a pagar (rótulo e valor ao lado, à esquerda). */
export function ReceivableDetailFields({ detail, status }: { detail: ReceivableDetail; status: ReactNode }) {
  const totals = adjustmentTotals(detail.adjustments);
  const lines = (kind: AdjustmentKind) => detail.adjustments.filter((a) => a.kind === kind);
  const document = [detail.documentType, detail.documentNumber].filter(Boolean).join(" ");
  const late = daysLateText(detail.daysLate);
  return (
    <div className="flex flex-col gap-4">
      <Group>
        <Row label="Status">
          <span className="flex flex-wrap items-center gap-2">
            {status}
            {late && <span className="text-xs font-semibold text-[#b91c1c]">{late}</span>}
          </span>
        </Row>
      </Group>

      <Group>
        <Row label="Empresa">{detail.companyName}</Row>
        <Row label="Unidade">{detail.unitName}</Row>
        <Row label="Cliente">{detail.customer}</Row>
      </Group>

      <Group>
        <Row label="Conta de receita">{detail.categoryName}</Row>
        <Row label="Centro de custo">{detail.costCenterName}</Row>
        <Row label="Projeto">
          {detail.projectCode ? `PRJ-${detail.projectCode} · ${detail.projectTitle}` : "Sem projeto"}
        </Row>
      </Group>

      <Group>
        <Row label="Descrição">{detail.description}</Row>
        <Row label="Observações">{detail.notes}</Row>
        <Row label="Contrato">{detail.contract}</Row>
        <Row label="Documento">
          {document}
          {detail.documentDate && ` · emitido em ${formatDate(detail.documentDate)}`}
        </Row>
      </Group>

      <Group>
        <Row label="Competência">{formatCompetence(detail.competence)}</Row>
        <Row label="Emissão">{formatDate(detail.issueDate)}</Row>
        <Row label="Vencimento">{formatDate(detail.dueDate)}</Row>
      </Group>

      <Group>
        <Row label="Valor principal">{brl(detail.amount)}</Row>
        <Row label="(+) Acréscimos">
          {brl(totals.acrescimo)}
          <AdjustmentLines items={lines("acrescimo")} />
        </Row>
        <Row label="(−) Descontos">
          {brl(totals.desconto)}
          <AdjustmentLines items={lines("desconto")} />
        </Row>
        <Row label="(−) Impostos">
          {brl(totals.imposto)}
          <AdjustmentLines items={lines("imposto")} />
        </Row>
        <Row label="Valor líquido">{brl(detail.net)}</Row>
        <Row label="Recebido">{brl(detail.received)}</Row>
        <Row label="Pendente">{brl(detail.pending)}</Row>
      </Group>
    </div>
  );
}
