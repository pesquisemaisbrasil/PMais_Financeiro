import { expect, test, type Page } from "@playwright/test";
import { todayInSaoPaulo } from "../src/lib/cashFlow";
import { signIn } from "./fixtures";

// Pelo endereço: Fluxo mensal e Recebimentos × ano ficam "Em breve" no menu (26/11)
async function openReport(page: Page, name: string, path: string) {
  await page.goto(path);
  await expect(page.getByRole("heading", { name: `Relatórios - ${name}` })).toBeVisible();
}

test("Fluxo mensal: a baixa entra no mês do pagamento, com as contas, e exporta", async ({ page }) => {
  await signIn(page, "fluxo-mensal@e2e.invalid");
  await openReport(page, "Fluxo mensal", "/relatorios/fluxo-mensal");

  // a baixa do seed: R$ 450,00 em 02/04/2030, no Itaú · PPlus
  await page.getByLabel("De", { exact: true }).fill("2030-04-01");
  await page.getByLabel("Até", { exact: true }).fill("2030-04-30");
  await expect(page.getByRole("row", { name: /^Despesas/ })).toContainText("450,00");
  await page.getByRole("button", { name: "Mostrar as contas" }).click();
  await expect(page.getByRole("row", { name: /^2\.04 Material e gráfica/ })).toBeVisible();

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar Excel" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("fluxo-mensal-2030-04-01-a-2030-04-30.xlsx");

  // mês sem pagamento: a tela diz que não há nada
  await page.getByLabel("De", { exact: true }).fill("2030-06-01");
  await page.getByLabel("Até", { exact: true }).fill("2030-06-30");
  await expect(page.getByText("Nenhum lançamento nesse período e nesses filtros.")).toBeVisible();
});

test("Recebimentos × ano: uma linha por projeto com o total, o ano vazio e exportar", async ({ page }) => {
  const year = todayInSaoPaulo().slice(0, 4);
  const names = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  const march = (value: string) => names.map((_, index) => (index === 2 ? value : "0.00"));
  // o seed não tem recebimento (o Contas a receber conta os títulos dele): este ano vem pronto
  await page.route(
    (url) => url.pathname === "/reports/project-receipts" && url.searchParams.get("year") === year,
    (route) =>
      route.fulfill({
        json: {
          year: Number(year),
          months: names.map((name, index) => ({
            month: `${year}-${String(index + 1).padStart(2, "0")}`,
            label: `${name}/${year}`,
          })),
          rows: [
            { projectId: 1, label: "PRJ-1804 · Pesquisa", values: march("1500.00"), total: "1500.00" },
            { projectId: null, label: "Sem projeto", values: march("50.00"), total: "50.00" },
          ],
          total: { projectId: null, label: "Total", values: march("1550.00"), total: "1550.00" },
        },
      })
  );
  await signIn(page, "recebimentos@e2e.invalid");
  await openReport(page, "Recebimentos × ano", "/relatorios/recebimentos-projetos");

  await expect(page.getByRole("columnheader", { name: "mar" })).toBeVisible();
  await expect(page.getByRole("row", { name: /^PRJ-1804/ })).toContainText("1.500,00");
  await expect(page.getByRole("row", { name: /^Sem projeto/ })).toContainText("50,00");
  await expect(page.getByRole("row", { name: /^Total/ })).toContainText("1.550,00");

  // um ano sem recebimento, pela API de verdade
  const old = String(Number(year) - 5);
  await page.getByRole("combobox", { name: "Ano" }).click();
  await page.getByRole("option", { name: old }).click();
  await expect(page.getByText("Nenhum recebimento nesse ano e nesse filtro.")).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Exportar Excel" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`recebimentos-de-projetos-${old}.xlsx`);
});

test("Favoritos: guardam os filtros com um nome, reabrem depois de recarregar e se apagam", async ({ page }) => {
  await signIn(page, "favoritos@e2e.invalid");
  await openReport(page, "DRE", "/relatorios/dre");
  const project = page.getByRole("combobox", { name: "Projeto" });
  await project.click();
  await page.getByRole("option", { name: /^PRJ-1790/ }).click();
  await page.getByRole("button", { name: "Mostrar as contas" }).click();

  await page.getByRole("button", { name: "Favoritos" }).click();
  const box = page.getByRole("dialog");
  await expect(box.getByText("Nenhum favorito ainda.")).toBeVisible();
  await box.getByLabel("Salvar os filtros de agora").fill("Projeto 1790");
  await box.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Favorito salvo")).toBeVisible();
  await page.keyboard.press("Escape");

  // muda os filtros e recarrega: o favorito continua guardado no navegador
  await project.click();
  await page.getByRole("option", { name: "Todos", exact: true }).click();
  await page.getByRole("button", { name: "Esconder as contas" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Relatórios - DRE" })).toBeVisible();
  await expect(project).not.toContainText("PRJ-1790");

  await page.getByRole("button", { name: "Favoritos" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Projeto 1790", exact: true }).click();
  await expect(project).toContainText("PRJ-1790");
  await expect(page.getByRole("button", { name: "Esconder as contas" })).toBeVisible();

  await page.getByRole("button", { name: "Favoritos" }).click();
  await page.getByRole("button", { name: "Apagar o favorito Projeto 1790" }).click();
  await expect(page.getByRole("dialog").getByText("Nenhum favorito ainda.")).toBeVisible();
  await page.keyboard.press("Escape");

  // nas listas: a busca guardada volta
  await page.goto("/contas-a-pagar");
  const search = page.getByLabel("Buscar conta, fornecedor, NF, projeto ou valor");
  await search.fill("Gráfica");
  await page.getByRole("button", { name: "Favoritos" }).click();
  await page.getByRole("dialog").getByLabel("Salvar os filtros de agora").fill("Gráfica");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await page.keyboard.press("Escape");
  await search.fill("");
  await page.getByRole("button", { name: "Favoritos" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Gráfica", exact: true }).click();
  await expect(search).toHaveValue("Gráfica");
});
