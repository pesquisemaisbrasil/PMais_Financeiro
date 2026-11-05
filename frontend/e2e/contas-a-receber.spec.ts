import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./fixtures";

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("dialog").getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
}

test("Contas a receber: indicadores, filtros, inadimplência, recebimento parcial e estorno", async ({ page }) => {
  await signIn(page, "receber@e2e.invalid");

  // O menu leva à tela, que abre no dia: o período muda para "Tudo"
  await page.getByRole("link", { name: /Contas a receber/ }).click();
  await expect(page.getByRole("heading", { name: "Contas a receber" })).toBeVisible();
  await page.getByRole("combobox", { name: "Visão por período" }).click();
  await page.getByRole("option", { name: "Tudo" }).click();

  // Líquido de cada título: 900 (1.000 menos 100 de abatimento) + 500 + 700
  await expect(page.getByRole("button", { name: /^Total/ })).toContainText("R$ 2.100,00");
  await expect(page.getByRole("button", { name: /^Total/ })).toContainText("3 títulos");
  await expect(page.getByRole("button", { name: /^Vencidos/ })).toContainText("R$ 1.400,00");
  await expect(page.getByRole("button", { name: /^Vencidos/ })).toContainText("2 títulos");
  await expect(page.getByRole("button", { name: /^A vencer/ })).toContainText("R$ 700,00");

  // Clicar em Vencidos abre a lista já filtrada, com os dias de atraso
  await page.getByRole("button", { name: /^Vencidos/ }).click();
  await expect(page.getByRole("row", { name: /Satisfação · 1ª parcela/ })).toContainText("10 dias de atraso");
  await expect(page.getByRole("row", { name: /Satisfação · 1ª parcela/ })).toContainText("bruto R$");
  await expect(page.getByRole("row", { name: /Tracking mensal/ })).toHaveCount(0);

  // Filtros combinados: cliente e situação
  await page.getByRole("button", { name: /^Total/ }).click();
  await page.getByRole("button", { name: /^Filtros/ }).click();
  await page.getByRole("combobox", { name: "Cliente" }).click();
  await page.getByRole("option", { name: "Beta" }).click();
  await page.getByRole("combobox", { name: "Situação" }).click();
  await page.getByRole("option", { name: "Vencida" }).click();
  await expect(page.getByText("Nenhum título neste período e com estes filtros.")).toBeVisible();
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("row", { name: /Tracking mensal/ })).toBeVisible();

  // Inadimplência por cliente
  await page.getByRole("button", { name: "Inadimplência" }).click();
  const delinquency = page.getByRole("dialog");
  await expect(delinquency).toContainText("Alfa Pesquisas Ltda");
  await expect(delinquency).toContainText("2 títulos vencidos");
  await expect(delinquency).toContainText("até 10 dias de atraso");
  await expect(delinquency).toContainText("R$ 1.400,00");
  await expect(delinquency).not.toContainText("Beta Consultoria");
  await delinquency.getByRole("button", { name: "Fechar" }).first().click();

  // Recebimento parcial: o saldo continua e a situação vira Parcial
  const first = page.getByRole("row", { name: /Satisfação · 1ª parcela/ });
  await first.getByRole("button", { name: "Registrar recebimento" }).click();
  const receipt = page.getByRole("dialog");
  await receipt.getByLabel("Valor recebido (R$) *").fill("2000,00");
  await receipt.getByRole("button", { name: "Receber", exact: true }).click();
  await expect(receipt.getByText(/O valor recebido passa do saldo pendente/)).toBeVisible();
  await receipt.getByLabel("Valor recebido (R$) *").fill("400,00");
  await receipt.getByRole("button", { name: "Receber", exact: true }).click();
  await expect(page.getByText(/Recebimento parcial feito. Ainda faltam R\$\s500,00/)).toBeVisible();
  // vencido continua vencido enquanto falta receber; o recebido e o pendente mostram o parcial
  const partial = page.getByRole("row", { name: /Satisfação · 1ª parcela/ });
  await expect(partial).toContainText("Vencida");
  await expect(partial).toContainText("R$ 400,00");
  await expect(partial).toContainText("R$ 500,00");

  // Estorno devolve o valor ao pendente, e as duas linhas ficam no histórico
  await page.getByRole("row", { name: /Satisfação · 1ª parcela/ }).getByRole("button", { name: "Ver detalhes" }).click();
  const detail = page.getByRole("dialog");
  await detail.getByRole("tab", { name: /Recebimentos/ }).click();
  await detail.getByRole("button", { name: "Estornar" }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Estornar" }).click();
  await expect(page.getByText("Diga o motivo.")).toBeVisible();
  await page.getByLabel("Motivo *").fill("Pix devolvido pelo banco");
  await page.getByRole("dialog").last().getByRole("button", { name: "Estornar" }).click();
  await expect(detail.getByText("Estornado")).toBeVisible();
  await expect(detail.getByText("Estorno", { exact: true })).toBeVisible();
  await detail.getByRole("tab", { name: "Resumo" }).click();
  await expect(detail.getByText("R$ 900,00").last()).toBeVisible();
});

test("Contas a receber: título novo exige o projeto e o cadastro de cliente existe", async ({ page }) => {
  // outra conta: o mesmo código do autenticador não vale duas vezes no mesmo período
  await signIn(page, "receber2@e2e.invalid");
  await page.goto("/contas-a-receber");
  await page.getByRole("button", { name: "Nova conta a receber" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Valor bruto (R$) *").fill("1.000,00");
  await form.getByLabel("Abatimentos (R$)").fill("115,00");
  await expect(form.getByLabel("Líquido a receber")).toHaveValue(/885,00/);
  await form.getByRole("button", { name: "Lançar conta" }).click();
  await expect(form.getByText("Informe o projeto da receita.")).toBeVisible();

  await choose(page, "Cliente *", /Alfa/);
  await choose(page, "Projeto *", /PRJ-1804/);
  await choose(page, "Conta de receita *", /Receita de pesquisa/);
  await form.getByLabel("Descrição *").fill("Pesquisa de teste");
  await choose(page, "Empresa *", "PPlus");
  await choose(page, "Unidade *", "Consumo SP");
  await choose(page, "Centro de custo *", "Administrativo");
  await form.getByLabel("Abatimentos (R$)").fill("1.000,00");
  await form.getByRole("button", { name: "Lançar conta" }).click();
  await expect(form.getByText("Os abatimentos precisam ser menores que o valor.")).toBeVisible();
  await form.getByLabel("Abatimentos (R$)").fill("115,00");
  await form.getByRole("button", { name: "Lançar conta" }).click();
  await expect(page.getByText(/Conta lançada: R\$\s885,00/)).toBeVisible();

  // O cliente é um cadastro, com CNPJ e sem CPF
  await page.goto("/cadastros?aba=customers");
  await expect(page.getByRole("row", { name: /Alfa Pesquisas Ltda/ })).toContainText("11.222.333/0001-81");
});
