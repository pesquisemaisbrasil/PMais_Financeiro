import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./fixtures";

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("dialog").getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
}

// Nem toda empresa tem unidade: a Unidade não é obrigatória, e a conta entra sem ela.
test("unidade opcional: conta a pagar e título a receber são lançados sem unidade e mostram traço", async ({
  page,
}) => {
  await signIn(page, "unidade@e2e.invalid");
  await page.getByRole("link", { name: /Contas a pagar/ }).click();
  await page.getByRole("button", { name: "Nova conta a pagar" }).click();
  const form = page.getByRole("dialog");

  // Sem asterisco, já marcada em "Sem unidade", e a mensagem de campo faltando não a cita
  await expect(form.getByRole("combobox", { name: "Unidade" })).toContainText("Sem unidade");
  await expect(form.getByRole("combobox", { name: "Unidade *" })).toHaveCount(0);

  await form.getByLabel("Valor principal (R$) *").pressSequentially("45000");
  await choose(page, "Fornecedor *", /Exata/);
  await choose(page, "Categoria *", /Serviços de terceiros/);
  await form.getByLabel("Descrição *").fill("Conta sem unidade");
  await choose(page, "Empresa *", "PPlus");
  await choose(page, "Centro de custo *", "Administrativo");
  await choose(page, "Forma de pagamento *", "Pix");
  await form.getByRole("button", { name: "Lançar conta" }).click();
  // O vencimento padrão é daqui a 7 dias, e a lista abre só no dia de hoje: "Tudo" mostra a conta
  await page.getByRole("combobox", { name: "Visão por período" }).click();
  await page.getByRole("option", { name: "Tudo" }).click();
  // Pela busca: com as contas dos outros testes, a nova pode cair na segunda página da lista
  await page.getByLabel("Buscar conta, fornecedor ou NF").fill("Conta sem unidade");
  await expect(page.getByRole("row", { name: /Conta sem unidade/ })).toBeVisible();

  // Os detalhes mostram traço no lugar da unidade
  await page.getByRole("row", { name: /Conta sem unidade/ }).getByText("Conta sem unidade").first().click();
  const opened = page.getByRole("dialog");
  await expect(opened.getByText("Unidade:", { exact: true })).toBeVisible();
  await expect(opened.getByText("Unidade:", { exact: true }).locator("xpath=following-sibling::dd[1]")).toHaveText("—");
  await page.keyboard.press("Escape");

  // Com a unidade escolhida e depois voltando para "Sem unidade", a conta também entra sem ela
  await page.getByRole("button", { name: "Nova conta a pagar" }).click();
  await choose(page, "Empresa *", "PPlus");
  await choose(page, "Unidade", "Consumo SP");
  await expect(page.getByRole("dialog").getByRole("combobox", { name: "Unidade" })).toContainText("Consumo SP");
  await choose(page, "Unidade", "Sem unidade");
  await expect(page.getByRole("dialog").getByRole("combobox", { name: "Unidade" })).toContainText("Sem unidade");
  await page.keyboard.press("Escape");

  // Contas a receber: o mesmo
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
