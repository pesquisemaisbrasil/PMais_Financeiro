import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";
import { ofx } from "./ofx";

const NAME = "MARIA EXEMPLO DA SILVA"; // fictício: o nome de quem pagou, que vai na descrição do Pix

const FIRST = ofx(
  ["20300305", "-200.00", "X1", `PIX ENVIADO ${NAME}`],
  ["20300306", "1500.50", "X2", "PIX RECEBIDO Conciliação"],
  ["20300307", "-18.90", "X3", "TARIFA DO MÊS"]
);
const OVERLAP = ofx(
  ["20300307", "-18.90", "X3", "TARIFA DO MÊS"], // já estava
  ["20300308", "300.00", "X4", "PIX RECEBIDO Outro cliente"]
);

test("conta bancária com os dados do banco e extrato importado sem duplicar", async ({ page }) => {
  await signIn(page, "extrato@e2e.invalid");

  // ---- Cadastros → Contas bancárias: banco, agência, conta, tipo e saldo inicial ----
  await page.goto("/cadastros?aba=bankAccounts");
  await page.getByRole("button", { name: "Nova conta bancária" }).click();
  const form = page.getByRole("dialog");
  await expect(form.getByLabel("Banco *")).toHaveValue("Itaú"); // o banco de hoje já vem preenchido
  await form.getByRole("combobox", { name: "Empresa *" }).click();
  await page.getByRole("option", { name: "PPlus" }).click();
  await form.getByLabel("Nome *").fill("Itaú · Extrato E2E");
  await form.getByLabel("Agência").fill("12 34 abc");
  await form.getByLabel("Conta").fill("98765-4");
  await form.getByLabel("Saldo inicial").fill("1.000,00");
  // saldo sem data é recusado, e agência com letras também
  await form.getByRole("button", { name: "Cadastrar" }).click();
  await expect(form.getByText("A agência tem só números, hífen e o dígito (pode ser X)")).toBeVisible();
  await form.getByLabel("Agência").fill("1234");
  await form.getByRole("button", { name: "Cadastrar" }).click();
  await expect(form.getByText("Informe a data do saldo inicial")).toBeVisible();
  await form.getByLabel("Data do saldo").fill("2030-03-01");
  await form.getByRole("button", { name: "Cadastrar" }).click();
  const account = page.getByRole("row", { name: /Itaú · Extrato E2E/ });
  await expect(account).toContainText("Itaú · ag. 1234 · conta 98765-4 · Conta corrente");

  // ---- Conferência bancária: importar o extrato ----
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  await menu.getByRole("button", { name: "Financeiro" }).click();
  await menu.getByRole("link", { name: "Conferência bancária" }).click();
  await expect(page.getByRole("heading", { name: "Conferência bancária" })).toBeVisible();
  await page.getByRole("combobox", { name: "Conta bancária" }).click();
  await page.getByRole("option", { name: "Itaú · Extrato E2E" }).click();
  await expect(page.getByText("Itaú · ag. 1234 · conta 98765-4 · Conta corrente")).toBeVisible();
  await expect(page.getByText("Nenhum extrato importado nesta conta ainda.")).toBeVisible();

  // Arquivo que não é extrato: a mensagem do servidor, e nada é gravado
  await page.getByRole("button", { name: "Importar extrato" }).click();
  const importer = page.getByRole("dialog");
  await importer.getByLabel("Extrato do banco").setInputFiles({
    name: "nao-e-extrato.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("isto não é um extrato", "utf-8"),
  });
  await expect(importer.getByText("Não foi possível ler o extrato — envie OFX ou CSV do banco")).toBeVisible();
  await expect(importer.getByRole("button", { name: "Importar" })).toBeDisabled();
  // Tipo de arquivo errado: a tela recusa antes de enviar
  await importer.getByLabel("Extrato do banco").setInputFiles({
    name: "extrato.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n"),
  });
  await expect(importer.getByText("extrato.pdf: envie o extrato em OFX ou CSV")).toBeVisible();

  // OFX de verdade: a prévia mostra o que entra antes de gravar
  await importer.getByLabel("Extrato do banco").setInputFiles({ name: "extrato-marco.ofx", mimeType: "application/x-ofx", buffer: FIRST });
  const tile = (label: string) => importer.getByText(label, { exact: true }).locator("xpath=..");
  await expect(tile("Linhas novas")).toContainText("3");
  await expect(tile("Já estavam")).toContainText("0");
  await expect(tile("Período")).toContainText("05/03/2030 a 07/03/2030");
  await expect(tile("Entradas novas")).toContainText("R$ 1.500,50");
  await expect(tile("Saídas novas")).toContainText("R$ 218,90");
  await expect(importer.getByText(`PIX ENVIADO ${NAME}`)).toBeVisible();
  await importer.getByRole("button", { name: "Importar 3 linhas novas" }).click();
  await expect(page.getByText("3 linhas importadas.")).toBeVisible();

  // As linhas aparecem, da mais nova para a mais antiga, e a descrição volta legível
  await expect(page.getByRole("row", { name: /07\/03\/2030 TARIFA DO MÊS/ })).toBeVisible();
  await expect(page.getByRole("row", { name: new RegExp(`05/03/2030 PIX ENVIADO ${NAME}`) })).toContainText("-R$ 200,00");
  const lines = await page.getByRole("row", { name: /^\d{2}\/03\/2030 / }).allTextContents();
  expect(lines.map((line) => line.slice(0, 10))).toEqual(["07/03/2030", "06/03/2030", "05/03/2030"]);
  await expect(page.getByText("3 linhas · página 1 de 1")).toBeVisible();
  const history = page.getByRole("region", { name: "Extratos importados" });
  await expect(history.getByRole("row", { name: /extrato-marco\.ofx/ })).toContainText("05/03/2030 a 07/03/2030");

  // O mesmo arquivo de novo: a prévia avisa e não deixa importar; nada duplica
  await page.getByRole("button", { name: "Importar extrato" }).click();
  await importer.getByLabel("Extrato do banco").setInputFiles({ name: "extrato-marco.ofx", mimeType: "application/x-ofx", buffer: FIRST });
  await expect(importer.getByText(/Este mesmo arquivo já foi importado em/)).toBeVisible();
  await expect(importer.getByRole("button", { name: "Nada novo para importar" })).toBeDisabled();
  await importer.getByRole("button", { name: "Cancelar" }).click();

  // Outro extrato que se sobrepõe: só a linha nova entra
  await page.getByRole("button", { name: "Importar extrato" }).click();
  await importer.getByLabel("Extrato do banco").setInputFiles({ name: "extrato-sobreposto.ofx", mimeType: "application/x-ofx", buffer: OVERLAP });
  await importer.getByRole("button", { name: "Importar 1 linha nova" }).click();
  await expect(page.getByText("1 linha importada, 1 já estava.")).toBeVisible();
  await expect(page.getByText("4 linhas · página 1 de 1")).toBeVisible();
  await expect(history.getByRole("row", { name: /extrato-sobreposto\.ofx/ })).toBeVisible();

  // O período filtra as linhas e os totais
  await page.getByLabel("De", { exact: true }).fill("2030-03-06");
  await page.getByLabel("Até", { exact: true }).fill("2030-03-06");
  await expect(page.getByText("1 linha · página 1 de 1")).toBeVisible();
  await expect(page.getByRole("row", { name: /PIX RECEBIDO Conciliação/ })).toBeVisible();
  await page.getByRole("button", { name: "Limpar período" }).click();
  await expect(page.getByText("4 linhas · página 1 de 1")).toBeVisible();

  // Conta com extrato não se exclui: só se inativa
  await page.goto("/cadastros?aba=bankAccounts");
  await page.getByRole("row", { name: /Itaú · Extrato E2E/ }).getByRole("button", { name: /^Excluir / }).click();
  await expect(page.getByText(/tem lançamentos ou extratos: inative em vez de excluir/)).toBeVisible();

  // Inativa a conta: ela sai das listas de escolha. É também o que mantém os outros testes iguais,
  // porque "Dar baixa" só escolhe a conta sozinho quando a empresa tem uma só conta ativa.
  await page.getByRole("button", { name: "Inativar Itaú · Extrato E2E" }).click();
  await expect(page.getByRole("button", { name: "Reativar Itaú · Extrato E2E" })).toBeVisible();
  await page.goto("/conferencia-bancaria");
  await page.getByRole("combobox", { name: "Conta bancária" }).click();
  await expect(page.getByRole("option", { name: "Itaú · Extrato E2E" })).toHaveCount(0);
});
