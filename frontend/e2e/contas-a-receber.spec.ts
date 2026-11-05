import { readFile } from "node:fs/promises";
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

test("Contas a receber: receita parcelada em 3, ajuste da tabela, alterar a série e exportar", async ({ page }) => {
  await signIn(page, "receber3@e2e.invalid");
  await page.goto("/contas-a-receber");
  await page.getByRole("button", { name: "Nova conta a receber" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Vencimento *").fill("2027-01-15");
  await form.getByLabel("Valor bruto (R$) *").fill("1.000,00");
  await form.getByLabel("Abatimentos (R$)").fill("100,00");
  await choose(page, "Cliente *", /Beta/);
  await choose(page, "Projeto *", /PRJ-1804/);
  await choose(page, "Conta de receita *", /Receita de pesquisa/);
  await form.getByLabel("Descrição *").fill("Receita parcelada de teste");
  await choose(page, "Empresa *", "PPlus");
  await choose(page, "Unidade *", "Consumo SP");
  await choose(page, "Centro de custo *", "Administrativo");

  // Parcelar exige conferir a tabela antes de salvar
  await form.getByLabel("Repetir esta conta").check();
  await choose(page, "Como se repete", /Parcelado/);
  await form.getByLabel("Quantas vezes").fill("3");
  await form.getByRole("button", { name: "Lançar conta" }).click();
  await expect(form.getByText("Clique em Simular para conferir as parcelas antes de salvar.")).toBeVisible();
  await form.getByRole("button", { name: "Simular" }).click();
  await expect(form.getByLabel("Valor da ocorrência 1")).toHaveValue("333.33");
  await expect(form.getByLabel("Valor da ocorrência 3")).toHaveValue("333.34");

  // Parcelas que não somam o título são recusadas, sem criar nada
  await form.getByLabel("Valor da ocorrência 1").fill("300.00");
  await form.getByRole("button", { name: "Lançar conta" }).click();
  await expect(form.getByText(/As parcelas somam R\$\s966,67, mas o título é de R\$\s1\.000,00/)).toBeVisible();

  // 30% na aprovação e o resto nas demais: a soma fecha com o título
  await form.getByLabel("Valor da ocorrência 1").fill("300.00");
  await form.getByLabel("Valor da ocorrência 2").fill("350.00");
  await form.getByLabel("Valor da ocorrência 3").fill("350.00");
  await form.getByRole("button", { name: "Lançar conta" }).click();
  await expect(page.getByText(/3 títulos lançados, o primeiro vence em 15\/01\/2027/)).toBeVisible();

  await page.getByRole("combobox", { name: "Visão por período" }).click();
  await page.getByRole("option", { name: "Tudo" }).click();
  await page.getByLabel("Buscar título, cliente ou contrato").fill("parcelada de teste");
  await expect(page.getByRole("row", { name: /Receita parcelada de teste/ })).toHaveCount(3);
  await expect(page.getByRole("row", { name: /1\/3/ })).toContainText("R$ 300,00");
  await expect(page.getByRole("row", { name: /3\/3/ })).toContainText("R$ 350,00");

  // Alterar "esta e as seguintes" a partir da 2ª
  await page.getByRole("row", { name: /2\/3/ }).getByRole("button", { name: "Alterar ou cancelar a série" }).click();
  const series = page.getByRole("dialog");
  await series.getByLabel("Esta e as seguintes").check();
  await series.getByLabel("Nova descrição").fill("Receita renegociada");
  await series.getByRole("button", { name: "Alterar títulos" }).click();
  await expect(page.getByText(/2 títulos alterados. O que já foi recebido não muda./)).toBeVisible();
  // a busca antiga não acha mais os alterados: busca pela palavra que as duas descrições têm
  await page.getByLabel("Buscar título, cliente ou contrato").fill("receita");
  await expect(page.getByRole("row", { name: /Receita parcelada de teste/ })).toHaveCount(1);
  await expect(page.getByRole("row", { name: /Receita renegociada/ })).toHaveCount(2);

  // Exportar leva os filtros e a busca na primeira linha
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^contas-a-receber-.*\.csv$/);
  const csv = await readFile((await download.path()) as string, "utf8");
  expect(csv).toContain("Contas a receber · todo o período por vencimento · Total");
  expect(csv).toContain("busca: receita");
  // uma linha por título dos três da série, e mais nenhum
  expect(csv.split("\r\n").filter((line) => /Receita (parcelada|renegociada)/.test(line)).length).toBe(3);
});
