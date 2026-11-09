"use client";

import type { ReactNode } from "react";
import { SituationTag } from "@/components/finance";
import { adjustmentTotals, type AdjustmentKind } from "@/lib/adjustments";
import { brl, formatCompetence, formatDate, formatDateTime, paymentExtras, shareText, type PayableDetail } from "@/lib/payables";

/** Rótulo à direita e valor ao lado, em blocos separados por um espaço, como no sistema antigo. */
function Group({ children }: { children: ReactNode }) {
  return (
    <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1.5 text-[13px] sm:grid-cols-[10rem_minmax(0,1fr)]">
      {children}
    </dl>
  );
}

function Row({ label, children }: { label: string; children?: ReactNode }) {
  const empty = children === null || children === undefined || children === "" || children === false;
  return (
    <>
      <dt className="text-right text-muted-foreground">{label}:</dt>
      <dd className="min-w-0 break-words font-semibold tabular-nums">
        {empty ? <span className="font-normal text-muted-foreground">—</span> : children}
      </dd>
    </>
  );
}

function AdjustmentLines({ items }: { items: PayableDetail["adjustments"] }) {
  if (!items.length) return null;
  return (
    <span className="block text-xs font-normal text-muted-foreground">
      {items.map((item) => `${item.description} ${brl(item.amount)}`).join(" · ")}
    </span>
  );
}

const by = (when: string, name: string | null) => `${formatDateTime(when)}${name ? ` - por ${name}` : ""}`;

export function DetailFields({ payable }: { payable: PayableDetail }) {
  const totals = adjustmentTotals(payable.adjustments);
  const extras = paymentExtras(payable.payments);
  const lines = (kind: AdjustmentKind) => payable.adjustments.filter((a) => a.kind === kind);
  const document = [payable.documentType, payable.documentNumber].filter(Boolean).join(" ");
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Group>
          <Row label="Status">
            <SituationTag situation={payable.situation} />
          </Row>
        </Group>
        <Group>
          <Row label="Incluído em">{by(payable.createdAt, payable.createdBy)}</Row>
          <Row label="Última alteração">{by(payable.updatedAt, payable.updatedBy)}</Row>
        </Group>
      </div>

      <Group>
        <Row label="Empresa">{payable.companyName}</Row>
        <Row label="Unidade">{payable.unitName}</Row>
        <Row label="Fornecedor">{payable.payee}</Row>
        {payable.isTransfer && <Row label="Transferência">Entre empresas do Grupo</Row>}
      </Group>

      <Group>
        <Row label="Plano de contas">{payable.categoryName}</Row>
        <Row label="Centro de custo">{payable.costCenterName}</Row>
        <Row label="Projeto">
          {payable.allocations.length > 0 && (
            <ul className="flex flex-col gap-0.5">
              {payable.allocations.map((allocation) => (
                <li key={allocation.projectId}>
                  PRJ-{allocation.code} · {brl(allocation.amount)}
                  <span className="font-normal text-muted-foreground"> ({shareText(allocation.amount, payable.amount)})</span>
                </li>
              ))}
            </ul>
          )}
        </Row>
      </Group>

      <Group>
        <Row label="Descrição">{payable.description}</Row>
        <Row label="Observações">{payable.notes}</Row>
        <Row label="Forma de pagamento">{payable.paymentMethodName}</Row>
        <Row label="Documento">
          {document}
          {payable.documentDate && ` · emitido em ${formatDate(payable.documentDate)}`}
        </Row>
        {payable.barcode && (
          <Row label="Código de barras">
            <span className="font-mono text-xs">{payable.barcode}</span>
          </Row>
        )}
      </Group>

      <Group>
        <Row label="Competência">{formatCompetence(payable.competence)}</Row>
        <Row label="Vencimento">{formatDate(payable.dueDate)}</Row>
        <Row label="Pagar em">{payable.payOn && formatDate(payable.payOn)}</Row>
        {payable.docsReceivedOn && <Row label="Documentação recebida">{formatDate(payable.docsReceivedOn)}</Row>}
      </Group>

      <Group>
        <Row label="Valor principal">{brl(payable.grossAmount)}</Row>
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
        <Row label="Valor líquido">{brl(payable.amount)}</Row>
        {Number(extras.surcharge) > 0 && <Row label="Juros e multa nas baixas">{brl(extras.surcharge)}</Row>}
        {Number(extras.discount) > 0 && <Row label="Descontos nas baixas">{brl(extras.discount)}</Row>}
        <Row label="Pago">{brl(payable.paid)}</Row>
        <Row label="Pendente">{brl(payable.pending)}</Row>
      </Group>
    </div>
  );
}
