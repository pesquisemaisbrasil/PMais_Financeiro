"use client";

import type { ReactNode } from "react";
import { SituationTag } from "@/components/finance";
import { brl, formatCompetence, formatDate, formatDateTime, settlement, shareText, type PayableDetail } from "@/lib/payables";

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

const by = (when: string, name: string | null) => `${formatDateTime(when)}${name ? ` - por ${name}` : ""}`;

export function DetailFields({ payable }: { payable: PayableDetail }) {
  const money = settlement(payable);
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
        {payable.docsReceivedOn && <Row label="Documentação recebida">{formatDate(payable.docsReceivedOn)}</Row>}
      </Group>

      <Group>
        <Row label="Valor bruto">{brl(money.gross)}</Row>
        <Row label="(+) Acréscimos">{brl(money.surcharge)}</Row>
        <Row label="(−) Descontos">{brl(money.discount)}</Row>
        <Row label="Valor líquido">{brl(money.net)}</Row>
        <Row label="Pago">{brl(payable.paid)}</Row>
        <Row label="Pendente">{brl(payable.pending)}</Row>
      </Group>
    </div>
  );
}
