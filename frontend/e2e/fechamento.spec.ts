import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";
import { ofx } from "./ofx";

const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** O mês antes do de hoje (horário de São Paulo, como o sistema): fechar o mês passado não atrapalha os outros testes. */
function previousMonth(): string {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  const index = year * 12 + (month - 1) - 1;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

const PREVIOUS = previousMonth();
const [PREVIOUS_YEAR, PREVIOUS_NUMBER] = PREVIOUS.split("-").map(Number);
const LABEL = `${MONTHS[PREVIOUS_NUMBER - 1]}/${PREVIOUS_YEAR}`;
const DAY = (n: number) => `${PREVIOUS.replace("-", "")}${String(n).padStart(2, "0")}`;
const SHOWN = (n: number) => `${String(n).padStart(2, "0")}/${String(PREVIOUS_NUMBER).padStart(2, "0")}/${PREVIOUS_YEAR}`;

const STATEMENT = ofx(
  [DAY(10), "-18.90", "F1", "TARIFA MANUTENCAO CONTA"],
  [DAY(11), "1000.00", "F2", "RENDIMENTO APLICACAO AUTOMATICA"]
);

test("extrato × sistema, saldo do mês e fechamento: fechar, a trava, a planilha e reabrir", async ({ page }) => {
  await signIn(page, "fechamento@e2e.invalid");
  await page.goto("/conferencia-bancaria");
  await page.getByRole("combobox", { name: "Conta bancária" }).click();
  await page.getByRole("option", { name: "Itaú · PPlus" }).click();

  // Importa o extrato do mês passado (duas linhas, ainda pendentes)
  await page.getByRole("button", { name: "Importar extrato" }).click();
  const importer = page.getByRole("dialog");
  await importer.getByLabel("Extrato do banco").setInputFiles({ name: "extrato-mes-passado.ofx", mimeType: "application/x-ofx", buffer: STATEMENT });
  await importer.getByRole("button", { name: "Importar 2 linhas novas" }).click();
  await expect(page.getByText("2 linhas importadas.")).toBeVisible();

  // ---- Extrato × sistema: a saída do extrato não tem baixa, e a tela explica ----
  await page.getByRole("tab", { name: "Extrato × sistema" }).click();
  await page.getByRole("button", { name: "Mês anterior" }).click();
  await expect(page.getByRole("group", { name: "Mês" }).getByText(LABEL)).toBeVisible();
  const difference = page.getByText("explicada ao lado").locator("xpath=..");
  await expect(difference).toContainText("R$ 18,90");
  await expect(difference).toContainText("explicada ao lado");
  await expect(page.getByRole("row", { name: new RegExp(`${SHOWN(10)}`) })).toContainText("R$ 18,90");
  const reasons = page.getByRole("list", { name: "O que explica a diferença" });
  await expect(reasons).toContainText("1 saída do extrato sem par · R$ 18,90");
  await expect(reasons).toContainText("TARIFA MANUTENCAO CONTA");
  await expect(reasons).toContainText("(pendente)");
  await expect(reasons).toContainText("Nenhuma. Pix devolvido: a saída está no extrato");

  // ---- Saldo do mês: a entrada e a saída do extrato, e o que falta conferir ----
  await page.getByRole("tab", { name: "Saldo do mês" }).click();
  await expect(page.getByText(`Saldo de ${LABEL}`)).toBeVisible();
  const account = page.getByRole("row", { name: /Itaú · PPlus/ });
  await expect(account).toContainText("R$ 1.000,00"); // entradas
  await expect(account).toContainText("R$ 18,90"); // saídas
  await expect(account).toContainText("PPlus · Conta corrente");
  await expect(page.getByRole("row", { name: /Consolidado/ })).toBeVisible();

  // ---- Fechamento: ainda não dá, e diz por quê ----
  await page.getByRole("tab", { name: "Fechamento" }).click();
  const pplus = page.getByRole("region", { name: `PPlus · ${LABEL}` });
  await expect(pplus.getByText("Aberto")).toBeVisible();
  await expect(pplus).toContainText("2 linhas sem conferir");
  await expect(pplus.getByRole("button", { name: `Fechar ${LABEL}` })).toBeDisabled();
  const mc = page.getByRole("region", { name: `MC · ${LABEL}` });
  await expect(mc).toContainText("Extrato não importado: Bradesco · MC");
  await expect(mc.getByRole("button", { name: `Fechar ${LABEL}` })).toBeDisabled();

  // Resolve as duas linhas como exceção, com classificação
  await page.getByRole("tab", { name: /^Conferência/ }).click();
  for (const [description, reason, option] of [
    ["TARIFA MANUTENCAO CONTA", "Tarifa do banco", "Tarifa"],
    ["RENDIMENTO APLICACAO AUTOMATICA", "Rendimento da aplicação", "Outro"],
  ] as const) {
    await page.getByRole("button", { name: `Conciliar ${description}` }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("tab", { name: "Marcar exceção" }).click();
    await dialog.getByLabel("Motivo *").fill(reason);
    await dialog.getByRole("combobox", { name: "Classificação *" }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
    await dialog.getByRole("button", { name: "Marcar exceção" }).last().click();
    await expect(page.getByRole("row", { name: new RegExp(description) })).toContainText(`Exceção: ${reason}`);
  }

  // Agora a PPlus está pronta: o extrato × sistema ainda mostra a saída como exceção
  await page.getByRole("tab", { name: "Extrato × sistema" }).click();
  await expect(page.getByRole("list", { name: "O que explica a diferença" })).toContainText("(exceção)");

  await page.getByRole("tab", { name: "Fechamento" }).click();
  await expect(pplus).toContainText("Todas conferidas");
  await expect(pplus).toContainText("Todas classificadas");
  await expect(pplus.getByRole("button", { name: `Fechar ${LABEL}` })).toBeEnabled();

  // A planilha da contabilidade sai a qualquer hora: um Excel de verdade, com o nome da empresa e do mês
  const [sheet] = await Promise.all([
    page.waitForEvent("download"),
    pplus.getByRole("button", { name: "Planilha da contabilidade" }).click(),
  ]);
  expect(sheet.suggestedFilename()).toBe(`conciliacao-pplus-${PREVIOUS}.xlsx`);
  expect(readFileSync(await sheet.path()).subarray(0, 2).toString()).toBe("PK");

  // ---- Fechar o mês ----
  await pplus.getByRole("button", { name: `Fechar ${LABEL}` }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText(`Depois de fechado, ninguém lança, baixa ou estorna com data de ${LABEL} na PPlus`);
  await confirm.getByRole("button", { name: "Fechar o mês" }).click();
  await expect(page.getByText(/fechado\. Baixe a planilha para a contabilidade/)).toBeVisible();
  await expect(pplus.getByText("Fechado", { exact: true })).toBeVisible();
  await expect(pplus.getByRole("button", { name: "Reabrir (administrador)" })).toBeVisible();
  const closed = page.getByRole("region", { name: "Meses fechados" });
  await expect(closed.getByRole("row", { name: /PPlus/ })).toContainText(LABEL);

  // ---- A trava: com o mês fechado, a linha dele não se desfaz ----
  await page.getByRole("tab", { name: /^Conferência/ }).click();
  await page.getByRole("button", { name: "Desfazer a conciliação de TARIFA MANUTENCAO CONTA" }).click();
  await page.getByRole("dialog").getByLabel("Motivo *").fill("Quero desfazer");
  await page.getByRole("dialog").getByRole("button", { name: "Desfazer", exact: true }).click();
  await expect(page.getByRole("dialog").getByText(/O período de .* está fechado\. Só um administrador pode reabrir/)).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Voltar" }).click();

  // ---- Reabrir: só o administrador, com motivo ----
  await page.getByRole("tab", { name: "Fechamento" }).click();
  await pplus.getByRole("button", { name: "Reabrir (administrador)" }).click();
  const reopen = page.getByRole("dialog");
  await reopen.getByRole("button", { name: "Reabrir", exact: true }).click();
  await expect(reopen.getByText("Diga o motivo.")).toBeVisible();
  await reopen.getByLabel("Motivo *").fill("Nota fiscal chegou depois");
  await reopen.getByRole("button", { name: "Reabrir", exact: true }).click();
  await expect(page.getByText(`${LABEL} reaberto.`)).toBeVisible();
  await expect(pplus.getByText("Aberto")).toBeVisible();
  await expect(page.getByRole("region", { name: "Meses fechados" })).toContainText("Nenhum mês fechado ainda.");
});
