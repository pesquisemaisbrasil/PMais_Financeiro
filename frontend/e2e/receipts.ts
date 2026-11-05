import { PDFDocument, StandardFonts } from "pdf-lib";

/** Uma chave que o Connect simulado (backend/services/connect_gateway.py) conhece. */
export const KEY_IN_PROJECT = "maria.exemplo@exemplo.com";
export const KEY_OUT_OF_PROJECT = "joao.exemplo@exemplo.com";

export interface FakeReceipt {
  key: string;
  amount: string;
  day: string;
  e2eId: string;
}

/**
 * PDF de comprovantes FICTÍCIO, gerado na hora (nunca um comprovante real no repositório):
 * um por página, no layout do Itaú que o leitor do backend conhece. Sem acento, porque a fonte
 * padrão do PDF não tem; o leitor compara os rótulos sem acento.
 */
export async function receiptsPdf(receipts: FakeReceipt[]): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const receipt of receipts) {
    const page = doc.addPage([595, 842]);
    const lines = [
      "Comprovante de Transferencia",
      "dados do pagador",
      "nome do pagador: EMPRESA FICTICIA LTDA",
      "CPF / CNPJ do pagador: 11.222.333/0001-81",
      "dados do recebedor",
      "nome do recebedor: PESSOA DE TESTE",
      `chave: ${receipt.key}`,
      "CPF / CNPJ do recebedor: *****000000-**",
      "dados da transacao",
      `valor: R$ ${receipt.amount}`,
      `data da transferencia: ${receipt.day}`,
      "ID da transacao:",
      receipt.e2eId,
      "controle:",
    ];
    lines.forEach((line, index) => page.drawText(line, { x: 50, y: 780 - index * 18, size: 11, font }));
  }
  return Buffer.from(await doc.save());
}
