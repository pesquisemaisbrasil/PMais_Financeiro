import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

// Busca em todo o sistema (pedido do Bruno, 18/11/2026; spec busca-geral): no alto de todas as telas,
// uma palavra mostra o que existe com ela, separado por grupo, com a palavra marcada.

test("busca geral: separa por grupo, marca a palavra e abre o item", async ({ page }) => {
  await signIn(page, "busca@e2e.invalid");
  const search = page.getByRole("combobox", { name: "Buscar em todo o sistema" });
  const results = page.getByRole("region", { name: "Resultados da busca" });

  // Sem acento: "itau" acha a conta bancária "Itaú · PPlus", com a palavra marcada
  await search.fill("itau");
  const banks = results.getByRole("region", { name: "Contas bancárias" });
  await expect(banks.getByRole("link", { name: /Itaú · PPlus/ })).toBeVisible();
  await expect(banks.locator("mark").first()).toHaveText("Itaú");

  // Um cliente aparece nos títulos a receber e no cadastro, cada um no seu grupo; o clique abre o cadastro
  await search.fill("alfa");
  await expect(results.getByRole("region", { name: "Contas a receber" })).toBeVisible();
  await results.getByRole("region", { name: "Clientes" }).getByRole("link", { name: /^Alfa/ }).click();
  await expect(page).toHaveURL(/\/cadastros\?aba=customers&busca=Alfa/);
  await expect(page.getByLabel("Buscar em clientes")).toHaveValue("Alfa");
  await expect(page.getByRole("row", { name: /Alfa Pesquisas/ })).toBeVisible();

  // Ctrl+K leva à busca de qualquer tela; a conta a pagar abre direto
  await page.keyboard.press("Control+k");
  await expect(search).toBeFocused();
  await search.fill("ponto certo");
  const payables = results.getByRole("region", { name: "Contas a pagar" });
  await expect(payables.getByRole("link").first()).toBeVisible();
  await payables.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/contas-a-pagar\?modo=tudo&conta=\d+/);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");

  // Casos negados: uma letra só não busca; sem achado, a tela diz
  await search.fill("a");
  await expect(results).toContainText("Digite ao menos 2 letras.");
  await search.fill("zzqqxx");
  await expect(results).toContainText("Nada encontrado para “zzqqxx”.");
  await page.keyboard.press("Escape");

  // Toda caixa de busca acha do mesmo jeito (18/11): maiúscula, acento e ordem das palavras não importam
  await page.goto("/contas-a-receber?modo=tudo");
  await page.getByLabel("Buscar título, cliente ou contrato").fill("PARCELA satisfacao");
  await expect(page.getByRole("row", { name: /Satisfação · 1ª parcela/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Tracking mensal/ })).toHaveCount(0);
  await page.goto("/cadastros?aba=suppliers");
  await page.getByLabel("Buscar em fornecedores").fill("CERTO grafica");
  await expect(page.getByRole("row", { name: /Gráfica Ponto Certo/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Contabilidade Exata/ })).toHaveCount(0);
});
