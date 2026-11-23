import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

// Abas de telas, como no VS Code (pedido do Bruno, 23/11/2026; regra em src/lib/tabs.ts): clique simples no menu
// troca a tela da aba atual, duplo clique abre outra aba, e cada aba guarda o que a pessoa fez até ser fechada.

test("abas: dois cliques abrem outra aba, cada uma guarda a busca e o F5 reabre as abas", async ({ page }) => {
  await signIn(page, "abas@e2e.invalid");
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  const tabs = page.getByRole("navigation", { name: "Abas abertas" });
  const tab = (name: string) => tabs.getByRole("button", { name, exact: true });

  // Uma aba só: sem botão de fechar, e a dica do duplo clique
  await expect(tab("Início")).toHaveAttribute("aria-current", "page");
  await expect(tabs.getByRole("button", { name: /^Fechar a aba/ })).toHaveCount(0);
  await expect(tabs).toContainText("Dois cliques numa tela do menu abrem outra aba");

  // Clique simples: a aba atual troca de tela (o Início sai)
  await menu.getByRole("link", { name: /^Contas a pagar/ }).click();
  await expect(page.getByRole("heading", { name: "Financeiro - Contas a pagar" })).toBeVisible();
  await expect(tabs.getByRole("button")).toHaveText(["Contas a pagar"]);
  const payablesSearch = page.getByLabel("Buscar conta, fornecedor, NF, projeto ou valor");
  await payablesSearch.fill("grafica");
  await expect(page.getByRole("row", { name: /Gráfica Ponto Certo/ }).first()).toBeVisible();

  // Duplo clique: Contas a receber numa aba nova, ao lado
  await menu.getByRole("link", { name: "Contas a receber" }).dblclick();
  await expect(page.getByRole("heading", { name: "Financeiro - Contas a receber" })).toBeVisible();
  await expect(page).toHaveURL(/\/contas-a-receber$/);
  await expect(tabs.getByRole("button", { name: /^(Contas a pagar|Contas a receber)$/ })).toHaveText([
    "Contas a pagar",
    "Contas a receber",
  ]);
  await expect(tab("Contas a receber")).toHaveAttribute("aria-current", "page");
  const receivablesSearch = page.getByLabel("Buscar título, cliente ou contrato");
  await receivablesSearch.fill("satisfacao");

  // Voltar para a outra aba: a busca e a lista estão como a pessoa deixou
  await tab("Contas a pagar").click();
  await expect(page).toHaveURL(/\/contas-a-pagar$/);
  await expect(page.getByRole("heading", { name: "Financeiro - Contas a pagar" })).toBeVisible();
  await expect(payablesSearch).toHaveValue("grafica");
  await expect(page.getByRole("row", { name: /Gráfica Ponto Certo/ }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Financeiro - Contas a receber" })).toBeHidden();
  await tab("Contas a receber").click();
  await expect(receivablesSearch).toHaveValue("satisfacao");

  // Clicar no menu numa tela que já tem aba só vai para ela, sem abrir outra
  await menu.getByRole("link", { name: /^Contas a pagar/ }).click();
  await expect(tab("Contas a pagar")).toHaveAttribute("aria-current", "page");
  await expect(payablesSearch).toHaveValue("grafica");
  await expect(tabs.getByRole("button", { name: /^(Contas a pagar|Contas a receber)$/ })).toHaveCount(2);

  // F5: as abas voltam, mas cada tela recomeça do zero
  await page.reload();
  await expect(page.getByRole("heading", { name: "Financeiro - Contas a pagar" })).toBeVisible();
  await expect(tab("Contas a receber")).toBeVisible();
  await expect(payablesSearch).toHaveValue("");

  // Fechar a aba da frente: a vizinha vem para a frente; a última aba não fecha
  await tabs.getByRole("button", { name: "Fechar a aba Contas a pagar" }).click();
  await expect(page).toHaveURL(/\/contas-a-receber$/);
  await expect(page.getByRole("heading", { name: "Financeiro - Contas a receber" })).toBeVisible();
  await expect(tabs.getByRole("button")).toHaveText(["Contas a receber"]);
  await expect(page.getByLabel("Buscar conta, fornecedor, NF, projeto ou valor")).toHaveCount(0);
});
