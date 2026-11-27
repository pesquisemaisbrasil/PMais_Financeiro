import { expect, test } from "@playwright/test";
import { todayInSaoPaulo } from "../src/lib/cashFlow";
import { signIn } from "./fixtures";
import { receiptsPdf } from "./receipts";

// Baixa do lançamento de incentivos pelos comprovantes Pix, casados pela chave (Bruno, 27/11/2026). A planilha e os
// comprovantes são fictícios, gerados aqui.

function csv(name: string, rows: string[]) {
  return { name, mimeType: "text/csv", buffer: Buffer.from(rows.join("\r\n"), "utf-8") };
}

test("baixa pelos comprovantes: só sai com cada pessoa batendo, e o comprovante fica na pessoa", async ({ page }) => {
  const [year, month, day] = todayInSaoPaulo().split("-");
  const today = `${day}/${month}/${year}`;
  // ID de transação diferente a cada execução: um Pix só paga uma vez
  const run = String(Date.now()).slice(-8);
  const ana = { key: "ana.baixa@exemplo.invalid", amount: "100,00", day: today, e2eId: `E000000002030BAIXA${run}A1` };
  const bia = { key: "bia.baixa@exemplo.invalid", amount: "40,50", day: today, e2eId: `E000000002030BAIXA${run}B2` };

  await signIn(page, "baixa-incentivos@e2e.invalid");
  await page.goto("/contas-a-pagar");
  await page.getByRole("button", { name: "Carregar incentivos" }).click();
  const loader = page.getByRole("dialog");
  await loader.getByLabel("Planilha *").setInputFiles(
    csv("incentivos-baixa.csv", [
      // 1790 e 2030: longe dos totais de hoje e dos documentos do PRJ-1804, que outros testes conferem
      "Beneficiário:;PIX:;VALOR TOTAL;PAGAR (PREENCHIDO PELO FINANCEIRO);Projeto;Plano de contas;Forma de pagamento",
      `Ana Baixa;${ana.key};100,00;07/06/2030;1790;2.02 Incentivos;Pix`,
      `Bia Baixa;${bia.key};40,50;07/06/2030;1790;2.02 Incentivos;Pix`,
    ])
  );
  await loader.getByRole("button", { name: "Ler planilha" }).click();
  await loader.getByRole("button", { name: "Criar 1 lançamento com 2 itens" }).click();
  await expect(page.getByText(/1 lançamento criado, 2 itens/)).toBeVisible();
  // a janela fecha sozinha quando todos os incentivos entraram
  await expect(loader).toBeHidden();

  await page.getByLabel("Buscar conta, fornecedor, NF, projeto ou valor").fill("140,50");
  const row = page.getByRole("row", { name: /Incentivos \(2 pessoas\)/ });
  await row.getByRole("button", { name: "Baixar pelos comprovantes" }).click();
  const dialog = page.getByRole("dialog", { name: "Baixar pelos comprovantes" });

  // Só o comprovante de Ana: falta o de Bia, e a soma não fecha
  await dialog.getByLabel("Comprovantes Pix (PDF) *").setInputFiles({
    name: "comprovante-ana.pdf",
    mimeType: "application/pdf",
    buffer: await receiptsPdf([ana]),
  });
  await dialog.getByRole("button", { name: "Conferir comprovantes" }).click();
  await expect(dialog.getByText("A baixa ainda não pode sair")).toBeVisible();
  await expect(dialog.getByText("1 pessoa sem comprovante")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Confirmar baixa" })).toHaveCount(0);

  // Com o de Bia também: tudo bate e a baixa libera
  await dialog.getByLabel("Comprovantes Pix (PDF) *").setInputFiles({
    name: "comprovante-bia.pdf",
    mimeType: "application/pdf",
    buffer: await receiptsPdf([bia]),
  });
  await dialog.getByRole("button", { name: "Conferir comprovantes" }).click();
  await expect(dialog.getByText("Tudo bate")).toBeVisible();
  await expect(dialog.getByRole("row", { name: /Bia Baixa/ })).toContainText("comprovante-bia.pdf");
  // a tabela cabe na janela, sem cortar a situação de cada pessoa
  const people = dialog.getByRole("table", { name: "Pessoas do lançamento" });
  expect(await people.evaluate((el) => el.parentElement!.scrollWidth - el.parentElement!.clientWidth)).toBeLessThanOrEqual(0);
  // a chave Pix nunca aparece inteira
  await expect(dialog).not.toContainText(ana.key);
  await dialog.getByRole("button", { name: "Confirmar baixa" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar baixa" }).click();
  await expect(page.getByText(/Baixa feita pelos comprovantes: 2 pessoas, R\$\s140,50/)).toBeVisible();

  // Paga, e o comprovante de cada pessoa está nela
  await expect(row).toContainText("Paga");
  await row.getByRole("button", { name: "Mostrar os itens" }).click();
  await expect(page.getByRole("button", { name: "Baixar o comprovante de Ana Baixa" })).toBeVisible();
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Baixar o comprovante de Bia Baixa" }).click(),
  ]);
  expect(file.suggestedFilename()).toBe("Comprovante Pix - Bia Baixa.pdf");

  // Estornar só alguns (Bruno, 27/11): escolhe a baixa de Ana, e a de Bia continua valendo
  await row.getByRole("button", { name: "Ver detalhes" }).click();
  const detail = page.getByRole("dialog");
  await detail.getByRole("tab", { name: /Baixas/ }).click();
  const reverseChosen = detail.getByRole("button", { name: /^Estornar selecionadas/ });
  await expect(reverseChosen).toBeDisabled();
  await detail.getByRole("checkbox", { name: "Selecionar todas" }).check();
  await expect(reverseChosen).toHaveText("Estornar selecionadas (2)");
  await detail.getByRole("checkbox", { name: "Selecionar todas" }).uncheck();
  await detail.getByRole("checkbox", { name: /Selecionar a baixa de .*Ana Baixa/ }).check();
  await reverseChosen.click();
  await detail.getByLabel("Motivo").fill("Comprovante trocado");
  await detail.getByRole("button", { name: "Estornar 1 baixa", exact: true }).click();
  await expect(page.getByText(/1 baixa estornada\. Pendente agora: R\$\s100,00\./)).toBeVisible();
  await page.keyboard.press("Escape");

  // Quem foi estornado é pago de novo pelo comprovante, mesmo mandando o PDF de todos
  await row.getByRole("button", { name: "Baixar pelos comprovantes" }).click();
  await dialog.getByLabel("Comprovantes Pix (PDF) *").setInputFiles({
    name: "comprovantes-todos.pdf",
    mimeType: "application/pdf",
    buffer: await receiptsPdf([ana, bia]),
  });
  await dialog.getByRole("button", { name: "Conferir comprovantes" }).click();
  await expect(dialog.getByText("Tudo bate")).toBeVisible();
  await expect(dialog.getByText("1 comprovante de quem já foi pago neste lançamento ficou de fora")).toBeVisible();
  await dialog.getByRole("button", { name: "Confirmar baixa" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar baixa" }).click();
  await expect(page.getByText(/Baixa feita pelos comprovantes: 1 pessoa, R\$\s100,00/)).toBeVisible();
  await expect(row).toContainText("Paga");
});
