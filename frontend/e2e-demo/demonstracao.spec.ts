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

test("a tela de entrada mostra a demonstração, Google e Microsoft só como visual, e a faixa leva ao protótipo", async ({
  page,
}) => {
  await open(page);

  await expect(page.getByLabel("Senha", { exact: true })).not.toHaveValue("");
  // Os botões aparecem, mas não levam a lugar nenhum: o clique só avisa que o login ainda não está disponível
  for (const provider of ["Google", "Microsoft"]) {
    await page.getByRole("button", { name: `Entrar com ${provider}` }).click();
    await expect(page.getByText("Esse login ainda não está disponível. Use e-mail e senha.")).toBeVisible();
    expect(new URL(page.url()).pathname).toMatch(/^\/teste\/(login\/)?$/);
  }
  await expect(page.getByText("Ambiente de teste com dados fictícios")).toBeVisible();
  await expect(page.getByRole("link", { name: "Voltar ao protótipo" })).toHaveAttribute("href", "/");
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
  await expect(page.getByLabel("E-mail")).toHaveValue("demo@pesquisemais.invalid");

  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Boa (tarde|noite)|^Bom dia/ })).toBeVisible();
  await go(page, "Financeiro", "Contas a pagar");
  await expect(page.getByRole("button", { name: /^Pagos/ })).toContainText("R$ 1.570,00");
});
