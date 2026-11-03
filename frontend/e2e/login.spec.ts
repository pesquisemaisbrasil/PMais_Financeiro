import { expect, test } from "@playwright/test";
import {
  API_URL,
  RECOVERY_CODE,
  TOTP_SECRET,
  expectHome,
  refreshCookie,
  signIn,
  submitCode,
  submitPassword,
  totp,
} from "./fixtures";

const WRONG_CODE_MESSAGE = "Código de verificação inválido";

test("sem sessão, a tela inicial manda para o login", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Entrar na sua conta" })).toBeVisible();
});

test("senha errada e e-mail sem conta recebem a mesma mensagem", async ({ page }) => {
  for (const [email, password] of [
    ["ana@e2e.invalid", "SenhaErrada1!"],
    ["ninguem@e2e.invalid", "SenhaErrada1!"],
  ]) {
    await submitPassword(page, email, password);
    await expect(page.getByText("E-mail ou senha incorretos")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("o primeiro login cadastra o autenticador e mostra os códigos antes de liberar", async ({ page }) => {
  await submitPassword(page, "novo@e2e.invalid");
  await expect(page.getByRole("heading", { name: "Cadastre o segundo fator" })).toBeVisible();
  await expect(page.locator("svg title", { hasText: "QR code" })).toHaveCount(1);
  expect(await refreshCookie(page)).toBeUndefined();

  // sem terminar o cadastro, a tela inicial não abre
  const otherTab = await page.context().newPage();
  await otherTab.goto("/");
  await expect(otherTab).toHaveURL(/\/login$/);
  await otherTab.close();

  await page.getByLabel(/Código/).fill("000000");
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText(WRONG_CODE_MESSAGE)).toBeVisible();
  await expect(page.getByLabel(/Código/)).toHaveValue("");

  const secret = (await page.locator("code").innerText()).trim();
  await page.getByLabel(/Código/).fill(totp(secret));
  await page.getByRole("button", { name: "Confirmar" }).click();

  await expect(page.getByRole("heading", { name: "Guarde seus códigos de recuperação" })).toBeVisible();
  await expect(page.locator("main ul li")).toHaveCount(10);
  await expect(page).toHaveURL(/\/login$/);

  await page.getByRole("button", { name: "Já guardei, continuar" }).click();
  await expectHome(page);
});

test("com o MFA cadastrado, a sessão aguenta recarregar e abrir duas abas, e sair encerra", async ({ page }) => {
  await submitPassword(page, "ana@e2e.invalid");
  await expect(page.getByRole("heading", { name: "Verificação em duas etapas" })).toBeVisible();
  expect(await refreshCookie(page)).toBeUndefined();

  await submitCode(page, totp(TOTP_SECRET));
  await expectHome(page);

  const stored = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    cookie: document.cookie,
  }));
  expect(stored).toEqual({ local: [], session: [], cookie: "" });
  const cookie = await refreshCookie(page);
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Strict");
  expect(cookie?.path).toBe("/auth");

  await page.reload();
  await expectHome(page);

  const [first, second] = [await page.context().newPage(), await page.context().newPage()];
  await Promise.all([first.goto("/"), second.goto("/")]);
  await Promise.all([expectHome(first), expectHome(second)]);
  await first.close();
  await second.close();
  await page.reload();
  await expectHome(page);

  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await refreshCookie(page)).toBeUndefined();
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("um código já usado não entra de novo", async ({ page }) => {
  const code = totp(TOTP_SECRET);
  await submitPassword(page, "repete@e2e.invalid");
  await submitCode(page, code);
  await expectHome(page);
  await page.getByRole("button", { name: "Sair" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await submitPassword(page, "repete@e2e.invalid");
  await submitCode(page, code);
  await expect(page.getByText(WRONG_CODE_MESSAGE)).toBeVisible();
  expect(await refreshCookie(page)).toBeUndefined();
});

test("o código de recuperação entra uma vez só", async ({ page }) => {
  for (const expected of ["entra", "recusado"]) {
    await submitPassword(page, "recupera@e2e.invalid");
    await expect(page.getByRole("heading", { name: "Verificação em duas etapas" })).toBeVisible();
    await page.getByRole("button", { name: "Usar um código de recuperação" }).click();
    await submitCode(page, RECOVERY_CODE);
    if (expected === "entra") {
      await expectHome(page);
      await page.getByRole("button", { name: "Sair" }).click();
      await expect(page).toHaveURL(/\/login$/);
    } else {
      await expect(page.getByText(WRONG_CODE_MESSAGE)).toBeVisible();
    }
  }
});

test("um refresh antigo que reaparece derruba a sessão", async ({ page }) => {
  await signIn(page, "roubo@e2e.invalid");
  const stolen = await refreshCookie(page);
  await page.reload();
  await expectHome(page);
  const current = await refreshCookie(page);
  expect(current?.value).not.toBe(stolen?.value);

  await page.context().addCookies([{ ...current!, value: stolen!.value }]);
  const status = await page.evaluate(
    (api) => fetch(`${api}/auth/token/refresh`, { method: "POST", credentials: "include" }).then((r) => r.status),
    API_URL
  );
  expect(status).toBe(401);

  await page.context().addCookies([current!]);
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
});
