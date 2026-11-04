import { expect, test, type Page } from "@playwright/test";
import { addDays } from "../src/lib/payables";
import { signIn } from "./fixtures";

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("dialog").getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
}

test("do Início ao Contas a pagar: abrir itens, dar baixa e lançar conta", async ({ page }) => {
  const blocked: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) blocked.push(message.text());
  });

  await signIn(page, "contas@e2e.invalid");

  // Início: resumo com o que vem do banco, sem inventar o que ainda não existe
  await expect(page.getByText("R$ 389,90").first()).toBeVisible();
  await expect(page.getByText("Vence hoje: Passagens de ônibus · campo")).toBeVisible();
  await expect(page.getByText("Chega com Contas a receber")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Próximos vencimentos" })).toBeVisible();
  const badge = page.getByRole("link", { name: /Contas a pagar/ }).getByTitle(/pendências/);
  await expect(badge).toHaveText("6");

  await page.getByRole("link", { name: /Contas a pagar/ }).click();
  await expect(page.getByRole("heading", { name: "Contas a pagar" })).toBeVisible();

  // Abre nas contas do dia
  const total = page.getByRole("button", { name: /^Total/ });
  await expect(total).toContainText("R$ 6.310,00");
  await expect(total).toContainText("5 contas");
  await expect(page.getByRole("tab", { name: /Do Connect/ })).toContainText("1");

  // Lançamento agrupado abre as pessoas na própria linha
  await page.getByRole("row", { name: /4 entrevistadores/ }).getByRole("button", { name: "Mostrar os itens" }).click();
  await expect(page.getByText("Sandra Ribeiro (exemplo)")).toBeVisible();
  await page.getByRole("button", { name: "Esconder os itens" }).click();
  const incentives = page.getByRole("row", { name: /14 entrevistados/ });
  await incentives.getByRole("button", { name: "Mostrar os itens" }).click();
  await expect(page.getByText("14 pessoas · R$ 2.800,00")).toBeVisible();
  await page.getByLabel("Buscar pessoa").fill("Entrevistado 03");
  await expect(page.getByText("Entrevistado 03", { exact: true })).toBeVisible();
  await expect(page.getByText("Entrevistado 04", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Esconder os itens" }).click();

  // Provisão e Connect não têm baixa direta
  await expect(
    page.getByRole("row", { name: /Gráfica · PRJ-1804/ }).getByRole("button", { name: "Dar baixa" })
  ).toHaveCount(0);
  await expect(
    page.getByRole("row", { name: /4 entrevistadores/ }).getByRole("button", { name: "Dar baixa" })
  ).toHaveCount(0);

  // Baixa
  await page.getByRole("row", { name: /Passagens de ônibus/ }).getByRole("button", { name: "Dar baixa" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirmar baixa" }).click();
  await expect(page.getByText("Conta paga: Passagens de ônibus · campo.")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Pagos/ })).toContainText("R$ 320,00");
  await expect(badge).toHaveText("5");

  // Histórico guarda a baixa, e o estorno devolve o valor
  await page.getByRole("row", { name: /Passagens de ônibus/ }).getByRole("button", { name: "Ver detalhes" }).click();
  await page.getByRole("tab", { name: /Baixas/ }).click();
  await page.getByRole("button", { name: "Estornar" }).click();
  await page.getByLabel("Motivo").fill("Conta errada");
  await page.getByRole("dialog").getByRole("button", { name: "Estornar" }).last().click();
  await expect(page.getByText(/Feito\. Pendente agora: R\$\s320,00\./)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: /^Pagos/ })).toContainText("R$ 0,00");

  // Lançar conta nova, que já aparece no dia
  await page.getByRole("button", { name: "Nova conta a pagar" }).click();
  const form = page.getByRole("dialog");
  await form.getByRole("button", { name: "Lançar conta" }).click();
  await expect(form.getByText("Informe um valor maior que zero.")).toBeVisible();
  const today = await form.getByLabel("Data *").inputValue();
  await form.getByLabel("Vencimento *").fill(today);
  await form.getByLabel("Valor (R$) *").fill("1.000,50");
  await choose(page, "Fornecedor *", /Exata/);
  await choose(page, "Categoria *", /Serviços de terceiros/);
  await form.getByLabel("Descrição *").fill("Consultoria de teste");
  await choose(page, "Empresa *", "PPlus");
  await choose(page, "Unidade *", "Consumo SP");
  await choose(page, "Centro de custo *", "Administrativo");
  await choose(page, "Forma de pagamento *", "Pix");
  await form.getByLabel("Dividir entre projetos (opcional)").fill("1804;1.000,00");
  await form.getByRole("button", { name: "Lançar conta" }).click();
  await expect(form.getByText(/somam R\$\s1\.000,00.*R\$\s1\.000,50/)).toBeVisible();
  await form.getByLabel("Dividir entre projetos (opcional)").fill("1804;500,50\n1790;500,00");
  await form.getByRole("button", { name: "Lançar conta" }).click();
  await expect(page.getByRole("row", { name: /Consultoria de teste/ })).toContainText("PRJ-1804, PRJ-1790");
  await expect(total).toContainText("6 contas");

  // Busca e filtro combinados
  await page.getByLabel("Buscar conta, fornecedor ou NF").fill("consultoria");
  await expect(total).toContainText("1 conta");
  await page.getByRole("button", { name: /Limpar filtros/ }).click();
  await expect(total).toContainText("6 contas");

  // O período troca sem sair da tela
  await page.getByRole("combobox", { name: "Visão por período" }).click();
  await page.getByRole("option", { name: "Tudo" }).click();
  await expect(page.getByRole("button", { name: /^Vencidos/ })).toContainText("R$ 389,90");

  // Trocar de página limpa a seleção: o lote só age no que está à vista
  await page.getByRole("checkbox", { name: "Selecionar Telefonia e internet" }).check();
  await expect(page.getByText("1 selecionada")).toBeVisible();
  await page.getByRole("button", { name: "Próxima página" }).click();
  await expect(page.getByText("1 selecionada")).toHaveCount(0);
  await page.getByRole("button", { name: "Página anterior" }).click();

  // Baixa em lote
  await page.getByRole("checkbox", { name: "Selecionar Honorários contábeis" }).check();
  await page.getByRole("checkbox", { name: "Selecionar Licenças de software" }).check();
  await page.getByRole("button", { name: "Dar baixa" }).first().click();
  await expect(page.getByRole("dialog")).toContainText("2 contas");
  await choose(page, "Forma", "Pix");
  await page.getByRole("dialog").getByRole("button", { name: "Baixar 2 contas" }).click();
  await expect(page.getByText(/Baixa feita em 2 contas/)).toBeVisible();

  // Excluir conta com baixa é recusado
  await page.getByRole("checkbox", { name: "Selecionar Honorários contábeis" }).check();
  await page.getByRole("button", { name: "Excluir" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByRole("dialog").getByText(/estorne antes de excluir/)).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Voltar" }).click();
  await page.getByRole("checkbox", { name: "Selecionar Honorários contábeis" }).uncheck();

  // Conta cancelada continua consultável
  await page.getByRole("row", { name: /Aluguel da sala/ }).getByRole("button", { name: "Ver detalhes" }).click();
  await page.getByRole("button", { name: "Cancelar conta" }).click();
  await page.getByLabel("Motivo").fill("Lançada por engano");
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar conta" }).last().click();
  await expect(page.getByText("Conta cancelada.")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Canceladas/ }).click();
  await expect(page.getByRole("row", { name: /Aluguel da sala/ })).toContainText("Cancelada");

  // O calendário escolhe um intervalo entre duas datas
  const dates = page.getByRole("button", { name: /^Escolher datas/ });
  const day = (iso: string) => page.locator(`[data-day="${iso}"] button`).first();
  await page.getByRole("button", { name: /^Total/ }).click();
  await dates.click();
  await day(today).click();
  await expect(page.getByText(/clique na data final/)).toBeVisible();
  await day(addDays(today, 2)).click();
  // O intervalo já vale no segundo clique
  await expect(dates).toContainText(" até ");
  await expect(page.getByRole("combobox", { name: "Visão por período" })).toContainText("Período");
  await expect(page.getByRole("row", { name: /Honorários contábeis/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Hospedagem da equipe/ })).toHaveCount(0);

  // Para um dia só, há um botão próprio
  await dates.click();
  await day(addDays(today, 2)).click();
  await page.getByRole("button", { name: "Só este dia" }).click();
  await expect(page.getByRole("combobox", { name: "Visão por período" })).toContainText("Dia");
  await expect(total).toContainText("1 conta");
  await page.getByRole("button", { name: "Hoje", exact: true }).click();

  // O menu recolhe, continua navegável e lembra da escolha
  await page.getByRole("button", { name: "Recolher menu" }).click();
  await expect(page.getByText("Visão geral")).toBeHidden();
  await page.reload();
  await expect(page.getByRole("button", { name: "Expandir menu" })).toBeVisible();
  await page.getByRole("link", { name: "Início" }).click();
  await expect(page.getByRole("heading", { name: /^(Bom dia|Boa tarde|Boa noite), / })).toBeVisible();
  await page.getByRole("button", { name: "Expandir menu" }).click();
  await expect(page.getByText("Visão geral")).toBeVisible();

  expect(blocked).toEqual([]);
});
