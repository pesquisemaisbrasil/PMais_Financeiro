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
