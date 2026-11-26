import { expect, test } from "@playwright/test";
import {
  API_URL,
  PASSWORD,
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

test("a tela oferece só e-mail e senha, sem Google nem Microsoft", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByLabel("Senha", { exact: true })).toBeVisible();
  // Os botões saíram da tela (Bruno, 17/11/2026)
  await expect(page.getByRole("link", { name: /Entrar com (Google|Microsoft)/ })).toHaveCount(0);
  await expect(page.getByText("ou", { exact: true })).toHaveCount(0);
});

test("sem as chaves do provedor, o endereço do Google ou da Microsoft avisa e volta para o login", async ({
  page,
}) => {
  // Sem botão na tela, o endereço do backend continua: quem chegar por ele cai no login com o aviso.
  for (const provider of ["google", "microsoft"]) {
    await page.goto(`${API_URL}/auth/sso/${provider}/start`);
    await expect(page).toHaveURL(/\/login\?erro=sso_indisponivel$/);
    await expect(page.getByText("Esse login ainda não está disponível")).toBeVisible();
  }
  expect(await refreshCookie(page)).toBeUndefined();
});

test("a CSP está ativa e não bloqueia nada da tela de login", async ({ page }) => {
  const blocked: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) blocked.push(message.text());
  });
  const response = await page.goto("/login");
  expect(response?.headers()["content-security-policy"]).toContain("nonce-");
  await submitPassword(page, "ninguem@e2e.invalid", "SenhaErrada1!");
  await expect(page.getByText("E-mail ou senha incorretos")).toBeVisible();
  expect(blocked).toEqual([]);
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

test("o primeiro acesso com a senha inicial cria a senha nova antes do autenticador, e a inicial deixa de valer", async ({
  page,
}) => {
  // Pedido do Bruno (25/11/2026): a conta nasce com uma senha inicial, que só vale para o primeiro acesso
  await submitPassword(page, "primeiro-acesso@e2e.invalid");
  await expect(page.getByRole("heading", { name: "Crie a sua senha" })).toBeVisible();
  await expect(page.getByText("Anote a senha nova num lugar seguro")).toBeVisible();
  expect(await refreshCookie(page)).toBeUndefined();

  // as duas não batem: nem vai ao servidor
  await page.getByLabel("Senha nova", { exact: true }).fill("Minha!Senha9");
  await page.getByLabel("Repita a senha nova").fill("Minha!Senha8");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.getByText("As duas senhas não são iguais. Digite de novo.")).toBeVisible();

  // fraca: o servidor diz o que falta
  await page.getByLabel("Senha nova", { exact: true }).fill("semmaiuscula1!");
  await page.getByLabel("Repita a senha nova").fill("semmaiuscula1!");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.getByText("Senha precisa ter pelo menos uma letra maiúscula")).toBeVisible();

  // igual à inicial: recusada
  await page.getByLabel("Senha nova", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Repita a senha nova").fill(PASSWORD);
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.getByText("A senha nova precisa ser diferente da senha inicial")).toBeVisible();

  // a certa segue para o cadastro do autenticador, como qualquer primeiro login
  await page.getByLabel("Senha nova", { exact: true }).fill("Minha!Senha9");
  await page.getByLabel("Repita a senha nova").fill("Minha!Senha9");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.getByRole("heading", { name: "Cadastre o segundo fator" })).toBeVisible();
  const secret = (await page.locator("code").innerText()).trim();
  await page.getByLabel(/Código/).fill(totp(secret));
  await page.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByRole("heading", { name: "Guarde seus códigos de recuperação" })).toBeVisible();
  await page.getByRole("button", { name: "Já guardei, continuar" }).click();
  await expectHome(page);

  // a senha inicial não entra mais; a nova vai direto ao código do app
  await page.context().clearCookies();
  await submitPassword(page, "primeiro-acesso@e2e.invalid");
  await expect(page.getByText("E-mail ou senha incorretos")).toBeVisible();
  await submitPassword(page, "primeiro-acesso@e2e.invalid", "Minha!Senha9");
  await expect(page.getByRole("heading", { name: "Verificação em duas etapas" })).toBeVisible();
});

test("com a senha redefinida, a pessoa troca a provisória e segue para o código do autenticador de sempre", async ({
  page,
}) => {
  // make redefinir-senha (26/11/2026): a conta já tem o autenticador, então não cadastra de novo
  await submitPassword(page, "senha-redefinida@e2e.invalid");
  await expect(page.getByRole("heading", { name: "Crie a sua senha" })).toBeVisible();
  await expect(page.getByText("Sua senha foi redefinida. Troque a senha provisória")).toBeVisible();
  await expect(page.getByText("digite o código do app autenticador, como sempre")).toBeVisible();

  await page.getByLabel("Senha nova", { exact: true }).fill("Minha!Senha9");
  await page.getByLabel("Repita a senha nova").fill("Minha!Senha9");
  await page.getByRole("button", { name: "Salvar e continuar" }).click();
  await expect(page.getByRole("heading", { name: "Verificação em duas etapas" })).toBeVisible();
  await submitCode(page, totp(TOTP_SECRET));
  await expectHome(page);

  // a provisória não entra mais
  await page.context().clearCookies();
  await submitPassword(page, "senha-redefinida@e2e.invalid");
  await expect(page.getByText("E-mail ou senha incorretos")).toBeVisible();
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
  // Nada de sessão no navegador: só a marca de que o passeio de introdução já foi visto (todo navegador de teste nasce com
  // ela) e a lista de abas abertas (só os endereços das telas, sem token; o Sair apaga)
  expect(stored.session.every((key) => key.startsWith("financeiro:abas:"))).toBe(true);
  expect({ ...stored, session: [] }).toEqual({ local: ["financeiro:passeio-visto"], session: [], cookie: "" });
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
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([]);
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
