import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

// O site de teste publicado só tem dados fictícios, e a faixa lembra disso em toda tela (o E2E roda com ela ligada).
test("faixa do ambiente de teste: aparece no login e no app, leva ao protótipo e não esconde o menu", async ({ page }) => {
  await page.goto("/login");
  const banner = page.getByRole("status").filter({ hasText: "Ambiente de teste com dados fictícios" });
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Não digite dado real.");
  await expect(banner.getByRole("link", { name: "Voltar ao protótipo" })).toHaveAttribute("href", "/");

  await signIn(page, "faixa@e2e.invalid");
  await expect(banner).toBeVisible();
  const bannerBox = await banner.boundingBox();
  expect(bannerBox?.y).toBe(0);

  // O menu lateral começa logo abaixo da faixa e cabe na tela: o "Sair" não fica para baixo da dobra
  const menu = await page.getByRole("navigation", { name: "Menu principal" }).boundingBox();
  expect(menu?.y).toBeGreaterThanOrEqual((bannerBox?.height ?? 0) - 1);
  const exit = await page.getByRole("button", { name: "Sair" }).boundingBox();
  const viewport = page.viewportSize();
  expect((exit?.y ?? 0) + (exit?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);

  // A faixa acompanha a rolagem, e o menu continua inteiro
  await page.mouse.wheel(0, 600);
  await expect(banner).toBeVisible();
  expect((await banner.boundingBox())?.y).toBe(0);
  await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();
});
