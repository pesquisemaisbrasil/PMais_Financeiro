import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";
import { ofx } from "./ofx";

// A conta paga que o seed deixa pronta: R$ 450,00 em 02/04/2030, do fornecedor Ponto Certo, no
// Itaú · PPlus. As linhas do extrato são de abril de 2030, longe das datas dos outros testes.
const STATEMENT = ofx(
  ["20300403", "-450.00", "C1", "PIX ENVIADO GRAFICA PONTO CERTO"],
  ["20300404", "-18.90", "C2", "TARIFA DO MÊS"],
  ["20300405", "1234.56", "C3", "RENDIMENTO APLICACAO"],
  ["20300406", "-999.99", "C4", "PIX ENVIADO FULANO SEM LANCAMENTO"]
);

test("conciliar o extrato: sugestão, classificação com NF, exceção com motivo e desfazer", async ({ page }) => {
  await signIn(page, "conciliacao@e2e.invalid");
  await page.goto("/conferencia-bancaria");
  await page.getByRole("combobox", { name: "Conta bancária" }).click();
  await page.getByRole("option", { name: "Itaú · PPlus" }).click();

  // Importa as 4 linhas: todas começam pendentes
  await page.getByRole("button", { name: "Importar extrato" }).click();
  const importer = page.getByRole("dialog");
  await importer.getByLabel("Extrato do banco").setInputFiles({ name: "extrato-abril.ofx", mimeType: "application/x-ofx", buffer: STATEMENT });
  await importer.getByRole("button", { name: "Importar 4 linhas novas" }).click();
  await expect(page.getByText("4 linhas importadas.")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Pendentes 4" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Conciliadas 0" })).toBeVisible();

  // ---- Conciliar com a sugestão: valor igual, 1 dia de diferença e o nome na descrição ----
  await page.getByRole("button", { name: "Conciliar PIX ENVIADO GRAFICA PONTO CERTO" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("-R$ 450,00")).toBeVisible();
  const suggestion = dialog.getByRole("button", { name: /Conciliação E2E · material gráfico · Ponto Certo/ });
  await expect(suggestion).toContainText("valor igual · 1 dia(s) de diferença · nome na descrição");
  await expect(suggestion).toContainText("pago em 02/04/2030");
  await expect(dialog.getByRole("button", { name: "Conciliar", exact: true })).toBeDisabled(); // falta escolher
  await suggestion.click();
  await expect(suggestion).toHaveAttribute("aria-pressed", "true");

  // Pagamento com NF pede número e emissão
  await dialog.getByRole("combobox", { name: "Classificação *" }).click();
  await page.getByRole("option", { name: "Pagamento com NF" }).click();
  await dialog.getByRole("button", { name: "Conciliar", exact: true }).click();
  await expect(dialog.getByText("Pagamento com NF pede o número e a data de emissão da nota.")).toBeVisible();
  await dialog.getByLabel("Número da nota *").fill("5521");
  await dialog.getByLabel("Emissão da nota *").fill("2030-04-01");
  await dialog.getByRole("button", { name: "Conciliar", exact: true }).click();
  await expect(page.getByText("Linha conciliada.")).toBeVisible();
  const reconciled = page.getByRole("row", { name: /PIX ENVIADO GRAFICA PONTO CERTO/ });
  await expect(reconciled).toContainText("Conciliada");
  await expect(reconciled).toContainText("Conciliação E2E · material gráfico · Pagamento com NF · NF 5521");

  // ---- Linha sem lançamento: exceção com motivo ----
  await page.getByRole("button", { name: "Conciliar TARIFA DO MÊS" }).click();
  await expect(dialog.getByText(/Nenhum lançamento com baixa de R\$\s18,90 até 3 dias dessa linha/)).toBeVisible();
  await dialog.getByRole("tab", { name: "Marcar exceção" }).click();
  await dialog.getByRole("button", { name: "Marcar exceção" }).last().click();
  await expect(dialog.getByText("Diga o motivo da exceção.")).toBeVisible();
  await dialog.getByLabel("Motivo *").fill("Tarifa do banco");
  await dialog.getByRole("combobox", { name: "Classificação" }).click();
  await page.getByRole("option", { name: "Tarifa", exact: true }).click();
  await dialog.getByRole("button", { name: "Marcar exceção" }).last().click();
  await expect(page.getByText("Linha marcada como exceção.")).toBeVisible();
  await expect(page.getByRole("row", { name: /TARIFA DO MÊS/ })).toContainText("Exceção: Tarifa do banco · Tarifa");

  // Uma entrada sem título recebido: a mensagem manda para o Contas a receber
  await page.getByRole("button", { name: "Conciliar RENDIMENTO APLICACAO" }).click();
  await expect(dialog.getByText(/Dê a baixa no Contas a receber ou marque a linha como exceção/)).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();

  // As abas contam e filtram
  await expect(page.getByRole("tab", { name: "Pendentes 2" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Conciliadas 1" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Exceções 1" })).toBeVisible();
  await page.getByRole("tab", { name: "Conciliadas 1" }).click();
  await expect(page.getByRole("row", { name: /PIX ENVIADO GRAFICA PONTO CERTO/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /TARIFA DO MÊS/ })).toHaveCount(0);
  await page.getByRole("tab", { name: "Pendentes 2" }).click();
  await expect(page.getByRole("row", { name: /RENDIMENTO APLICACAO/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /FULANO SEM LANCAMENTO/ })).toBeVisible();
  await page.getByRole("tab", { name: "Todas 4" }).click();

  // ---- Desfazer pede o motivo e a linha volta a ficar pendente ----
  await page.getByRole("button", { name: "Desfazer a conciliação de PIX ENVIADO GRAFICA PONTO CERTO" }).click();
  await dialog.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(dialog.getByText("Diga o motivo.")).toBeVisible();
  await dialog.getByLabel("Motivo *").fill("Linha errada");
  await dialog.getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(page.getByText("Conciliação desfeita.")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Pendentes 3" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Conciliadas 0" })).toBeVisible();
  await expect(page.getByRole("row", { name: /PIX ENVIADO GRAFICA PONTO CERTO/ })).toContainText("Pendente");

  // A conta paga volta a ser sugerida para a linha liberada
  await page.getByRole("button", { name: "Conciliar PIX ENVIADO GRAFICA PONTO CERTO" }).click();
  await expect(dialog.getByRole("button", { name: /Conciliação E2E · material gráfico/ })).toBeVisible();
  await dialog.getByRole("button", { name: "Cancelar" }).click();
});
