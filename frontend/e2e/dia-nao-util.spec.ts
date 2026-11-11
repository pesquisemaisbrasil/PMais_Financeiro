import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

// Datas de 2030, longe de tudo o que os outros testes usam. 09/03 é sábado; 15/11 é feriado nacional numa sexta.
test("lançar num dia não útil avisa na hora e sugere antecipar ou postergar, no Contas a pagar e no a receber", async ({
  page,
}) => {
  await signIn(page, "diautil@e2e.invalid");

  // ---- Contas a pagar: nova conta ----
  await page.goto("/contas-a-pagar");
  await page.getByRole("button", { name: "Nova conta a pagar" }).click();
  const form = page.getByRole("dialog");
  const venc = form.getByLabel("Vencimento *");

  // Sábado: avisa, com o dia útil de antes e o de depois
  await venc.fill("2030-03-09");
  await expect(form.getByText("09/03/2030 é sábado")).toBeVisible();
  await expect(form.getByText("Deseja antecipar ou postergar o vencimento?")).toBeVisible();
  await expect(form.getByRole("button", { name: "Antecipar para sex 08/03" })).toBeVisible();
  await expect(form.getByRole("button", { name: "Postergar para seg 11/03" })).toBeVisible();

  // Postergar troca a data do campo, e o aviso some (segunda é dia útil)
  await form.getByRole("button", { name: "Postergar para seg 11/03" }).click();
  await expect(venc).toHaveValue("2030-03-11");
  await expect(form.getByText(/é sábado/)).toHaveCount(0);

  // Feriado nacional: nomeia o motivo; antecipar volta para a quinta
  await venc.fill("2030-11-15");
  await expect(form.getByText("15/11/2030 é feriado nacional")).toBeVisible();
  await form.getByRole("button", { name: "Antecipar para qui 14/11" }).click();
  await expect(venc).toHaveValue("2030-11-14");

  // Manter a data some com o aviso, sem mudar nada
  await venc.fill("2030-03-10");
  await expect(form.getByText("10/03/2030 é domingo")).toBeVisible();
  await form.getByRole("button", { name: "Manter 10/03" }).click();
  await expect(form.getByText(/é domingo/)).toHaveCount(0);
  await expect(venc).toHaveValue("2030-03-10");
  await form.getByRole("button", { name: "Cancelar" }).click();

  // ---- Contas a receber: novo título ----
  await page.goto("/contas-a-receber");
  await page.getByRole("button", { name: "Nova conta a receber" }).click();
  const receivable = page.getByRole("dialog");
  await receivable.getByLabel("Vencimento *").fill("2030-03-09");
  await expect(receivable.getByText("09/03/2030 é sábado")).toBeVisible();
  await receivable.getByRole("button", { name: "Antecipar para sex 08/03" }).click();
  await expect(receivable.getByLabel("Vencimento *")).toHaveValue("2030-03-08");
  await expect(receivable.getByText(/é sábado/)).toHaveCount(0);
});
