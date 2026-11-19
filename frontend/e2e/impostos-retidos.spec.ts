import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./fixtures";

// Os dados de teste começam com os percentuais zerados (backend/scripts/seed_e2e.py), para os outros testes
// conferirem valores exatos. Este liga os percentuais pedidos pelo Bruno em 19/11/2026 e zera no fim.
const RATES: [string, string][] = [
  ["PIS (%)", "0,65"],
  ["COFINS (%)", "3"],
  ["CSLL (%)", "1"],
  ["IR (%)", "1,5"],
];

async function setRates(page: Page, values: string[]) {
  await page.goto("/cadastros?aba=taxRates");
  for (const [index, [label]] of RATES.entries()) await page.getByLabel(label, { exact: true }).fill(values[index]);
  await page.getByRole("button", { name: "Salvar percentuais" }).click();
  await expect(page.getByText("Percentuais salvos.")).toBeVisible();
}

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("dialog").getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
}

test("impostos retidos: os percentuais do cadastro já vêm calculados na conta nova e podem ser mudados", async ({
  page,
}) => {
  await signIn(page, "impostos@e2e.invalid");
  try {
    // Cadastros › Impostos retidos: percentual inválido é barrado em palavras simples
    await page.goto("/cadastros?aba=taxRates");
    await expect(page.getByRole("heading", { name: "Cadastros - Impostos retidos", exact: true })).toBeVisible();
    await page.getByLabel("IR (%)", { exact: true }).fill("150");
    await page.getByRole("button", { name: "Salvar percentuais" }).click();
    await expect(page.getByText("Informe o percentual de IR entre 0 e 100, como 1,5.")).toBeVisible();
    await setRates(
      page,
      RATES.map(([, value]) => value)
    );

    // A conta nova já traz os quatro calculados sobre o valor principal
    await page.goto("/contas-a-pagar");
    await page.getByRole("button", { name: "Nova conta a pagar" }).click();
    const form = page.getByRole("dialog");
    await expect(form.getByText(/PIS 0,65%, COFINS 3%, CSLL 1% e IR 1,5%/)).toBeVisible();
    // Sem o valor principal, a janela mostra os percentuais e avisa que o cálculo é sobre ele
    await form.getByRole("button", { name: "Impostos" }).click();
    const empty = page.getByRole("dialog", { name: "Acréscimos, descontos e impostos" });
    await expect(empty.getByText("Informe o valor principal: PIS, COFINS, CSLL e IR são calculados sobre ele.")).toBeVisible();
    await expect(empty.getByText("0,65%", { exact: true })).toBeVisible();
    await expect(empty.getByText("1,5%", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(empty).toBeHidden();
    await form.getByLabel("Valor principal (R$) *").fill("1.000,00");
    // 6,50 + 30,00 + 10,00 + 15,00
    await expect(form.getByLabel("(−) Total de impostos")).toHaveValue(/61,50/);
    await expect(form.getByLabel("Valor líquido")).toHaveValue(/938,50/);
    // Trocar o valor principal recalcula
    await form.getByLabel("Valor principal (R$) *").fill("2.000,00");
    await expect(form.getByLabel("(−) Total de impostos")).toHaveValue(/123,00/);

    // Na janela, cada imposto pode ser mudado; depois disso o valor principal não mexe mais neles
    await form.getByRole("button", { name: "Impostos" }).click();
    const values = page.getByRole("dialog", { name: "Acréscimos, descontos e impostos" });
    await expect(values.getByLabel("PIS", { exact: true })).toHaveValue("13,00");
    await expect(values.getByLabel("COFINS", { exact: true })).toHaveValue("60,00");
    await expect(values.getByLabel("CSLL", { exact: true })).toHaveValue("20,00");
    await expect(values.getByLabel("IR", { exact: true })).toHaveValue("30,00");
    await values.getByLabel("IR", { exact: true }).fill("");
    await values.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(form.getByLabel("(−) Total de impostos")).toHaveValue(/93,00/);
    await form.getByLabel("Valor principal (R$) *").fill("3.000,00");
    await expect(form.getByLabel("(−) Total de impostos")).toHaveValue(/93,00/);
    await expect(form.getByLabel("Valor líquido")).toHaveValue(/2\.907,00/);

    await form.getByLabel("Vencimento *").fill("2027-04-15");
    await choose(page, "Fornecedor *", /Exata/);
    await choose(page, "Plano de contas *", /Serviços de terceiros/);
    await form.getByLabel("Descrição *").fill("Conta com impostos retidos");
    await choose(page, "Projeto *", /PRJ-1804/);
    await choose(page, "Unidade *", /Consumo SP · PPlus/);
    await choose(page, "Centro de custo *", "Administrativo");
    await choose(page, "Forma de pagamento *", "Pix");
    await form.getByRole("button", { name: "Lançar conta" }).click();

    await page.getByRole("combobox", { name: "Visão por período" }).click();
    await page.getByRole("option", { name: "Tudo" }).click();
    await page.getByLabel("Buscar conta, fornecedor, NF, projeto ou valor").fill("Conta com impostos retidos");
    await expect(page.getByRole("row", { name: /Conta com impostos retidos/ })).toContainText(/R\$\s2\.907,00/);
  } finally {
    await setRates(page, ["0", "0", "0", "0"]);
  }
});
