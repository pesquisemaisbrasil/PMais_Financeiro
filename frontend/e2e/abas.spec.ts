import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

// Abas de telas, como no VS Code (pedido do Bruno, 23/11/2026; regra em src/lib/tabs.ts): clique simples no menu
// troca a tela da aba atual, duplo clique abre outra aba (mesmo de uma tela já aberta, 26/11), e cada aba guarda o
// que a pessoa fez até ser fechada, também depois do F5 (reunião de 26/11/2026).

test("abas: dois cliques abrem outra aba, cada uma guarda a busca e o F5 reabre as abas", async ({ page }) => {
  await signIn(page, "abas@e2e.invalid");
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  const tabs = page.getByRole("navigation", { name: "Abas abertas" });
  const tab = (name: string) => tabs.getByRole("button", { name, exact: true });

  // Com uma tela só, a fileira de abas não aparece
  await expect(tabs).toHaveCount(0);

  // Clique simples: a tela da aba atual troca (o Início sai, e continua uma aba só)
  await menu.getByRole("link", { name: /^Contas a pagar/ }).click();
  await expect(page.getByRole("heading", { name: "Financeiro - Contas a pagar" })).toBeVisible();
  await expect(tabs).toHaveCount(0);
  const payablesSearch = page.getByLabel("Buscar conta, fornecedor, NF, projeto ou valor");
  await payablesSearch.fill("grafica");
  await expect(page.getByRole("row", { name: /Gráfica Ponto Certo/ }).first()).toBeVisible();

  // Duplo clique: Contas a receber numa aba nova, ao lado
  await menu.getByRole("link", { name: "Contas a receber" }).dblclick();
  await expect(page.getByRole("heading", { name: "Financeiro - Contas a receber" })).toBeVisible();
  await expect(page).toHaveURL(/\/contas-a-receber$/);
  await expect(tabs.getByRole("button", { name: /^(Contas a pagar|Contas a receber)$/ })).toHaveText([
    "Contas a pagar",
    "Contas a receber",
  ]);
  await expect(tab("Contas a receber")).toHaveAttribute("aria-current", "page");
  const receivablesSearch = page.getByLabel("Buscar título, cliente ou contrato");
  await receivablesSearch.fill("satisfacao");

  // Voltar para a outra aba: a busca e a lista estão como a pessoa deixou
  await tab("Contas a pagar").click();
  await expect(page).toHaveURL(/\/contas-a-pagar$/);
  await expect(page.getByRole("heading", { name: "Financeiro - Contas a pagar" })).toBeVisible();
  await expect(payablesSearch).toHaveValue("grafica");
  await expect(page.getByRole("row", { name: /Gráfica Ponto Certo/ }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Financeiro - Contas a receber" })).toBeHidden();
  await tab("Contas a receber").click();
  await expect(receivablesSearch).toHaveValue("satisfacao");

  // Janela aberta e pela metade em cada aba: a fileira continua clicável, trocar de aba não fecha a janela, e
  // ela volta com o que foi digitado (pedido do Bruno, 23/11)
  await page.getByRole("button", { name: "Nova conta a receber" }).click();
  const newReceivable = page.getByRole("dialog", { name: "Nova conta a receber" });
  await newReceivable.getByLabel("Contrato").fill("CT-ABAS-01");
  await tab("Contas a pagar").click();
  await expect(page.getByRole("heading", { name: "Financeiro - Contas a pagar" })).toBeVisible();
  await expect(newReceivable).toBeHidden();
  await page.getByRole("button", { name: "Nova conta a pagar" }).click();
  const newPayable = page.getByRole("dialog", { name: "Nova conta a pagar" });
  await newPayable.getByLabel("Descrição *").fill("Conta pela metade");
  await tab("Contas a receber").click();
  await expect(newReceivable).toBeVisible();
  await expect(newReceivable.getByLabel("Contrato")).toHaveValue("CT-ABAS-01");
  await expect(newPayable).toBeHidden();
  await tab("Contas a pagar").click();
  await expect(newPayable.getByLabel("Descrição *")).toHaveValue("Conta pela metade");
  // fechar a janela é com a pessoa: Esc fecha a da frente, e a da outra aba continua lá
  await page.keyboard.press("Escape");
  await expect(newPayable).toBeHidden();
  await tab("Contas a receber").click();
  await expect(newReceivable).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(newReceivable).toBeHidden();

  // Clicar no menu numa tela que já tem aba só vai para ela, sem abrir outra
  await menu.getByRole("link", { name: /^Contas a pagar/ }).click();
  await expect(tab("Contas a pagar")).toHaveAttribute("aria-current", "page");
  await expect(payablesSearch).toHaveValue("grafica");
  await expect(tabs.getByRole("button", { name: /^(Contas a pagar|Contas a receber)$/ })).toHaveCount(2);

  // Duplo clique numa tela já aberta abre outra aba dela, que começa do zero (reunião de 26/11: outubro numa aba e
  // novembro na outra). Com duas, cada uma mostra a posição: (1) e (2)
  await menu.getByRole("link", { name: /^Contas a pagar/ }).dblclick();
  await expect(tab("Contas a pagar (2)")).toHaveAttribute("aria-current", "page");
  await expect(tab("Contas a pagar (1)")).toBeVisible();
  await expect(page).toHaveURL(/\/contas-a-pagar\?copia=2$/);
  const shownSearch = page.getByLabel("Buscar conta, fornecedor, NF, projeto ou valor").filter({ visible: true });
  await expect(shownSearch).toHaveValue("");
  await shownSearch.fill("aluguel");
  await tab("Contas a pagar (1)").click();
  await expect(shownSearch).toHaveValue("grafica");

  // F5: as abas voltam, e cada tela volta como a pessoa deixou (reunião de 26/11: recarregar não volta para hoje)
  await page.reload();
  await expect(page.getByRole("heading", { name: "Financeiro - Contas a pagar" })).toBeVisible();
  await expect(tab("Contas a receber")).toBeVisible();
  await expect(shownSearch).toHaveValue("grafica");
  await tab("Contas a pagar (2)").click();
  await expect(shownSearch).toHaveValue("aluguel");
  await tab("Contas a receber").click();
  await expect(receivablesSearch).toHaveValue("satisfacao");

  // A pessoa escolhe qual fechar: fechada a (1), a outra fica e perde o número (Bruno, 27/11)
  await tabs.getByRole("button", { name: "Fechar a aba Contas a pagar (1)" }).click();
  await expect(tab("Contas a pagar (2)")).toHaveCount(0);
  await tab("Contas a pagar").click();
  await expect(tab("Contas a pagar")).toHaveAttribute("aria-current", "page");
  await expect(shownSearch).toHaveValue("aluguel");

  // Fechar a aba da frente: a vizinha vem para a frente; sobrando uma, a fileira some
  await tabs.getByRole("button", { name: "Fechar a aba Contas a pagar" }).click();
  await expect(page).toHaveURL(/\/contas-a-receber$/);
  await expect(page.getByRole("heading", { name: "Financeiro - Contas a receber" })).toBeVisible();
  await expect(tabs).toHaveCount(0);
  await expect(page.getByLabel("Buscar conta, fornecedor, NF, projeto ou valor")).toHaveCount(0);
});
