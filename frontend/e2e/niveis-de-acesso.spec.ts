import { expect, test, type BrowserContextOptions } from "@playwright/test";
import { signIn } from "./fixtures";

// Três níveis de acesso (Bruno, 19/11/2026): o admin bloqueia telas do usuário, todos abrem demanda e
// só o super admin lê as demandas. Cada pessoa num navegador próprio (o primeiro computador entra direto).

// Um PNG de 1 x 1 pixel, fictício
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

test("níveis de acesso: o admin bloqueia telas, o usuário abre demanda e só o super admin vê as demandas", async ({
  page,
  browser,
  baseURL,
}, testInfo) => {
  test.setTimeout(180_000);
  const options: BrowserContextOptions = {
    baseURL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    storageState: testInfo.project.use.storageState as BrowserContextOptions["storageState"],
  };
  const menu = (p: typeof page) => p.getByRole("navigation", { name: "Menu principal" });

  // ---- Admin: Acessos › Pessoas e telas, e não vê Demandas
  await signIn(page, "niveis-admin@e2e.invalid");
  await expect(menu(page).getByRole("link", { name: "Demandas" })).toHaveCount(0);
  await menu(page).getByRole("link", { name: "Acessos" }).click();
  await page.getByRole("tab", { name: "Pessoas e telas" }).click();
  await expect(page.getByRole("row", { name: /niveis-super@e2e\.invalid/ })).toContainText("O super admin vê tudo");
  await expect(page.getByRole("row", { name: /niveis-admin@e2e\.invalid/ })).toContainText("Só o super admin muda");
  const person = page.getByRole("row", { name: /niveis-usuario@e2e\.invalid/ });
  await expect(person).toContainText("Usuário");
  await person.getByRole("button", { name: "Telas de niveis-usuario" }).click();
  const screens = page.getByRole("dialog", { name: "Telas de niveis-usuario" });
  await screens.getByLabel("Contas a receber").uncheck();
  await screens.getByLabel("Cadastros").uncheck();
  await screens.getByRole("button", { name: "Salvar telas" }).click();
  await expect(page.getByText(/Telas salvas\./)).toBeVisible();
  await expect(person).toContainText("Contas a receber, Cadastros");

  // ---- Usuário: as telas bloqueadas somem do menu e não abrem pelo endereço
  const userContext = await browser.newContext(options);
  const user = await userContext.newPage();
  await signIn(user, "niveis-usuario@e2e.invalid");
  await expect(menu(user).getByRole("button", { name: "Cadastros" })).toHaveCount(0);
  await expect(menu(user).getByRole("link", { name: "Acessos" })).toHaveCount(0);
  await expect(menu(user).getByRole("link", { name: "Demandas" })).toHaveCount(0);
  // o grupo Financeiro já começa aberto
  await expect(menu(user).getByRole("link", { name: /^Contas a pagar/ })).toBeVisible();
  await expect(menu(user).getByRole("link", { name: "Contas a receber" })).toHaveCount(0);
  await user.goto("/contas-a-receber");
  await expect(user.getByRole("heading", { name: "Tela não liberada" })).toBeVisible();
  await expect(user.getByText("Esta tela não está liberada para você. Fale com o administrador.")).toBeVisible();

  // Abrir demanda: tipo, descrição e anexo são obrigatórios
  await user.goto("/");
  await menu(user).getByRole("button", { name: "Abrir demanda" }).click();
  const demand = user.getByRole("dialog", { name: "Abrir demanda" });
  await demand.getByRole("button", { name: "Enviar" }).click();
  await expect(demand.getByText("Preencha os campos obrigatórios: Tipo, Descrição e Anexo.")).toBeVisible();
  await demand.getByRole("combobox", { name: "Tipo *" }).click();
  await expect(user.getByRole("option")).toHaveText(["Abrir nova demanda", "Correção de bugs", "Correção de regra"]);
  await user.getByRole("option", { name: "Correção de bugs" }).click();
  await demand.getByLabel("Descrição *").fill("O total da tela não bate com a planilha (teste fictício)");
  await demand.getByLabel("Anexo *").setInputFiles({ name: "tela.png", mimeType: "image/png", buffer: PNG });
  await expect(demand.getByRole("img", { name: "Imagem anexada" })).toBeVisible();
  await demand.getByRole("button", { name: "Enviar" }).click();
  await expect(user.getByText("Demanda enviada. Obrigado!")).toBeVisible();
  await expect(demand).toBeHidden();

  // A tela Demandas não abre para quem não é super admin
  await page.goto("/demandas");
  await expect(page.getByText("Esta tela é só do super admin.")).toBeVisible();

  // ---- Super admin: vê a demanda, de onde veio e baixa o anexo
  const superContext = await browser.newContext(options);
  const superPage = await superContext.newPage();
  await signIn(superPage, "niveis-super@e2e.invalid");
  await expect(menu(superPage).getByRole("link", { name: "Acessos" })).toBeVisible();
  await menu(superPage).getByRole("link", { name: "Demandas" }).click();
  const row = superPage.getByRole("row", { name: /O total da tela não bate/ });
  await expect(row).toContainText("Correção de bugs");
  await expect(row).toContainText("niveis-usuario");
  await expect(row).toContainText("Início");
  const download = superPage.waitForEvent("download");
  await row.getByRole("button", { name: "Baixar tela.png" }).click();
  expect((await download).suggestedFilename()).toBe("tela.png");

  await userContext.close();
  await superContext.close();
});
