import { expect, test, type Page } from "@playwright/test";

const BASE = "/teste/";

/** O backend (Python) liga dentro do navegador: a primeira tela só aparece depois. */
async function open(page: Page) {
  await page.goto(BASE);
  // o login da demonstração já vem preenchido, depois que o backend do navegador liga
  await expect(page.getByLabel("E-mail")).toHaveValue("demo@pesquisemais.invalid");
}

async function enter(page: Page) {
  await open(page);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Boa (tarde|noite)|^Bom dia/ })).toBeVisible();
}

/**
 * Vai a uma tela pelo menu, como a pessoa faria. Nunca por `page.goto`: recarregar a página
 * reinicia o backend do navegador e volta aos dados de exemplo.
 */
async function go(page: Page, group: string | null, link: string) {
  const menu = page.getByRole("navigation");
  const target = menu.getByRole("link", { name: new RegExp(`^${link}`) }).first();
  if (group && !(await target.isVisible())) {
    await menu.getByRole("button", { name: new RegExp(`^${group}`) }).first().click();
  }
  await target.click();
}

test("a tela de entrada tem os dois acessos, sem Google nem Microsoft, e a faixa leva ao protótipo", async ({
  page,
}) => {
  await open(page);

  await expect(page.getByLabel("Senha", { exact: true })).not.toHaveValue("");
  await expect(page.getByRole("tab", { name: "Financeiro" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Desenvolvimento" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Entrar com (Google|Microsoft)/ })).toHaveCount(0);
  await expect(page.getByText("ou", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Ambiente de teste com dados fictícios")).toBeVisible();
  await expect(page.getByRole("link", { name: "Voltar ao protótipo" })).toHaveAttribute("href", "/");
});

// Um PNG de 1 × 1 ponto: o print da solicitação
const PRINT = {
  name: "print.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  ),
};

test("solicitações: a equipe envia com tipo, descrição e imagem, e só o acesso do desenvolvimento, com a chave, vê", async ({
  page,
}) => {
  await enter(page);
  const menu = page.getByRole("navigation");
  // a equipe não tem a tela de Solicitações
  await expect(menu.getByRole("link", { name: /^Solicitações/ })).toHaveCount(0);

  // o modal exige o tipo, a descrição e a imagem
  await page.getByRole("button", { name: "Enviar solicitação" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(dialog.getByText("Preencha os campos obrigatórios: Tipo, Descrição e Imagem.")).toBeVisible();
  await dialog.getByRole("radio", { name: /Correção de regra/ }).click();
  await dialog.getByLabel("Descrição *").fill("A agenda de incentivos deveria pular o feriado municipal.");
  await dialog.getByLabel("Imagem *").setInputFiles(PRINT);
  await expect(dialog.getByRole("img", { name: "Imagem anexada" })).toBeVisible();
  await dialog.getByRole("button", { name: "Enviar", exact: true }).click();
  await expect(page.getByText("Solicitação enviada. Obrigado!")).toBeVisible();

  // o acesso do desenvolvimento: a chave errada não entra; a certa abre as solicitações
  await page.getByRole("button", { name: "Sair" }).click();
  await page.getByRole("tab", { name: "Desenvolvimento" }).click();
  await page.getByLabel("Chave de acesso").fill("chave-errada");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByText("Chave errada.")).toBeVisible();
  await page.getByLabel("Chave de acesso").fill("chave-de-teste");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Desenvolvimento/ })).toBeVisible();

  await go(page, null, "Solicitações");
  await expect(page.getByRole("heading", { name: "Solicitações" })).toBeVisible();
  const row = page.getByRole("row", { name: /A agenda de incentivos deveria pular o feriado municipal/ });
  await expect(row).toContainText("Correção de regra");
  await expect(row).toContainText("Início");
  await expect(row).toContainText("Bruna Demonstração");
  await row.getByRole("button", { name: "Ver imagem" }).click();
  await expect(page.getByRole("dialog").getByRole("img", { name: /Imagem da solicitação/ })).toBeVisible();
});

test("nada sai do navegador: todo pedido vai para o próprio site", async ({ page, baseURL }) => {
  const outside: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith(baseURL!) && !url.startsWith("data:") && !url.startsWith("blob:")) {
      outside.push(url);
    }
  });

  await enter(page);
  await go(page, "Financeiro", "Contas a pagar");
  await expect(page.getByText("Impressão de questionários").first()).toBeVisible();

  expect(outside).toEqual([]);
});

test("Contas a pagar mostra o dia com baixas, vencimentos e provisão, e dar baixa soma nos pagos", async ({
  page,
}) => {
  await enter(page);
  await go(page, "Financeiro", "Contas a pagar");

  const gráfica = page.getByRole("row", { name: /Impressão de questionários/ });
  await expect(gráfica).toBeVisible();
  await expect(gráfica.getByText("Paga", { exact: true })).toBeVisible();
  await expect(page.getByText("Provisão", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pagos/ })).toContainText("R$ 1.570,00");

  await page
    .getByRole("row", { name: /Incentivos aos entrevistados/ })
    .getByRole("button", { name: "Dar baixa" })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar baixa" }).click();

  await expect(page.getByText(/Conta paga: Incentivos aos entrevistados/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pagos/ })).toContainText("R$ 4.370,00");
});

// O relatório "Lançamentos a Pagar" do jeito que o sistema antigo exporta: uma tabela HTML com a extensão .xls.
// A chave Pix da primeira linha é um CPF de teste, que o sistema retira do texto.
const REPORT_TITLES =
  "Programação;Pagamento;Fornecedor;Plano de Contas;R$ Líquido;R$ Pago;R$ Pendente;Projeto;Unidade;CCusto;Empresa;Conta;Situação;Descrição;Documento".split(
    ";",
  );
const REPORT_LINES = [
  ["21/12/2030", "", "Exata", "Serviços de terceiros", "300,00", "", "300,00", "", "Consumo SP", "Administrativo", "PPlus", "", "PENDENTE", "Aluguel PIX CPF 529.982.247-25", ""],
  ["05/09/2025", "05/09/2025", "Fornecedor Antigo", "Aluguel e condomínio", "500,00", "500,00", "0,00", "", "Consumo SP", "Administrativo", "PPlus", "Banco Itaú", "PAGO", "Aluguel do relatório", ""],
];
const REPORT_XLS = {
  name: "DADOSAPAGAR_20261116_111257.xls",
  mimeType: "application/vnd.ms-excel",
  buffer: Buffer.from(
    `﻿<html><body><table border=1>${[REPORT_TITLES, ...REPORT_LINES]
      .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
      .join("")}</table></body></html>`,
    "utf-8",
  ),
};

test("importar o relatório do sistema antigo (.xls) lê o arquivo no navegador, retira o CPF e cria as contas", async ({
  page,
}) => {
  await enter(page);
  await go(page, "Financeiro", "Contas a pagar");

  await page.getByRole("button", { name: "Importar planilha" }).click();
  const importer = page.getByRole("dialog");
  await importer.getByRole("combobox", { name: "Tipo *" }).click();
  await page.getByRole("option", { name: "Relatório do sistema antigo" }).click();
  await importer.getByRole("combobox", { name: "Forma de pagamento" }).click();
  await page.getByRole("option", { name: "Pix" }).click();
  await importer.getByLabel("Relatório *").setInputFiles(REPORT_XLS);
  await importer.getByRole("button", { name: "Ler relatório" }).click();

  await expect(importer.getByRole("heading", { name: "Conferir antes de importar" })).toBeVisible();
  await expect(importer.getByText("CPF retirado da coluna Descrição: o sistema não guarda CPF")).toBeVisible();
  await expect(importer.getByText("529.982.247-25")).toHaveCount(0);
  await importer.getByRole("button", { name: "Importar 2 contas" }).click();
  await expect(page.getByText(/2 contas importadas do relatório, 1 paga/)).toBeVisible();
});

test("o menu marca a página e a seção atuais e o título diz Seção - Página, mesmo com a barra no fim do endereço do site exportado", async ({
  page,
}) => {
  await enter(page);
  const menu = page.getByRole("navigation");
  const current = menu.locator('[aria-current="page"]');

  await go(page, "Financeiro", "Contas a pagar");
  // o site exportado termina o endereço com barra: o menu comparava com o endereço sem ela e não marcava nada
  expect(new URL(page.url()).pathname).toMatch(/\/$/);
  await expect(page.getByRole("heading", { name: "Financeiro - Contas a pagar", exact: true })).toBeVisible();
  await expect(current).toHaveText(/^Contas a pagar/);
  await expect(menu.getByRole("button", { name: "Financeiro" })).toHaveAttribute("data-current", "true");

  await go(page, "Cadastros", "Fornecedores");
  await expect(page.getByRole("heading", { name: "Cadastros - Fornecedores", exact: true })).toBeVisible();
  await expect(current).toHaveText("Fornecedores");
  await expect(menu.getByRole("button", { name: "Cadastros" })).toHaveAttribute("data-current", "true");
  await expect(menu.getByRole("button", { name: "Financeiro" })).not.toHaveAttribute("data-current", "true");
});

test("Contas a receber abre no dia com títulos que vencem hoje", async ({ page }) => {
  await enter(page);
  await go(page, "Financeiro", "Contas a receber");

  await expect(page.getByRole("row", { name: /Pesquisa de varejo · entrega final/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Painel de consumo · 2ª parcela/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Satisfação · 3ª parcela/ })).toBeVisible();
  // a Beta já pagou R$ 700 de um título que vence hoje: continua em aberto, com o que falta
  await expect(page.getByRole("row", { name: /Tracking mensal · / })).toContainText("R$ 2.500,00");
});

test("a Conferência bancária mostra o extrato conciliado e os outros meses", async ({ page }) => {
  await enter(page);
  await go(page, "Financeiro", "Conferência bancária");

  await expect(page.getByText("PAGTO BOLETO ALUGUEL SALA EXEMPLO")).toBeVisible();
  await expect(page.getByText("TED RECEBIDA CLIENTE EXEMPLO")).toBeVisible();

  await page.getByRole("tab", { name: "Fechamento" }).click();
  await expect(page.getByText("PPlus").first()).toBeVisible();
});

test("a agenda de incentivos e o Início usam as regras de verdade", async ({ page }) => {
  await enter(page);
  await expect(page.getByText("1 conta a pagar vencida")).toBeVisible();

  await go(page, "Relatórios", "Incentivos");
  await expect(page.getByText("Incentivos · pesquisa de satisfação")).toBeVisible();
  await expect(page.getByText("Vencem hoje")).toBeVisible();
});

test("recarregar a página mantém o que foi feito e a sessão", async ({ page }) => {
  await enter(page);
  await go(page, "Financeiro", "Contas a pagar");
  await page
    .getByRole("row", { name: /Incentivos aos entrevistados/ })
    .getByRole("button", { name: "Dar baixa" })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar baixa" }).click();
  await expect(page.getByRole("button", { name: /^Pagos/ })).toContainText("R$ 4.370,00");

  await page.reload();

  // sem tela de entrada: a sessão e o banco voltaram como estavam
  await expect(page.getByRole("button", { name: /^Pagos/ })).toContainText("R$ 4.370,00");
});

test("uma cópia guardada de outra versão é descartada e a demonstração recomeça do zero", async ({
  page,
}) => {
  await enter(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open("financeiro-demonstracao", 1);
        open.onsuccess = () => {
          const tx = open.result.transaction("estado", "readwrite");
          tx.objectStore("estado").put({ schemaId: "versao-antiga", bytes: new Uint8Array([1, 2, 3]) }, "banco");
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        open.onerror = () => reject(open.error);
      })
  );

  await page.reload();

  // banco novo: a sessão antiga não existe nele, então volta a tela de entrada, com o login preenchido
  await expect(page.getByLabel("E-mail")).toHaveValue("demo@pesquisemais.invalid");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Boa (tarde|noite)|^Bom dia/ })).toBeVisible();
  await go(page, "Financeiro", "Contas a pagar");
  await expect(page.getByRole("button", { name: /^Pagos/ })).toContainText("R$ 1.570,00");
});

test("sair e entrar de novo logo em seguida funciona (o código do autenticador é da mesma janela)", async ({
  page,
}) => {
  await enter(page);

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page.getByLabel("E-mail")).toHaveValue("demo@pesquisemais.invalid");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();

  await expect(page.getByRole("heading", { name: /^Boa (tarde|noite)|^Bom dia/ })).toBeVisible();
});

test("restaurar pede confirmação e cancelar não apaga nada", async ({ page }) => {
  await enter(page);

  await page.getByRole("button", { name: "Restaurar dados de exemplo" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancelar" }).click();

  await expect(page.getByRole("heading", { name: /^Boa (tarde|noite)|^Bom dia/ })).toBeVisible();
});

test("restaurar os dados de exemplo volta para a tela de entrada e desfaz o que foi feito", async ({
  page,
}) => {
  await enter(page);
  await go(page, "Financeiro", "Contas a pagar");
  await page
    .getByRole("row", { name: /Incentivos aos entrevistados/ })
    .getByRole("button", { name: "Dar baixa" })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar baixa" }).click();
  await expect(page.getByRole("button", { name: /^Pagos/ })).toContainText("R$ 4.370,00");

  await page.getByRole("button", { name: "Restaurar dados de exemplo" }).click();
  // apagar tudo pede confirmação
  await page.getByRole("alertdialog").getByRole("button", { name: "Restaurar", exact: true }).click();
  await expect(page.getByLabel("E-mail")).toHaveValue("demo@pesquisemais.invalid");

  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Boa (tarde|noite)|^Bom dia/ })).toBeVisible();
  await go(page, "Financeiro", "Contas a pagar");
  await expect(page.getByRole("button", { name: /^Pagos/ })).toContainText("R$ 1.570,00");
});
