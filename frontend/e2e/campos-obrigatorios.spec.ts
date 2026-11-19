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
  await signIn(page, "campos@e2e.invalid");
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
  // Pelo texto: o vencimento padrão (hoje + 7 dias) pode cair num feriado, e aí o aviso de dia não útil
  // também é um alerta no diálogo.
  const alert = form.getByRole("alert").filter({ hasText: "Preencha os campos obrigatórios:" });
  await expect(alert).toBeVisible();
  // Os campos obrigatórios do sistema antigo, sem Empresa (ela vem da unidade) e com Unidade, e o projeto,
  // que toda conta tem (testes de 16/11). Na ordem da tela, que é a da tela antiga (18/11).
  await expect(alert).toContainText(
    "Fornecedor, Forma de pagamento, Projeto, Unidade, Centro de custo, Plano de contas e Descrição."
  );
  await expect(alert).not.toContainText("Empresa");
  await expect(alert).not.toContainText("campos com *");
  await expect(form.getByRole("combobox", { name: /Empresa/ })).toHaveCount(0);
});
