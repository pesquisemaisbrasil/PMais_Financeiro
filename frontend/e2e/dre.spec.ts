import { expect, test } from "@playwright/test";
import { todayInSaoPaulo } from "../src/lib/cashFlow";
import { addDays } from "../src/lib/payables";
import { signIn } from "./fixtures";

test("DRE: os subtotais, a linha escolhida no plano de contas, o filtro de projeto, exportar e a data trocada", async ({
  page,
}) => {
  await signIn(page, "dre@e2e.invalid");
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  const openDre = async () => {
    // no menu desde 27/11
    const link = menu.getByRole("link", { name: "DRE", exact: true });
    if (!(await link.isVisible())) await menu.getByRole("button", { name: "Relatórios" }).click();
    await link.click();
    await expect(page.getByRole("heading", { name: "Relatórios - DRE" })).toBeVisible();
    // As contas do seed foram emitidas há 20 dias: o período começa dois meses atrás
    await page.getByLabel("De", { exact: true }).fill(addDays(todayInSaoPaulo(), -60));
  };
  await openDre();
  for (const name of [
    /^\(\+\) Receita operacional/,
    /^\(=\) Receita líquida/,
    /^\(=\) Lucro bruto/,
    /^\(=\) Resultado operacional/,
    /^\(=\) Resultado do período/,
  ]) {
    await expect(page.getByRole("row", { name })).toBeVisible();
  }
  // no seed ninguém tem linha: as contas entram à parte, e o aviso leva ao plano de contas
  await expect(page.getByRole("row", { name: /^\(±\) Sem linha do DRE/ })).toBeVisible();
  await expect(page.getByText(/contas com lançamento estão sem linha do DRE/)).toBeVisible();
  await page.getByRole("link", { name: "Cadastros → Plano de contas" }).click();
  await page.getByRole("button", { name: "Editar Energia e telefonia" }).click();
  const dialog = page.getByRole("dialog", { name: "Editar conta" });
  await dialog.getByRole("combobox", { name: "Linha do DRE" }).click();
  await page.getByRole("option", { name: "Despesas administrativas" }).click();
  await dialog.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("row", { name: /Energia e telefonia/ })).toContainText("Despesas administrativas");

  // a conta passa a entrar na linha escolhida; Mostrar as contas abre as contas analíticas
  await openDre();
  await expect(page.getByRole("row", { name: /^\(−\) Despesas administrativas/ })).toContainText("R$");
  const phone = page.getByRole("row", { name: /^3\.02 Energia e telefonia/ });
  await expect(phone).toHaveCount(0);
  await page.getByRole("button", { name: "Mostrar as contas" }).click();
  await expect(phone).toBeVisible();

  // Com o projeto, só as contas dele: a de telefonia não é de projeto nenhum
  await page.getByRole("combobox", { name: "Projeto" }).click();
  await page.getByRole("option", { name: /^PRJ-1790/ }).click();
  await expect(phone).toHaveCount(0);
  await expect(page.getByRole("row", { name: /^\(=\) Resultado do período/ })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar Excel" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^dre-.*\.xlsx$/);

  // A data final antes da inicial: a tela diz o motivo
  await page.getByLabel("Até", { exact: true }).fill("2020-01-01");
  await expect(page.getByText("A data final vem antes da inicial")).toBeVisible();
});
