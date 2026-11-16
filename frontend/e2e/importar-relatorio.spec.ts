import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./fixtures";

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("dialog").getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
}

// O relatório "Lançamentos a Pagar" do sistema antigo: título em cima, cabeçalho na linha 4, um valor por coluna.
const REPORT = [
  "Lançamentos a Pagar;;;;;;;;;;;;;;",
  ";;;;;;;;;;;;;;",
  ";;;;;;;;;;;;;;",
  "Programação;Pagamento;Fornecedor;Plano de Contas;R$ Líquido;R$ Pago;R$ Pendente;Projeto;Unidade;CCusto;Empresa;Conta;Situação;Descrição;Documento",
  "18/12/2030;;Exata;Serviços de terceiros;657,8;;657,8;Adm_Central;Consumo SP;Administrativo;PPlus;;PENDENTE;Contabilidade do relatório;",
  "05/09/2025;05/09/2025;Fornecedor Antigo;Aluguel e condomínio;500;500;0;;Consumo SP;Administrativo;PPlus;Banco Itaú;PAGO;Aluguel do relatório;",
  "20/12/2030;;Exata;Plano que não existe;100;;100;;Consumo SP;Administrativo;PPlus;;PENDENTE;Linha com plano desconhecido;",
].join("\r\n");

const FILE = { name: "lancamentos-a-pagar.csv", mimeType: "text/csv", buffer: Buffer.from(REPORT, "utf-8") };

// O mesmo relatório do jeito que o sistema antigo exporta: uma tabela HTML com a extensão .xls, o cabeçalho na
// primeira linha e a chave Pix (um CPF de teste) na descrição.
const [TITLES, ...LINES] = REPORT.split("\r\n").slice(3).map((line) => line.split(";"));
const OLD_LINE = [...LINES[0]];
OLD_LINE[0] = "21/12/2030";
OLD_LINE[13] = "Aluguel PIX CPF 529.982.247-25";
const table = [TITLES, OLD_LINE]
  .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
  .join("");
const OLD_XLS = {
  name: "DADOSAPAGAR_20261116_111257.xls",
  mimeType: "application/vnd.ms-excel",
  buffer: Buffer.from(`﻿<html><body><table border=1>${table}</table></body></html>`, "utf-8"),
};

async function openReportImport(page: Page) {
  await page.getByRole("button", { name: "Importar planilha" }).click();
  const importer = page.getByRole("dialog");
  await choose(page, "Tipo *", "Relatório do sistema antigo");
  await expect(importer.getByRole("combobox", { name: "Tipo *" })).toContainText("Relatório do sistema antigo");
  await choose(page, "Forma de pagamento", "Pix");
  await importer.getByLabel("Relatório *").setInputFiles(FILE);
  await importer.getByRole("button", { name: "Ler relatório" }).click();
  return importer;
}

test("importar o relatório do sistema antigo: confere, cria uma conta por linha com a baixa das pagas e não repete", async ({
  page,
}) => {
  await signIn(page, "relatorio-antigo@e2e.invalid");
  await page.goto("/contas-a-pagar");

  // Sem o relatório, a janela pede o arquivo
  await page.getByRole("button", { name: "Importar planilha" }).click();
  const empty = page.getByRole("dialog");
  await choose(page, "Tipo *", "Relatório do sistema antigo");
  await empty.getByRole("button", { name: "Ler relatório" }).click();
  await expect(empty.getByText("Escolha o relatório.")).toBeVisible();
  await empty.getByRole("button", { name: "Cancelar" }).click();

  // A prévia: nada é gravado, e cada decisão aparece em palavras
  const importer = await openReportImport(page);
  await expect(importer.getByRole("heading", { name: "Conferir antes de importar" })).toBeVisible();
  await expect(importer.getByText("Fornecedor Antigo não está nos cadastros: entra só com o nome")).toBeVisible();
  await expect(importer.getByText("Projeto Adm_Central não existe: a conta entra sem projeto")).toBeVisible();
  await expect(importer.getByText(/Plano de contas Plano que não existe não existe\. Cadastre ou marque um padrão/)).toBeVisible();
  await expect(importer.getByText("Paga em 05/09/2025")).toBeVisible();
  await expect(importer.getByText(/Itaú · PPlus/).first()).toBeVisible();
  await expect(importer.getByRole("button", { name: "Importar 2 contas" })).toBeEnabled();

  // Importar: o aviso, a aba só delas e a origem em cada linha
  await importer.getByRole("button", { name: "Importar 2 contas" }).click();
  await expect(page.getByText(/2 contas importadas do relatório, 1 paga, R\$\s1\.157,80\./)).toBeVisible();
  // O grupo da lista passa a ser o das contas do relatório (o seletor fica no painel de Filtros)
  await page.getByRole("button", { name: /Filtros/ }).click();
  await expect(page.getByRole("combobox", { name: "Grupo de lançamentos" })).toContainText("Importados de relatório (2)");
  await page.keyboard.press("Escape");
  const paidRow = page.getByRole("row", { name: /Fornecedor Antigo/ });
  await expect(paidRow).toContainText("Importado de relatório");
  await expect(paidRow).toContainText("Paga");
  const pendingRow = page.getByRole("row", { name: /Contabilidade do relatório/ });
  await expect(pendingRow).toContainText("Importado de relatório");
  await expect(pendingRow).toContainText(/R\$\s657,80/);

  // A conta paga mostra a baixa que veio do relatório
  await paidRow.getByText("Aluguel do relatório").first().click();
  const opened = page.getByRole("dialog");
  await opened.getByRole("tab", { name: /Baixas/ }).click();
  await expect(opened.getByText(/R\$\s500,00/).first()).toBeVisible();
  await expect(opened.getByText(/Itaú · PPlus/).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // Enviar o mesmo relatório de novo não cria nada
  const again = await openReportImport(page);
  await expect(again.getByText("Nenhuma linha pode entrar")).toBeVisible();
  await expect(again.getByText("Já importada antes").first()).toBeVisible();
  await expect(again.getByRole("button", { name: "Importar 0 contas" })).toBeDisabled();

  // O arquivo do jeito que o sistema antigo exporta (.xls): o CPF da chave Pix sai do texto e a conta entra
  await again.getByRole("button", { name: "Voltar" }).click();
  await again.getByLabel("Relatório *").setInputFiles(OLD_XLS);
  await again.getByRole("button", { name: "Ler relatório" }).click();
  await expect(again.getByText("CPF retirado da coluna Descrição: o sistema não guarda CPF")).toBeVisible();
  await expect(again.getByText("Aluguel PIX CPF (CPF retirado)")).toBeVisible();
  await expect(again.getByText("529.982.247-25")).toHaveCount(0);
  await expect(again.getByRole("button", { name: "Importar 1 conta" })).toBeEnabled();
});
