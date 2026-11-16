import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

// Campo de valor: o ponto e a vírgula entram sozinhos (digitar 123456 mostra 1.234,56).
test("campo de valor: a máscara põe o ponto e a vírgula ao digitar, apagar e colar, e o valor sai certo", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page, "mascara@e2e.invalid");
  await page.getByRole("link", { name: /Contas a pagar/ }).click();
  await page.getByRole("button", { name: "Nova conta a pagar" }).click();
  const form = page.getByRole("dialog");
  const amount = form.getByLabel("Valor principal (R$) *");

  // Digitar: os números entram pela direita
  await amount.click();
  await amount.pressSequentially("5");
  await expect(amount).toHaveValue("0,05");
  await amount.pressSequentially("26000");
  await expect(amount).toHaveValue("5.260,00");
  await amount.press("Control+A");
  await amount.pressSequentially("123456");
  await expect(amount).toHaveValue("1.234,56");

  // Apagar tira o último centavo, e apagando tudo o campo esvazia
  await amount.press("Backspace");
  await expect(amount).toHaveValue("123,45");
  for (let step = 0; step < 5; step += 1) await amount.press("Backspace");
  await expect(amount).toHaveValue("");

  // Entrar no campo seleciona o valor: o primeiro número troca o que estava
  await amount.pressSequentially("26000");
  await expect(amount).toHaveValue("260,00");
  await form.getByLabel("Descrição *").click();
  await amount.focus();
  await amount.pressSequentially("1");
  await expect(amount).toHaveValue("0,01");

  // Colar um valor inteiro mantém o valor copiado (e não vira centavos)
  for (const [copied, shown] of [
    ["1500.5", "1.500,50"],
    ["R$ 1.234,56", "1.234,56"],
    ["1234,5", "1.234,50"],
  ]) {
    await page.evaluate((text) => navigator.clipboard.writeText(text), copied);
    await amount.press("Control+A");
    await amount.press("Control+V");
    await expect(amount, `colou ${copied}`).toHaveValue(shown);
  }

  // Letras e símbolos não entram; passou de 12 números, a tecla é ignorada e o valor não é cortado
  await amount.press("Control+A");
  await amount.pressSequentially("1a2b,c3");
  await expect(amount).toHaveValue("1,23");
  await amount.press("Control+A");
  await amount.pressSequentially("9".repeat(14));
  await expect(amount).toHaveValue("9.999.999.999,99");

  // O valor da máscara é o que a tela lê: o líquido mostra o mesmo número
  await amount.press("Control+A");
  await amount.pressSequentially("26000");
  await expect(form.getByLabel("Valor líquido")).toHaveValue(/^R\$\s260,00$/); // o espaço depois do R$ é o não separável de brl()
});
