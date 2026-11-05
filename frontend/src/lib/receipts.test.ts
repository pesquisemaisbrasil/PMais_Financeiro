import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import {
  countByTab,
  planParts,
  splitPdf,
  tabOf,
  unreadCount,
  totalToPayCents,
  UnreadablePdfError,
  type ReceiptRow,
} from "./receipts";

function row(overrides: Partial<ReceiptRow> = {}): ReceiptRow {
  return {
    id: 1,
    page: 1,
    group: "no_projeto",
    status: "pendente",
    name: null,
    interviewerId: 87,
    keyMasked: "mar***@exemplo.com",
    amount: "20.00",
    paidOn: "2026-02-18",
    error: null,
    reconcileStatus: "bate",
    itemsToPay: 1,
    message: null,
    payment: null,
    paymentMessage: null,
    ...overrides,
  };
}

async function pdfWithPages(count: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < count; i++) doc.addPage([200, 200]);
  return doc.save();
}

describe("planParts", () => {
  it("corta em faixas de 25 páginas e nunca deixa página de fora", () => {
    expect(planParts(60)).toEqual([
      { start: 0, end: 25 },
      { start: 25, end: 50 },
      { start: 50, end: 60 },
    ]);
    expect(planParts(25)).toEqual([{ start: 0, end: 25 }]);
    expect(planParts(0)).toEqual([]);
  });

  it("um PDF de 300 páginas vira 12 partes", () => {
    expect(planParts(300)).toHaveLength(12);
  });
});

describe("splitPdf", () => {
  it("manda cada parte com a página em que ela começa no PDF original", async () => {
    const parts = await splitPdf(await pdfWithPages(60));
    expect(parts.map((p) => p.pageOffset)).toEqual([0, 25, 50]);
    const pages = await Promise.all(parts.map(async (p) => (await PDFDocument.load(p.bytes)).getPageCount()));
    expect(pages).toEqual([25, 25, 10]);
  });

  it("divide ao meio de novo a parte que passa do limite, sem recusar o arquivo", async () => {
    const parts = await splitPdf(await pdfWithPages(8), { perPart: 8, maxBytes: 1 });
    // com limite impossível chega a uma página por parte, e ainda assim sobe tudo
    expect(parts.map((p) => p.pageOffset)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });

  it("devolve mensagem simples para arquivo que não é PDF", async () => {
    await expect(splitPdf(new TextEncoder().encode("isto não é um pdf"))).rejects.toBeInstanceOf(
      UnreadablePdfError,
    );
    await expect(splitPdf(new TextEncoder().encode("isto não é um pdf"))).rejects.toThrow(
      "Não foi possível abrir esse PDF",
    );
  });
});

describe("abas da conferência", () => {
  it("coloca cada comprovante na aba certa", () => {
    expect(tabOf(row())).toBe("batem");
    expect(tabOf(row({ reconcileStatus: "nao_fecha" }))).toBe("divergentes");
    expect(tabOf(row({ reconcileStatus: "pago_a_mais" }))).toBe("divergentes");
    expect(tabOf(row({ group: "fora_do_projeto", reconcileStatus: null }))).toBe("fora");
    expect(tabOf(row({ group: "chave_nao_cadastrada", reconcileStatus: null }))).toBe("sem_chave");
    expect(tabOf(row({ group: "erro_leitura", reconcileStatus: null }))).toBe("erros");
    expect(tabOf(row({ group: "duplicado", reconcileStatus: null }))).toBe("erros");
    expect(tabOf(row({ status: "descartado" }))).toBe("descartados");
    expect(tabOf(row({ status: "pago", reconcileStatus: null }))).toBe("batem");
  });

  it("conta por aba", () => {
    const counts = countByTab([
      row({ id: 1 }),
      row({ id: 2 }),
      row({ id: 3, reconcileStatus: "nao_fecha" }),
      row({ id: 4, status: "descartado" }),
    ]);
    expect(counts).toEqual({ batem: 2, divergentes: 1, fora: 0, sem_chave: 0, erros: 0, descartados: 1 });
  });

  it("soma em centavos só o que vai ser pago agora", () => {
    const rows = [
      row({ id: 1, amount: "20.10" }),
      row({ id: 2, amount: "0.20" }),
      row({ id: 3, amount: "50.00", reconcileStatus: "nao_fecha" }),
      row({ id: 4, amount: "9.99", status: "pago" }),
    ];
    expect(totalToPayCents(rows)).toBe(2030);
  });
});

describe("avisos", () => {
  const notice = (id: number, readAt: string | null) => ({
    id,
    type: "receipt_out_of_project",
    title: "t",
    body: null,
    link: null,
    readAt,
    createdAt: "2026-11-05T10:00:00Z",
  });

  it("conta só os que ainda não foram lidos", () => {
    expect(unreadCount([notice(1, null), notice(2, "2026-11-05T11:00:00Z"), notice(3, null)])).toBe(2);
    expect(unreadCount([])).toBe(0);
  });
});
