import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

const SEEN_KEY = "financeiro:passeio-visto";

test("passeio de introdução: abre sozinho na primeira visita, avança, conclui e pode ser revisto", async ({ page }) => {
  await signIn(page, "passeio@e2e.invalid");
  const tour = page.locator(".driver-popover");

  // Os testes já nascem com o passeio visto: nada abre sozinho
  await page.waitForTimeout(1500);
  await expect(tour).toHaveCount(0);

  // Primeira visita de um navegador novo: o passeio abre sozinho no Início
  await page.evaluate((key) => localStorage.removeItem(key), SEEN_KEY);
  await page.reload();
  await expect(tour).toContainText("Bem-vindo ao Financeiro");
  await expect(tour).toContainText("1 de 8");
  // abrir já marca como visto: recarregar no meio do passeio não o faz voltar sozinho
  expect(await page.evaluate((key) => localStorage.getItem(key), SEEN_KEY)).toBe("1");

  // Cada passo destaca uma parte do menu, em português
  const steps = ["Menu principal", "Início", "Financeiro", "Relatórios", "Cadastros", "Avisos", "Ver o passeio de novo"];
  for (const [index, title] of steps.entries()) {
    await tour.getByRole("button", { name: "Próximo" }).click();
    await expect(tour).toContainText(title);
    await expect(tour).toContainText(`${index + 2} de 8`);
  }
  await tour.getByRole("button", { name: "Voltar" }).click();
  await expect(tour).toContainText("Avisos");
  await tour.getByRole("button", { name: "Próximo" }).click();
  await tour.getByRole("button", { name: "Concluir" }).click();
  await expect(tour).toHaveCount(0);

  // Concluído, não abre mais sozinho; o botão do menu revê o passeio, e fechar também conta como visto
  await page.reload();
  await page.waitForTimeout(1500);
  await expect(tour).toHaveCount(0);
  await page.getByRole("button", { name: "Conhecer o sistema" }).click();
  await expect(tour).toContainText("Bem-vindo ao Financeiro");
  await tour.getByRole("button", { name: "Fechar o passeio" }).click();
  await expect(tour).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), SEEN_KEY)).toBe("1");
});

// O botão "Conhecer o sistema" mostra o passeio da tela em que a pessoa está.
const SCREENS = [
  { path: "/contas-a-pagar", first: "Contas a pagar", minimum: 5 },
  { path: "/contas-a-receber", first: "Contas a receber", minimum: 4 },
  { path: "/conferencia-bancaria", first: "Conferência bancária", minimum: 3 },
  { path: "/divergencias", first: "Divergências", minimum: 2 },
  { path: "/cadastros", first: "Cadastros", minimum: 3 },
  { path: "/relatorios/projeto", first: "Relatório do projeto", minimum: 2 },
];

test("passeio de cada tela: o botão do menu explica a tela aberta, passo a passo, e não mexe no passeio geral", async ({
  page,
}) => {
  // outro usuário: o código do autenticador do teste anterior ainda não vale de novo (janela de 30 s)
  await signIn(page, "passeio-telas@e2e.invalid");
  const tour = page.locator(".driver-popover");

  for (const screen of SCREENS) {
    await page.goto(screen.path);
    await expect(page.locator('[data-tour="tela"]')).toBeVisible();
    await page.waitForLoadState("networkidle");
    await page.evaluate((key) => localStorage.setItem(key, "1"), SEEN_KEY);

    await page.getByRole("button", { name: "Conhecer o sistema" }).click();
    await expect(tour, screen.path).toContainText(screen.first);
    await expect(tour, screen.path).not.toContainText("Bem-vindo ao Financeiro");

    // anda até o fim: o botão Concluir só aparece no último passo
    const progress = (await tour.textContent())?.match(/(\d+) de (\d+)/);
    const total = Number(progress?.[2]);
    expect(total, `${screen.path}: passos na tela`).toBeGreaterThanOrEqual(screen.minimum);
    for (let step = 1; step < total; step += 1) {
      await tour.getByRole("button", { name: "Próximo" }).click();
      await expect(tour, screen.path).toContainText(`${step + 1} de ${total}`);
    }
    await tour.getByRole("button", { name: "Concluir" }).click();
    await expect(tour, screen.path).toHaveCount(0);
  }

  // No Início, o botão continua mostrando o passeio geral
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /^(Bom dia|Boa tarde|Boa noite), / })).toBeVisible();
  await page.getByRole("button", { name: "Conhecer o sistema" }).click();
  await expect(tour).toContainText("Bem-vindo ao Financeiro");
  await expect(tour).toContainText("1 de 8");
  await tour.getByRole("button", { name: "Fechar o passeio" }).click();
});
