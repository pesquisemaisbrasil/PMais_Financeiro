import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

// Reunião de 26/11/2026 com a Bruna e a Camila: Contas a pagar não mistura as empresas (cada pessoa abre na sua) e
// recarregar a página não volta para hoje.

test("empresa preferida: a lista abre nela, o F5 guarda o dia, e Contas a receber abre na mesma", async ({
  page,
  context,
}) => {
  await signIn(page, "empresa@e2e.invalid");
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  await menu.getByRole("link", { name: /^Contas a pagar/ }).click();
  await expect(page.getByRole("heading", { name: "Financeiro - Contas a pagar" })).toBeVisible();

  // sem escolha, todas as empresas; a empresa fica no alto da lista, não na gaveta de filtros
  const company = page.getByRole("combobox", { name: "Empresa" });
  await expect(company).toHaveText(/Todas as empresas/);
  await company.click();
  await page.getByRole("option", { name: "PPlus", exact: true }).click();
  await expect(company).toHaveText(/PPlus/);
  await expect(page.getByRole("button", { name: /Limpar filtros/ })).toHaveCount(0);

  // um dia para trás e F5: continua no mesmo dia e na mesma empresa
  const period = page.getByRole("button", { name: /^Escolher datas:/ });
  const today = await period.textContent();
  await page.getByRole("button", { name: "Dia anterior" }).click();
  await expect(period).not.toHaveText(today ?? "");
  const before = await period.textContent();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Financeiro - Contas a pagar" })).toBeVisible();
  await expect(period).toHaveText(before ?? "");
  await expect(company).toHaveText(/PPlus/);

  // outra aba do navegador (a sessão vem do cookie): sem a memória da aba, abre hoje, mas na empresa preferida
  const second = await context.newPage();
  await second.goto("/contas-a-receber");
  await expect(second.getByRole("heading", { name: "Financeiro - Contas a receber" })).toBeVisible();
  await expect(second.getByRole("combobox", { name: "Empresa" })).toHaveText(/PPlus/);
  await second.goto("/contas-a-pagar");
  await expect(second.getByRole("button", { name: /^Escolher datas:/ })).toHaveText(today ?? "");

  // voltar para todas as empresas também fica lembrado
  const secondCompany = second.getByRole("combobox", { name: "Empresa" });
  await secondCompany.click();
  await second.getByRole("option", { name: "Todas as empresas" }).click();
  const third = await context.newPage();
  await third.goto("/contas-a-pagar");
  await expect(third.getByRole("combobox", { name: "Empresa" })).toHaveText(/Todas as empresas/);
});
