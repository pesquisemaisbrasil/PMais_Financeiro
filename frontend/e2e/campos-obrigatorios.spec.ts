import { expect, test, type Locator } from "@playwright/test";
import { signIn } from "./fixtures";

/** A cor do texto em RGB: o Chromium devolve a paleta do Tailwind em lab(), então converte pelo canvas. */
const rgb = (element: Locator) =>
  element.evaluate((node) => {
    const context = document.createElement("canvas").getContext("2d")!;
    context.fillStyle = getComputedStyle(node).color;
    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  });

// Campo obrigatório vazio: a mensagem diz quais são, e todo "*" (rótulos e legenda) aparece em vermelho.
test("campos obrigatórios: o * é vermelho e a mensagem diz quais campos faltam", async ({ page }) => {
  await signIn(page, "faixa@e2e.invalid");
  await page.getByRole("link", { name: /Contas a pagar/ }).click();
  await page.getByRole("button", { name: "Nova conta a pagar" }).click();
  const form = page.getByRole("dialog");

  // Cada * dos rótulos e da legenda ("Os campos com * são obrigatórios") é vermelho
  const stars = await form.getByText("*", { exact: true }).all();
  expect(stars.length).toBeGreaterThan(8);
  for (const star of stars) {
    const [red, green, blue] = await rgb(star);
    expect(red).toBeGreaterThan(180);
    expect(Math.max(green, blue)).toBeLessThan(80);
  }
  await expect(form.getByLabel("Descrição *")).toBeVisible(); // o rótulo continua com o mesmo nome

  // Sem preencher nada além do valor: a mensagem lista os campos que faltam, na ordem da tela
  await form.getByLabel("Valor principal (R$) *").fill("10,00");
  await form.getByRole("button", { name: "Lançar conta" }).click();
  const alert = form.getByRole("alert");
  await expect(alert).toContainText("Preencha os campos obrigatórios:");
  for (const name of ["Fornecedor", "Categoria", "Empresa", "Unidade", "Centro de custo", "Forma de pagamento", "Descrição"]) {
    await expect(alert).toContainText(name);
  }
  await expect(alert).not.toContainText("campos com *");
});
