import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

test("menu lateral e título: a página e a seção em que a pessoa está ficam destacadas, e o título diz Seção - Página", async ({
  page,
}) => {
  await signIn(page, "menu@e2e.invalid");
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  const group = (name: string) => menu.getByRole("button", { name });
  const current = menu.locator('[aria-current="page"]');
  const title = (name: string) => page.getByRole("heading", { name, exact: true });

  // Só uma página fica marcada, e a seção dela também
  await page.goto("/contas-a-pagar");
  await expect(title("Financeiro - Contas a pagar")).toBeVisible();
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText(/^Contas a pagar/);
  await expect(group("Financeiro")).toHaveAttribute("data-current", "true");
  await expect(group("Cadastros")).not.toHaveAttribute("data-current", "true");

  // Cadastros: cada lista diz o seu nome no título, e o menu marca a lista e a seção
  await group("Cadastros").click();
  await menu.getByRole("link", { name: "Fornecedores", exact: true }).click();
  await expect(title("Cadastros - Fornecedores")).toBeVisible();
  await expect(current).toHaveCount(1);
  await expect(current).toHaveText("Fornecedores");
  await expect(group("Cadastros")).toHaveAttribute("data-current", "true");
  await expect(group("Financeiro")).not.toHaveAttribute("data-current", "true");

  await menu.getByRole("link", { name: "Plano de contas", exact: true }).click();
  await expect(title("Cadastros - Plano de contas")).toBeVisible();
  await expect(current).toHaveText("Plano de contas");

  await menu.getByRole("link", { name: "Impostos retidos", exact: true }).click();
  await expect(title("Cadastros - Impostos retidos")).toBeVisible();
  await expect(current).toHaveText("Impostos retidos");
  await expect(menu.getByRole("link", { name: "Feriados", exact: true })).toHaveCount(0); // saiu do menu em 19/11

  // A seção continua destacada com o grupo recolhido: a pessoa vê em que parte do menu está
  await group("Cadastros").click();
  await expect(menu.getByRole("link", { name: "Fornecedores", exact: true })).toBeHidden();
  await expect(group("Cadastros")).toHaveAttribute("data-current", "true");

  // Relatórios
  await group("Relatórios").click();
  await expect(menu.getByRole("link", { name: "Incentivos", exact: true })).toHaveCount(0); // saiu do menu em 18/11
  await menu.getByRole("link", { name: "Relatório do projeto", exact: true }).click();
  await expect(title("Relatórios - Relatório do projeto")).toBeVisible();
  await expect(group("Relatórios")).toHaveAttribute("data-current", "true");

  // Financeiro, as outras telas (o grupo continua aberto desde o começo). Conferência bancária e
  // Divergências ficam "Em breve" no menu (pedido do Bruno, 24/11), sem link; pelo endereço, abrem
  await expect(menu.getByRole("link", { name: "Divergências", exact: true })).toHaveCount(0);
  await expect(menu.getByRole("link", { name: "Conferência bancária", exact: true })).toHaveCount(0);
  for (const soon of ["Conferência bancária", "Divergências"]) {
    await expect(menu.locator('[aria-disabled="true"]', { hasText: soon })).toContainText("Em breve");
  }
  await menu.getByRole("link", { name: "Contas a receber", exact: true }).click();
  await expect(title("Financeiro - Contas a receber")).toBeVisible();
  await page.goto("/divergencias");
  await expect(title("Financeiro - Divergências")).toBeVisible();
  await page.goto("/conferencia-bancaria");
  await expect(title("Financeiro - Conferência bancária")).toBeVisible();
});
