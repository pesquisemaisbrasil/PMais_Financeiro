import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./fixtures";

// Pedidos dos testes com o financeiro de 16/11 (docs/transcricoes/2026-11-16-testes-em-conjunto-com-o-financeiro.md).

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("dialog").getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option }).click();
}

async function box(locator: ReturnType<Page["getByLabel"]>) {
  const found = await locator.boundingBox();
  if (!found) throw new Error("campo fora da tela");
  return found;
}

/** Lança uma conta simples, vencendo hoje, no PRJ-1804. */
async function launch(page: Page, description: string, amount: string) {
  await page.getByRole("button", { name: "Nova conta a pagar" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Vencimento *").fill(await form.getByLabel("Programação *").inputValue());
  await form.getByLabel("Valor principal (R$) *").fill(amount);
  await choose(page, "Fornecedor *", /Exata/);
  await choose(page, "Projeto *", /PRJ-1804/);
  await choose(page, "Forma de pagamento *", "Pix");
  await choose(page, "Plano de contas *", /Serviços de terceiros/);
  await form.getByLabel("Descrição *").fill(description);
  await form.getByRole("button", { name: "Lançar conta" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
}

test("projeto cadastrado no Financeiro: traz a unidade e o centro de custo, e a conta edita o projeto", async ({
  page,
}) => {
  await signIn(page, "pedidos-projeto@e2e.invalid");

  // Cadastros > Projetos: Novo projeto como na tela antiga, com código, nome, unidade, cliente e centro
  // de custo, todos obrigatórios (A22 e o pedido de 18/11)
  await page.goto("/cadastros?aba=projects");
  await page.getByRole("button", { name: "Novo projeto" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(dialog.getByText("Falta preencher: código, nome, unidade, cliente, centro de custo.")).toBeVisible();
  await dialog.getByLabel("Código *").fill("1804");
  await dialog.getByLabel("Nome *").fill("Número repetido");
  await choose(page, "Unidade *", /CATI Curitiba · PPlus/);
  await choose(page, "Cliente *", /Alfa · Alfa Pesquisas/);
  await choose(page, "Centro de custo *", /Tecnologia/);
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(dialog.getByText("Já existe o projeto PRJ-1804")).toBeVisible();
  await dialog.getByLabel("Código *").fill("1950");
  await dialog.getByLabel("Nome *").fill("Hábitos de teste");
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("PRJ-1950 cadastrado.")).toBeVisible();
  // a lista é como a do sistema antigo (24/11): agrupada por empresa e unidade, com o código sem "PRJ-"
  await expect(page.getByRole("columnheader")).toHaveText([
    "Código",
    "Projeto",
    "Cliente",
    "Empresa",
    "Unidade",
    "C.Custo",
    "Infos",
    "Ações",
  ]);
  const created = page.getByRole("row", { name: /Hábitos de teste/ });
  await expect(created.getByRole("cell")).toHaveText([
    "1950",
    "Hábitos de teste",
    "Alfa Pesquisas Ltda",
    "PPlus",
    "CATI Curitiba",
    "Tecnologia",
    "Ativo",
    "",
  ]);

  // Nova conta a pagar na ordem da tela antiga (18/11), um campo por linha: fornecedor, vencimento,
  // programação, valor, forma de pagamento, projeto, unidade, centro de custo, plano de contas e descrição
  await page.goto("/contas-a-pagar");
  await page.getByRole("button", { name: "Nova conta a pagar" }).click();
  const form = page.getByRole("dialog");
  const fields = [
    form.getByRole("combobox", { name: "Fornecedor *" }),
    form.getByLabel("Vencimento *"),
    form.getByLabel("Programação *"),
    form.getByLabel("Valor principal (R$) *"),
    form.getByRole("combobox", { name: "Forma de pagamento *" }),
    form.getByRole("combobox", { name: "Projeto *" }),
    form.getByRole("combobox", { name: "Unidade *" }),
    form.getByRole("combobox", { name: "Centro de custo *" }),
    form.getByRole("combobox", { name: "Plano de contas *" }),
    form.getByLabel("Descrição *"),
  ];
  const tops: number[] = [];
  for (const field of fields) tops.push((await box(field)).y);
  for (let i = 1; i < tops.length; i++) expect(tops[i]).toBeGreaterThan(tops[i - 1] + 10);

  // Escolher o projeto já preenche a unidade e o centro de custo dele (A2)
  await choose(page, "Projeto *", /PRJ-1950/);
  await expect(form.getByRole("combobox", { name: "Unidade *" })).toContainText("CATI Curitiba");
  await expect(form.getByRole("combobox", { name: "Centro de custo *" })).toContainText("Tecnologia");
  await form.getByLabel("Vencimento *").fill(await form.getByLabel("Programação *").inputValue());
  await form.getByLabel("Valor principal (R$) *").fill("321,00");
  await choose(page, "Fornecedor *", /Exata/);
  await choose(page, "Forma de pagamento *", "Pix");
  await choose(page, "Plano de contas *", /Serviços de terceiros/);
  await form.getByLabel("Descrição *").fill("Conta do projeto novo");
  await form.getByRole("button", { name: "Lançar conta" }).click();
  const row = page.getByRole("row", { name: /Conta do projeto novo/ });
  await expect(row).toContainText("PRJ-1950");

  // Editar a conta troca o projeto (A4): "se eu precisar editar, preciso que edite tudo"
  await row.getByText("Conta do projeto novo").first().click();
  const opened = page.getByRole("dialog");
  await opened.getByRole("tab", { name: "Editar conta" }).click();
  await choose(page, "Projeto", /PRJ-1790/);
  await opened.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Conta alterada.")).toBeVisible();
  await opened.getByRole("tab", { name: "Histórico" }).click();
  await expect(opened.getByText(/projeto PRJ-1950 → PRJ-1790/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(row).toContainText("PRJ-1790");

  // Editar o projeto (18/11): Inativo tira o projeto da Nova conta a pagar
  await page.goto("/cadastros?aba=projects");
  await page.getByRole("button", { name: "Editar PRJ-1950" }).click();
  const editing = page.getByRole("dialog");
  await expect(editing.getByRole("combobox", { name: "Cliente *" })).toContainText("Alfa");
  await choose(page, "Inativo", "Sim");
  await editing.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("PRJ-1950 atualizado.")).toBeVisible();
  await expect(page.getByRole("row", { name: /Hábitos de teste/ })).toContainText("Inativo");
  await page.goto("/contas-a-pagar");
  await page.getByRole("button", { name: "Nova conta a pagar" }).click();
  await page.getByRole("dialog").getByRole("combobox", { name: "Projeto *", exact: true }).click();
  await expect(page.getByRole("option", { name: /PRJ-1804/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /PRJ-1950/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");

  // Excluir: o projeto com conta lançada não sai (a saída é inativar); o sem conta sai
  await page.goto("/cadastros?aba=projects");
  await page.getByRole("button", { name: "Editar PRJ-1804" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText("Esse projeto tem lançamentos — inative em vez de excluir")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: "Editar PRJ-1950" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Excluir" }).click();
  await expect(page.getByText("PRJ-1950 excluído.")).toBeVisible();
  await expect(page.getByRole("row", { name: /Hábitos de teste/ })).toHaveCount(0);
});

test("lista: setas da data, calendário na tela, busca sem acento e por valor, clipe, anexo e reclassificação em lote", async ({
  page,
}) => {
  await signIn(page, "pedidos-lista@e2e.invalid");
  await page.goto("/contas-a-pagar");

  // As setas andam um dia de cada vez, sem abrir o calendário (A8)
  const picker = page.getByRole("button", { name: /^Escolher datas:/ });
  const todayLabel = await picker.innerText();
  await page.getByRole("button", { name: "Próximo dia" }).click();
  await expect(picker).not.toHaveText(todayLabel);
  await page.getByRole("button", { name: "Dia anterior" }).click();
  await expect(picker).toHaveText(todayLabel);

  // Numa tela baixa, o calendário cabe na tela: o botão Cancelar dele continua clicável (A9)
  await page.setViewportSize({ width: 1280, height: 560 });
  await picker.click();
  const cancel = page.getByRole("dialog").getByRole("button", { name: "Cancelar" });
  await cancel.scrollIntoViewIfNeeded();
  const where = await cancel.boundingBox();
  expect(where && where.y + where.height).toBeLessThanOrEqual(560);
  await cancel.click();
  await page.setViewportSize({ width: 1280, height: 900 });

  // Duas contas novas para o lote
  await launch(page, "Lote A dos pedidos", "111,11");
  await launch(page, "Lote B dos pedidos", "222,22");

  // Em Tudo não há setas
  await page.getByRole("combobox", { name: "Visão por período" }).click();
  await page.getByRole("option", { name: "Tudo" }).click();
  await expect(page.getByRole("button", { name: "Próximo dia" })).toHaveCount(0);

  // Busca sem acento e sem maiúscula, e pelo valor (A10, A11)
  const search = page.getByLabel("Buscar conta, fornecedor, NF, projeto ou valor");
  await search.fill("grafica prj-1804");
  await expect(page.getByRole("row", { name: /Gráfica · PRJ-1804/ })).toBeVisible();
  await search.fill("222,22");
  await expect(page.getByRole("row", { name: /Lote B dos pedidos/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Lote A dos pedidos/ })).toHaveCount(0);

  // O clipe fica cinza sem documento e abre a conta em Documentos (A15)
  await search.fill("lote dos pedidos");
  const lotA = page.getByRole("row", { name: /Lote A dos pedidos/ });
  const lotB = page.getByRole("row", { name: /Lote B dos pedidos/ });
  await lotA.getByRole("button", { name: "Anexar documento" }).click();
  await expect(page.getByRole("dialog").getByText("Nenhum documento anexado ainda.")).toBeVisible();
  // Anexou pela janela da conta: ao fechar, o clipe da linha já está azul, sem recarregar a tela (18/11)
  await page.getByRole("dialog").getByLabel("Anexar documentos").setInputFiles({
    name: "nota do lote A.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%nota fictícia do teste\n"),
  });
  await expect(page.getByText("Documento anexado.")).toBeVisible();
  await page.keyboard.press("Escape");
  const lotAClip = lotA.getByRole("button", { name: "Ver documentos (1)" });
  await expect(lotAClip).toBeVisible();
  await expect(lotAClip).toHaveClass(/text-brand-azul-deep/);

  // O mesmo arquivo nas duas contas de uma vez (A13)
  await page.getByRole("checkbox", { name: "Selecionar Lote A dos pedidos" }).check();
  await page.getByRole("checkbox", { name: "Selecionar Lote B dos pedidos" }).check();
  await page.getByRole("button", { name: "Anexar", exact: true }).click();
  const attach = page.getByRole("dialog");
  await attach.getByRole("button", { name: "Anexar em 2 contas" }).click();
  await expect(attach.getByText("Escolha o arquivo.")).toBeVisible();
  await attach.getByLabel("Arquivo *").setInputFiles({
    name: "comprovante do lote.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%comprovante fictício do teste\n"),
  });
  await attach.getByRole("button", { name: "Anexar em 2 contas" }).click();
  await expect(page.getByText("Documento anexado em 2 contas.")).toBeVisible();
  await expect(lotA.getByRole("button", { name: "Ver documentos (2)" })).toBeVisible();
  await expect(lotB.getByRole("button", { name: "Ver documentos (1)" })).toBeVisible();

  // Reclassificar muda também o vencimento e o valor das selecionadas (A12)
  await page.getByRole("checkbox", { name: "Selecionar Lote A dos pedidos" }).check();
  await page.getByRole("checkbox", { name: "Selecionar Lote B dos pedidos" }).check();
  await page.getByRole("button", { name: "Reclassificar" }).click();
  const reclassify = page.getByRole("dialog");
  await reclassify.getByLabel("Vencimento").fill("2031-04-07");
  await reclassify.getByLabel("Valor principal (R$)").fill("150,00");
  await reclassify.getByRole("button", { name: "Reclassificar 2 contas" }).click();
  await expect(page.getByText("2 contas reclassificadas.")).toBeVisible();
  await expect(lotA).toContainText("07/04/2031");
  await expect(lotA).toContainText(/R\$\s150,00/);
  await expect(lotB).toContainText(/R\$\s150,00/);

  // Conta por conta (18/11, como a "Edição em Lote" do sistema antigo): cada uma com os seus valores, e só a
  // linha marcada é salva (mexer na linha já marca)
  await page.getByRole("checkbox", { name: "Selecionar Lote A dos pedidos" }).check();
  await page.getByRole("checkbox", { name: "Selecionar Lote B dos pedidos" }).check();
  await page.getByRole("button", { name: "Reclassificar" }).click();
  const batch = page.getByRole("dialog");
  await batch.getByRole("tab", { name: "Conta por conta" }).click();
  await batch.getByLabel("Descrição de Lote A dos pedidos").fill("Lote A dos pedidos · revisado");
  await batch.getByLabel("Observação de Lote A dos pedidos").fill("Conferido com a nota");
  await batch.getByLabel("Competência de Lote A dos pedidos").fill("12/2031");
  await expect(batch.getByRole("checkbox", { name: "Salvar Lote A dos pedidos" })).toBeChecked();
  await expect(batch.getByRole("checkbox", { name: "Salvar Lote B dos pedidos" })).not.toBeChecked();
  await batch.getByRole("button", { name: "Salvar 1 conta" }).click();
  await expect(page.getByText("1 conta alterada.")).toBeVisible();
  await expect(page.getByRole("row", { name: /Lote A dos pedidos · revisado/ })).toBeVisible();

  // E o mesmo comprovante nas selecionadas, de dentro do Reclassificar (18/11)
  await page.getByRole("checkbox", { name: "Selecionar Lote A dos pedidos" }).check();
  await page.getByRole("checkbox", { name: "Selecionar Lote B dos pedidos" }).check();
  await page.getByRole("button", { name: "Reclassificar" }).click();
  const receipt = page.getByRole("dialog");
  await receipt.getByRole("tab", { name: "Anexar comprovante" }).click();
  await expect(receipt.getByRole("combobox", { name: "Tipo do documento" })).toContainText("Comprovante");
  await receipt.getByLabel("Arquivo *").setInputFiles({
    name: "comprovante do pagamento.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%outro comprovante fictício do teste\n"),
  });
  await receipt.getByRole("button", { name: "Anexar em 2 contas" }).click();
  // o aviso do anexo anterior pode ainda estar na tela: vale o mais recente
  await expect(page.getByText("Documento anexado em 2 contas.").last()).toBeVisible();
  await expect(lotA.getByRole("button", { name: "Ver documentos (3)" })).toBeVisible();
  await expect(lotB.getByRole("button", { name: "Ver documentos (2)" })).toBeVisible();

  // Canceladas: a lista explica o que é uma conta cancelada (A16)
  await search.fill("");
  await page.getByRole("button", { name: /^Canceladas/ }).click();
  await expect(page.getByText("Conta cancelada não vale: não entra nos totais e não é paga")).toBeVisible();

  // Relatório do projeto: a busca pelo número, em todos os projetos (A20)
  await page.goto("/relatorios/projeto");
  const reportSearch = page.getByLabel("Buscar projeto pelo número ou nome");
  await reportSearch.fill("1790");
  await expect(page.getByRole("link", { name: "Abrir o relatório de PRJ-1790" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Abrir o relatório de PRJ-1804" })).toHaveCount(0);
  await reportSearch.fill("projeto que não existe");
  await expect(page.getByText("Nenhum projeto com essa busca.")).toBeVisible();
});
