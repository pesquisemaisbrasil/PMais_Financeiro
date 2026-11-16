import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./fixtures";

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("dialog").getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
}

// Nova conta a pagar igual à do sistema antigo: sem campo Empresa (ela vem da unidade) e com Unidade
// obrigatória. No Contas a receber a unidade continua opcional (nem toda empresa tem unidade).
test("unidade e empresa: a conta a pagar pede a unidade e leva a empresa dela; o título a receber pode ficar sem unidade", async ({
  page,
}) => {
  await signIn(page, "unidade@e2e.invalid");
  await page.getByRole("link", { name: /Contas a pagar/ }).click();
  await page.getByRole("button", { name: "Nova conta a pagar" }).click();
  const form = page.getByRole("dialog");

  // Sem Empresa; Unidade obrigatória, com busca e o nome da empresa ao lado de cada unidade
  await expect(form.getByRole("combobox", { name: /Empresa/ })).toHaveCount(0);
  const unit = form.getByRole("combobox", { name: "Unidade *" });
  await unit.click();
  await expect(page.getByRole("option", { name: "Consumo SP · PPlus" })).toBeVisible();
  await expect(page.getByRole("option", { name: "Matriz · MC" })).toBeVisible();
  await page.getByLabel("Buscar na lista").fill("matriz");
  await expect(page.getByRole("option", { name: "Consumo SP · PPlus" })).toHaveCount(0);
  await page.getByRole("option", { name: "Matriz · MC" }).click();

  await form.getByLabel("Valor principal (R$) *").pressSequentially("45000");
  await choose(page, "Fornecedor *", /Exata/);
  await choose(page, "Categoria *", /Serviços de terceiros/);
  await form.getByLabel("Descrição *").fill("Conta da unidade Matriz");
  await choose(page, "Centro de custo *", "Administrativo");
  await choose(page, "Forma de pagamento *", "Pix");
  await form.getByRole("button", { name: "Lançar conta" }).click();

  // O vencimento padrão é daqui a 7 dias, e a lista abre só no dia de hoje: "Tudo" mostra a conta
  await page.getByRole("combobox", { name: "Visão por período" }).click();
  await page.getByRole("option", { name: "Tudo" }).click();
  // Pela busca: com as contas dos outros testes, a nova pode cair na segunda página da lista
  await page.getByLabel("Buscar conta, fornecedor ou NF").fill("Conta da unidade Matriz");
  await expect(page.getByRole("row", { name: /Conta da unidade Matriz/ })).toBeVisible();

  // Nos detalhes, a empresa é a da unidade escolhida
  await page.getByRole("row", { name: /Conta da unidade Matriz/ }).getByText("Conta da unidade Matriz").first().click();
  const opened = page.getByRole("dialog");
  const after = (label: string) => opened.getByText(label, { exact: true }).locator("xpath=following-sibling::dd[1]");
  await expect(after("Empresa:")).toHaveText("MC");
  await expect(after("Unidade:")).toHaveText("Matriz");
  await page.keyboard.press("Escape");

  // Contas a receber: a unidade é opcional
  await page.getByRole("link", { name: /Contas a receber/ }).click();
  await page.getByRole("button", { name: "Nova conta a receber" }).click();
  const receivable = page.getByRole("dialog");
  await expect(receivable.getByRole("combobox", { name: "Unidade" })).toContainText("Sem unidade");
  await receivable.getByLabel("Valor principal (R$) *").pressSequentially("90000");
  await choose(page, "Cliente *", /Alfa/);
  await choose(page, "Conta de receita *", /Receita de pesquisa/);
  await receivable.getByLabel("Descrição *").fill("Título sem unidade");
  await choose(page, "Empresa *", "PPlus");
  await choose(page, "Centro de custo *", "Administrativo");
  await receivable.getByRole("button", { name: "Lançar conta" }).click();
  await expect(page.getByText(/Conta lançada: R\$\s900,00/)).toBeVisible();
});
