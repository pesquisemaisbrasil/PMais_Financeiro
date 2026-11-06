import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./fixtures";

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("dialog").getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
}

test("repetir uma conta, ajustar a tabela, alterar e cancelar a série", async ({ page }) => {
  await signIn(page, "recorrencia@e2e.invalid");
  await page.getByRole("link", { name: /Contas a pagar/ }).click();
  await expect(page.getByRole("heading", { name: "Contas a pagar" })).toBeVisible();

  await page.getByRole("button", { name: "Nova conta a pagar" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Vencimento *").fill("2027-01-31");
  await form.getByLabel("Valor bruto (R$) *").fill("150,00");
  await choose(page, "Fornecedor *", /Batel/);
  await choose(page, "Categoria *", /Aluguel/);
  await form.getByLabel("Descrição *").fill("Aluguel da sala de teste");
  await choose(page, "Empresa *", "PPlus");
  await choose(page, "Unidade *", "Consumo SP");
  await choose(page, "Centro de custo *", "Administrativo");
  await choose(page, "Forma de pagamento *", "Boleto");

  // Repetir exige conferir a tabela antes de salvar
  await form.getByLabel("Repetir esta conta").check();
  await form.getByLabel("Quantas vezes").fill("3");
  await form.getByRole("button", { name: "Lançar conta" }).click();
  await expect(form.getByText("Clique em Simular para conferir as ocorrências antes de salvar.")).toBeVisible();

  // 31/01/2027 é domingo: vai para segunda, 01/02; o dia 31 volta em março
  await form.getByRole("button", { name: "Simular" }).click();
  await expect(form.getByLabel("Vencimento da ocorrência 1")).toHaveValue("2027-02-01");
  await expect(form.getByLabel("Vencimento da ocorrência 2")).toHaveValue("2027-03-01");
  await expect(form.getByLabel("Vencimento da ocorrência 3")).toHaveValue("2027-03-31");

  // A tabela é editável: o valor da 2ª muda antes de salvar
  await form.getByLabel("Valor da ocorrência 2").fill("163.40");
  await form.getByRole("button", { name: "Lançar conta" }).click();
  await expect(page.getByText(/3 contas lançadas, a primeira vence em 01\/02\/2027/)).toBeVisible();

  // As 3 aparecem na lista, marcadas com o número na série
  await page.getByRole("combobox", { name: "Visão por período" }).click();
  await page.getByRole("option", { name: "Tudo" }).click();
  await page.getByLabel("Buscar conta, fornecedor ou NF").fill("sala de teste");
  await expect(page.getByRole("row", { name: /Aluguel da sala de teste/ })).toHaveCount(3);
  await expect(page.getByRole("row", { name: /1\/3/ })).toContainText("R$ 150,00");
  await expect(page.getByRole("row", { name: /2\/3/ })).toContainText("R$ 163,40");

  // Alterar "esta e as seguintes" a partir da 2ª
  await page.getByRole("row", { name: /2\/3/ }).getByRole("button", { name: "Alterar ou cancelar a série" }).click();
  const series = page.getByRole("dialog");
  await series.getByLabel("Esta e as seguintes").check();
  await series.getByLabel("Novo valor (R$)").fill("180,00");
  await series.getByRole("button", { name: "Alterar contas" }).click();
  await expect(page.getByText(/2 contas alteradas/)).toBeVisible();
  await expect(page.getByRole("row", { name: /1\/3/ })).toContainText("R$ 150,00");
  await expect(page.getByRole("row", { name: /3\/3/ })).toContainText("R$ 180,00");

  // Caso negado: cancelar sem motivo
  await page.getByRole("row", { name: /2\/3/ }).getByRole("button", { name: "Cancelar as contas da série" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar contas" }).click();
  await expect(page.getByRole("dialog").getByText("Diga o motivo do cancelamento.")).toBeVisible();
  await page.getByRole("dialog").getByLabel("Motivo *").fill("Contrato encerrado");
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar contas" }).click();
  await expect(page.getByText(/2 contas canceladas/)).toBeVisible();
  // as canceladas saem da lista; a 1ª, antes da escolhida, continua em aberto
  await expect(page.getByRole("row", { name: /Aluguel da sala de teste/ })).toHaveCount(1);
  await expect(page.getByRole("row", { name: /1\/3/ })).toContainText("R$ 150,00");
});
