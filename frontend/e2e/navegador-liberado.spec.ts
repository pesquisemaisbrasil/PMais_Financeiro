import { expect, test, type BrowserContextOptions } from "@playwright/test";
import { RECOVERY_CODE, TOTP_SECRET, expectHome, signIn, submitCode, submitPassword, totp } from "./fixtures";

// Navegador liberado (spec acesso-e-auditoria, ADR 0022): a conta só entra pelos computadores que um
// administrador liberou. O primeiro computador de cada conta é liberado sozinho.

/** O mesmo código do autenticador não vale duas vezes: espera a próxima janela de 30 s. */
async function nextAuthenticatorCode(): Promise<string> {
  const used = totp(TOTP_SECRET);
  while (totp(TOTP_SECRET) === used) await new Promise((resolve) => setTimeout(resolve, 1000));
  return totp(TOTP_SECRET);
}

test("um computador novo espera o administrador liberar, e depois entra", async ({ page, browser, baseURL }, testInfo) => {
  test.setTimeout(180_000);
  // Cada contexto do Playwright é um navegador diferente, com os próprios cookies
  const options: BrowserContextOptions = {
    baseURL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    storageState: testInfo.project.use.storageState as BrowserContextOptions["storageState"],
  };

  // O primeiro computador da pessoa entra direto, e ela não vê a tela Acessos (não é admin)
  await signIn(page, "acessos@e2e.invalid");
  await expect(page.getByRole("link", { name: "Acessos" })).toHaveCount(0);

  // Outro computador: senha e código certos, mas fica esperando, sem sessão
  const other = await browser.newContext(options);
  const otherPage = await other.newPage();
  await submitPassword(otherPage, "acessos@e2e.invalid");
  await submitCode(otherPage, RECOVERY_CODE); // o código do app acabou de ser usado no primeiro computador
  await expect(otherPage.getByRole("heading", { name: "Computador ainda não liberado" })).toBeVisible();
  await expect(otherPage.getByText(/Este computador ainda não está liberado\. O pedido foi para o administrador/)).toBeVisible();

  // O admin entra no computador dele e libera o pedido em Acessos
  const admin = await browser.newContext(options);
  const adminPage = await admin.newPage();
  await signIn(adminPage, "acessos-admin@e2e.invalid");
  await adminPage.getByRole("link", { name: "Acessos" }).click();
  await expect(adminPage.getByRole("heading", { name: "Acessos" })).toBeVisible();
  await expect(adminPage.getByRole("tab", { name: "Pedidos (1)" })).toBeVisible();
  const request = adminPage.getByRole("row", { name: /acessos@e2e\.invalid/ });
  await request.getByRole("button", { name: /^Liberar/ }).click();
  await adminPage.getByRole("alertdialog").getByRole("button", { name: "Liberar" }).click();
  await expect(adminPage.getByText("Computador liberado. A pessoa já pode entrar.")).toBeVisible();
  await expect(adminPage.getByText("Nenhum pedido esperando.")).toBeVisible();

  // O outro computador entra de novo, agora liberado
  await otherPage.getByRole("button", { name: "Voltar ao login" }).click();
  await submitPassword(otherPage, "acessos@e2e.invalid");
  await submitCode(otherPage, await nextAuthenticatorCode());
  await expectHome(otherPage);

  // O admin não libera o próprio computador: no pedido dele, a tela diz isso por escrito, sem o botão Liberar
  const adminOther = await browser.newContext(options);
  const adminOtherPage = await adminOther.newPage();
  await submitPassword(adminOtherPage, "acessos-admin@e2e.invalid");
  await submitCode(adminOtherPage, RECOVERY_CODE); // o código do app foi usado no computador dele
  await expect(adminOtherPage.getByRole("heading", { name: "Computador ainda não liberado" })).toBeVisible();
  await adminPage.reload();
  const ownRequest = adminPage.getByRole("row", { name: /acessos-admin@e2e\.invalid/ });
  await expect(ownRequest.getByText("É o seu computador: outro administrador libera.")).toBeVisible();
  await expect(ownRequest.getByRole("button", { name: /^Liberar/ })).toHaveCount(0);

  await other.close();
  await admin.close();
  await adminOther.close();
});
