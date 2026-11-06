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
  await form.getByLabel("Valor principal (R$) *").fill("150,00");
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

test("a conta aberta mostra a série na aba Repetir e deixa alterar a série e dar baixa de dentro dela", async ({
  page,
}) => {
  await signIn(page, "repetir-detalhe@e2e.invalid");
  await page.goto("/contas-a-pagar");
  await page.getByRole("button", { name: "Nova conta a pagar" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Vencimento *").fill("2028-03-15");
  await form.getByLabel("Valor principal (R$) *").fill("200,00");
  await choose(page, "Fornecedor *", /Batel/);
  await choose(page, "Categoria *", /Aluguel/);
  await form.getByLabel("Descrição *").fill("Mensalidade do detalhe");
  await choose(page, "Empresa *", "PPlus");
  await choose(page, "Unidade *", "Consumo SP");
  await choose(page, "Centro de custo *", "Administrativo");
  await choose(page, "Forma de pagamento *", "Boleto");
  await form.getByLabel("Repetir esta conta").check();
  await form.getByLabel("Quantas vezes").fill("3");
  await form.getByRole("button", { name: "Simular" }).click();
  await form.getByRole("button", { name: "Lançar conta" }).click();
  await expect(page.getByText(/3 contas lançadas/)).toBeVisible();

  await page.getByRole("combobox", { name: "Visão por período" }).click();
  await page.getByRole("option", { name: "Tudo" }).click();
  await page.getByLabel("Buscar conta, fornecedor ou NF").fill("Mensalidade do detalhe");
  await expect(page.getByRole("row", { name: /Mensalidade do detalhe/ })).toHaveCount(3);

  // O resumo fica acima das abas, e a aba Repetir lista a série inteira
  await page.getByRole("row", { name: /2\/3/ }).getByRole("button", { name: "Ver detalhes" }).click();
  const detail = page.getByRole("dialog");
  await expect(detail.getByText("falta pagar")).toBeVisible();
  await expect(detail.getByText("0% pago", { exact: true })).toBeVisible();
  await detail.getByRole("tab", { name: "Repetir (3)" }).click();
  await expect(detail.getByRole("row", { name: /2\/3.*Aberta aqui/ })).toBeVisible();
  await expect(detail.getByRole("row", { name: /1\/3.*R\$\s200,00/ })).toBeVisible();
  await expect(detail.getByRole("row", { name: /3\/3.*R\$\s200,00/ })).toBeVisible();

  // Abrir leva a outra conta da série sem fechar a janela, e a aba continua a mesma
  await detail.getByRole("row", { name: /3\/3/ }).getByRole("button", { name: "Abrir" }).click();
  await expect(detail.getByRole("row", { name: /3\/3.*Aberta aqui/ })).toBeVisible();
  await expect(detail.getByRole("tab", { name: "Repetir (3)" })).toHaveAttribute("aria-selected", "true");

  // Alterar a série de dentro da conta: esta e as seguintes
  await detail.getByRole("button", { name: "Alterar a série" }).click();
  const change = page.getByRole("dialog").last();
  await change.getByLabel("Esta e as seguintes").check();
  await change.getByLabel("Novo valor (R$)").fill("250,00");
  await change.getByRole("button", { name: "Alterar contas" }).click();
  await expect(page.getByText(/1 conta alterada/)).toBeVisible();
  await expect(detail.getByRole("row", { name: /3\/3.*R\$\s250,00/ })).toBeVisible();
  await expect(detail.getByRole("row", { name: /1\/3.*R\$\s200,00/ })).toBeVisible();

  // Dar baixa sem sair da conta: o resumo, as Baixas e a série mostram o que foi pago
  await detail.getByRole("button", { name: "Dar baixa" }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Confirmar baixa" }).click();
  await expect(page.getByText("Conta paga: Mensalidade do detalhe.")).toBeVisible();
  await expect(detail.getByText("100% pago", { exact: true })).toBeVisible();
  await expect(detail.getByRole("tab", { name: "Baixas (1)" })).toBeVisible();
  await expect(detail.getByRole("button", { name: "Dar baixa" })).toHaveCount(0);
  await detail.getByRole("tab", { name: "Repetir (3)" }).click();
  await expect(detail.getByRole("row", { name: /3\/3.*Paga/ })).toBeVisible();
});
