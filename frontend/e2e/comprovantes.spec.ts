import { expect, test, type Page } from "@playwright/test";
import { TOTP_SECRET, signIn, totp } from "./fixtures";
import { KEY_IN_PROJECT, KEY_OUT_OF_PROJECT, receiptsPdf } from "./receipts";

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("dialog").getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
}

/** O mesmo código do autenticador não vale duas vezes: espera a próxima janela de 30 s. */
async function nextAuthenticatorCode(): Promise<string> {
  const used = totp(TOTP_SECRET);
  while (totp(TOTP_SECRET) === used) await new Promise((resolve) => setTimeout(resolve, 1000));
  return totp(TOTP_SECRET);
}

test("enviar o PDF de comprovantes, conferir e confirmar a baixa", async ({ page }) => {
  await signIn(page, "comprovantes@e2e.invalid");
  await page.getByRole("link", { name: /Contas a pagar/ }).click();
  await expect(page.getByRole("heading", { name: "Contas a pagar" })).toBeVisible();

  // O envio parte do lançamento do Connect, e só dele
  await expect(
    page.getByRole("row", { name: /Gráfica · PRJ-1804/ }).getByRole("button", { name: "Enviar comprovantes" })
  ).toHaveCount(0);
  await page.getByRole("row", { name: /4 entrevistadores/ }).getByRole("button", { name: "Enviar comprovantes" }).click();

  const pdf = await receiptsPdf([
    { key: KEY_IN_PROJECT, amount: "20,00", day: "02/02/2026", e2eId: "E2E00000000000000000000000000001" },
    { key: KEY_IN_PROJECT, amount: "20,00", day: "03/02/2026", e2eId: "E2E00000000000000000000000000002" },
    { key: KEY_OUT_OF_PROJECT, amount: "20,00", day: "03/02/2026", e2eId: "E2E00000000000000000000000000003" },
  ]);

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Enviar comprovantes" })).toBeVisible();
  // sem projeto e sem arquivo, nada é enviado
  await dialog.getByRole("button", { name: "Ler comprovantes" }).click();
  await expect(dialog.getByText("Escolha o projeto.")).toBeVisible();

  await choose(page, "Projeto *", "Pesquisa de mobilidade urbana");
  await dialog.getByLabel("PDF de comprovantes *").setInputFiles({
    name: "comprovantes.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await dialog.getByRole("button", { name: "Ler comprovantes" }).click();

  // Conferência: dois batem, um recebeu fora do projeto e nunca é pago
  await expect(dialog.getByRole("tab", { name: "Batem (2)" })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Fora do projeto (1)" })).toBeVisible();
  await expect(dialog.getByText("1 comprovante de pessoa fora do projeto Pesquisa de mobilidade urbana")).toBeVisible();
  await expect(dialog.getByText("Maria Exemplo").first()).toBeVisible();
  await expect(dialog.getByText("mar***@exemplo.com").first()).toBeVisible();
  await expect(dialog.getByText(KEY_IN_PROJECT)).toHaveCount(0); // a chave inteira nunca aparece
  await dialog.getByRole("tab", { name: /Fora do projeto/ }).click();
  await expect(dialog.getByText("Recebeu sem estar no projeto. Nunca é pago.")).toBeVisible();
  await dialog.getByRole("tab", { name: /Batem/ }).click();

  // Caso negado: sem o código certo, nada é pago
  await dialog.getByLabel("Código do autenticador *").fill("000000");
  await dialog.getByRole("button", { name: "Confirmar baixa" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar baixa" }).click();
  await expect(dialog.getByText("Código de verificação inválido")).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Batem (2)" })).toBeVisible();

  // Com o código certo, a baixa é feita
  await dialog.getByLabel("Código do autenticador *").fill(await nextAuthenticatorCode());
  await dialog.getByRole("button", { name: "Confirmar baixa" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("total R$ 40,00");
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirmar baixa" }).click();
  await expect(dialog.getByText("Envio confirmado")).toBeVisible();
  await expect(dialog.getByText(/2 Pix pagos \(R\$\s40,00\), 2 itens/)).toBeVisible();
  await expect(dialog.getByText("Baixa aplicada").first()).toBeVisible();

  // O mesmo PDF de novo: o Pix já foi pago e nada é pago outra vez
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();

  // No lançamento, só a pessoa que recebeu mostra o dia do Pix; as outras continuam a pagar
  await page.getByRole("row", { name: /4 entrevistadores/ }).getByRole("button", { name: "Mostrar os itens" }).click();
  await expect(page.getByRole("row", { name: /Sandra Ribeiro/ }).last()).toContainText("Paga em 03/02/2026");
  await expect(page.getByRole("row", { name: /Marcos Lima/ }).last()).toContainText("Baixa parcial do lançamento");
  await page.getByRole("button", { name: "Esconder os itens" }).click();

  await page.getByRole("row", { name: /4 entrevistadores/ }).getByRole("button", { name: "Enviar comprovantes" }).click();
  await choose(page, "Projeto *", "Pesquisa de mobilidade urbana");
  await page.getByRole("dialog").getByLabel("PDF de comprovantes *").setInputFiles({
    name: "comprovantes.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await page.getByRole("dialog").getByRole("button", { name: "Ler comprovantes" }).click();
  await expect(page.getByRole("dialog").getByRole("tab", { name: "Erros (2)" })).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("tab", { name: "Batem (0)" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar envio" }).click();

  // Sino: os dois envios tinham alguém fora do projeto, e o aviso leva para as contas
  const bell = page.getByRole("button", { name: "Avisos, 2 não lidos" });
  await expect(bell).toBeVisible();
  await bell.click();
  const title = "1 comprovante de pessoa fora do projeto Pesquisa de mobilidade urbana";
  await expect(page.getByText(title)).toHaveCount(2);
  await page.getByText(title).first().click();
  await expect(page.getByRole("button", { name: "Avisos, 1 não lidos" })).toBeVisible();

  // Divergências: nenhuma baixa foi recusada
  await page.getByRole("link", { name: "Divergências" }).click();
  await expect(page.getByRole("heading", { name: "Divergências" })).toBeVisible();
  await expect(page.getByText("Nenhuma divergência. Toda baixa enviada ao Connect foi aceita.")).toBeVisible();
});
