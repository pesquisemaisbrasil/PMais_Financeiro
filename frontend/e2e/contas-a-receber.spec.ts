import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { box, signIn } from "./fixtures";

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("dialog").getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
}

test("Contas a receber: indicadores, filtros, inadimplência, recebimento parcial e estorno", async ({ page }) => {
  await signIn(page, "receber@e2e.invalid");

  // O menu leva à tela, que abre no dia: o período muda para "Tudo"
  await page.getByRole("link", { name: /Contas a receber/ }).click();
  await expect(page.getByRole("heading", { name: "Contas a receber" })).toBeVisible();
  await page.getByRole("combobox", { name: "Visão por período" }).click();
  await page.getByRole("option", { name: "Tudo" }).click();

  // Líquido de cada título: 900 (1.000 menos 100 de imposto retido) + 500 + 700
  await expect(page.getByRole("button", { name: /^Total/ })).toContainText("R$ 2.100,00");
  await expect(page.getByRole("button", { name: /^Total/ })).toContainText("3 títulos");
  await expect(page.getByRole("button", { name: /^Vencidos/ })).toContainText("R$ 1.400,00");
  await expect(page.getByRole("button", { name: /^Vencidos/ })).toContainText("2 títulos");
  await expect(page.getByRole("button", { name: /^A vencer/ })).toContainText("R$ 700,00");

  // Clicar em Vencidos abre a lista já filtrada, com os dias de atraso
  await page.getByRole("button", { name: /^Vencidos/ }).click();
  await expect(page.getByRole("row", { name: /Satisfação · 1ª parcela/ })).toContainText("10 dias de atraso");
  await expect(page.getByRole("row", { name: /Satisfação · 1ª parcela/ })).toContainText("principal R$");
  await expect(page.getByRole("row", { name: /Tracking mensal/ })).toHaveCount(0);

  // Filtros combinados: cliente e situação
  await page.getByRole("button", { name: /^Total/ }).click();
  await page.getByRole("button", { name: /^Filtros/ }).click();
  await expect(page.getByRole("combobox", { name: "Plano de contas" })).toBeVisible();
  // A lista de opções fica aberta enquanto se marca: Esc fecha
  await page.getByRole("combobox", { name: "Cliente" }).click();
  await page.getByRole("option", { name: "Beta" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("combobox", { name: "Situação" }).click();
  await page.getByRole("option", { name: "Vencida" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByText("Nenhum título neste período e com estes filtros.")).toBeVisible();
  // Mais de uma opção no mesmo filtro: Beta ou Alfa, e só as vencidas
  await page.getByRole("combobox", { name: "Cliente" }).click();
  await page.getByRole("option", { name: "Alfa" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("combobox", { name: "Cliente" })).toContainText("Beta, Alfa");
  // O painel cobre a tela: fecha para conferir a lista por trás dele
  await page.getByRole("button", { name: /^Ver \d+ títulos?$/ }).click();
  await expect(page.getByRole("row", { name: /Satisfação · 1ª parcela/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Tracking mensal/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^Filtros/ }).click();
  // "Cancelada" não combina com as outras situações: marcá-la tira a "Vencida"
  await page.getByRole("combobox", { name: "Situação" }).click();
  await page.getByRole("option", { name: "Cancelada" }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("combobox", { name: "Situação" })).toContainText("Cancelada");
  await expect(page.getByRole("combobox", { name: "Situação" })).not.toContainText("Vencida");
  await page.getByRole("button", { name: "Limpar filtros", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("row", { name: /Tracking mensal/ })).toBeVisible();

  // Inadimplência por cliente
  await page.getByRole("button", { name: "Inadimplência" }).click();
  const delinquency = page.getByRole("dialog");
  await expect(delinquency).toContainText("Alfa Pesquisas Ltda");
  await expect(delinquency).toContainText("2 títulos vencidos");
  await expect(delinquency).toContainText("até 10 dias de atraso");
  await expect(delinquency).toContainText("R$ 1.400,00");
  await expect(delinquency).not.toContainText("Beta Consultoria");
  // Faixas de atraso: as duas parcelas (10 e 3 dias) caem na primeira, e as outras ficam zeradas
  const bands = delinquency.getByRole("group", { name: "Total por faixa de atraso" });
  await expect(bands.getByText("1 a 30 dias")).toBeVisible();
  await expect(bands).toContainText("2 títulos");
  await expect(bands).toContainText("Mais de 90 dias");
  await expect(bands).toContainText("0 títulos");
  await delinquency.getByRole("button", { name: "Fechar", exact: true }).first().click();

  // Recebimento parcial: o saldo continua e a situação vira Parcial
  const first = page.getByRole("row", { name: /Satisfação · 1ª parcela/ });
  await first.getByRole("button", { name: "Registrar recebimento" }).click();
  const receipt = page.getByRole("dialog");
  await receipt.getByLabel("Valor recebido (R$) *").fill("2000,00");
  await receipt.getByRole("button", { name: "Receber", exact: true }).click();
  await expect(receipt.getByText(/O valor recebido passa do saldo pendente/)).toBeVisible();
  await receipt.getByLabel("Valor recebido (R$) *").fill("400,00");
  await receipt.getByRole("button", { name: "Receber", exact: true }).click();
  await expect(page.getByText(/Recebimento parcial feito. Ainda faltam R\$\s500,00/)).toBeVisible();
  // vencido continua vencido enquanto falta receber; o recebido e o pendente mostram o parcial
  const partial = page.getByRole("row", { name: /Satisfação · 1ª parcela/ });
  await expect(partial).toContainText("Vencida");
  await expect(partial).toContainText("R$ 400,00");
  await expect(partial).toContainText("R$ 500,00");

  // Estorno devolve o valor ao pendente, e as duas linhas ficam no histórico
  await page.getByRole("row", { name: /Satisfação · 1ª parcela/ }).getByRole("button", { name: "Ver detalhes" }).click();
  const detail = page.getByRole("dialog");
  await detail.getByRole("tab", { name: /Recebimentos/ }).click();
  await detail.getByRole("button", { name: "Estornar" }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Estornar" }).click();
  await expect(page.getByText("Diga o motivo.")).toBeVisible();
  await page.getByLabel("Motivo *").fill("Pix devolvido pelo banco");
  await page.getByRole("dialog").last().getByRole("button", { name: "Estornar" }).click();
  await expect(detail.getByText("Estornado")).toBeVisible();
  await expect(detail.getByText("Estorno", { exact: true })).toBeVisible();
  await detail.getByRole("tab", { name: "Detalhes" }).click();
  await expect(detail.getByText("R$ 900,00").last()).toBeVisible();
});

test("Contas a receber: título novo exige o projeto e o cadastro de cliente existe", async ({ page }) => {
  // outra conta: o mesmo código do autenticador não vale duas vezes no mesmo período
  await signIn(page, "receber2@e2e.invalid");
  await page.goto("/contas-a-receber");
  await page.getByRole("button", { name: "Nova conta a receber" }).click();
  const form = page.getByRole("dialog");
  // Os valores vêm depois da classificação e antes do documento
  const costCenter = await box(form.getByRole("combobox", { name: "Centro de custo *" }));
  const grossField = await box(form.getByLabel("Valor principal (R$) *"));
  const documentField = await box(form.getByRole("combobox", { name: "Documento", exact: true }));
  expect(grossField.y).toBeGreaterThan(costCenter.y);
  expect(documentField.y).toBeGreaterThan(grossField.y);
  // A descrição vem logo abaixo do valor líquido, numa caixa de várias linhas, antes do documento
  const netField = await box(form.getByLabel("Valor líquido"));
  const description = await box(form.getByLabel("Descrição *"));
  expect(description.y).toBeGreaterThan(netField.y + netField.height);
  expect(description.height).toBeGreaterThan(80);
  expect(documentField.y).toBeGreaterThan(description.y + description.height);
  // O projeto tem busca, mesmo com poucas opções
  await form.getByRole("combobox", { name: "Projeto *" }).click();
  await expect(page.getByLabel("Buscar na lista")).toBeVisible();
  await page.keyboard.press("Escape");
  await form.getByLabel("Valor principal (R$) *").fill("1.000,00");
  // Os impostos retidos entram pelo botão: uma linha por lançamento, e o líquido aparece na hora
  await form.getByRole("button", { name: "Impostos" }).click();
  const taxes = page.getByRole("dialog", { name: "Impostos" });
  await taxes.getByLabel("Descrição da linha 1").fill("Retenção na nota");
  await taxes.getByLabel("Valor da linha 1").fill("115,00");
  await taxes.getByRole("button", { name: "Salvar impostos" }).click();
  await expect(form.getByLabel("Valor líquido")).toHaveValue(/885,00/);
  await form.getByRole("button", { name: "Lançar conta" }).click();
  await expect(form.getByText("Informe o projeto da receita.")).toBeVisible();

  await choose(page, "Cliente *", /Alfa/);
  await choose(page, "Projeto *", /PRJ-1804/);
  await choose(page, "Conta de receita *", /Receita de pesquisa/);
  await form.getByLabel("Descrição *").fill("Pesquisa de teste");
  await choose(page, "Empresa *", "PPlus");
  await choose(page, "Unidade *", "Consumo SP");
  await choose(page, "Centro de custo *", "Administrativo");
  await form.getByRole("button", { name: /Impostos/ }).click();
  await taxes.getByLabel("Valor da linha 1").fill("1.000,00");
  await taxes.getByRole("button", { name: "Salvar impostos" }).click();
  await form.getByRole("button", { name: "Lançar conta" }).click();
  await expect(form.getByText(/valor líquido precisa ser maior que zero/).first()).toBeVisible();
  await form.getByRole("button", { name: /Impostos/ }).click();
  await taxes.getByLabel("Valor da linha 1").fill("115,00");
  await taxes.getByRole("button", { name: "Salvar impostos" }).click();
  await form.getByRole("button", { name: "Lançar conta" }).click();
  await expect(page.getByText(/Conta lançada: R\$\s885,00/)).toBeVisible();

  // O cliente é um cadastro, com CNPJ e sem CPF
  await page.goto("/cadastros?aba=customers");
  await expect(page.getByRole("row", { name: /Alfa Pesquisas Ltda/ })).toContainText("11.222.333/0001-81");
});

test("Contas a receber: receita parcelada em 3, ajuste da tabela, alterar a série e exportar", async ({ page }) => {
  await signIn(page, "receber3@e2e.invalid");
  await page.goto("/contas-a-receber");
  await page.getByRole("button", { name: "Nova conta a receber" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Vencimento *").fill("2027-01-15");
  await form.getByLabel("Valor principal (R$) *").fill("1.000,00");
  await choose(page, "Cliente *", /Beta/);
  await choose(page, "Projeto *", /PRJ-1804/);
  await choose(page, "Conta de receita *", /Receita de pesquisa/);
  await form.getByLabel("Descrição *").fill("Receita parcelada de teste");
  await choose(page, "Empresa *", "PPlus");
  await choose(page, "Unidade *", "Consumo SP");
  await choose(page, "Centro de custo *", "Administrativo");

  // Parcelar exige conferir a tabela antes de salvar
  await form.getByLabel("Repetir esta conta").check();
  await choose(page, "Como se repete", /Parcelado/);
  await form.getByLabel("Quantas vezes").fill("3");
  await form.getByRole("button", { name: "Lançar conta" }).click();
  await expect(form.getByText("Clique em Simular para conferir as parcelas antes de salvar.")).toBeVisible();
  await form.getByRole("button", { name: "Simular" }).click();
  await expect(form.getByLabel("Valor da ocorrência 1")).toHaveValue("333.33");
  await expect(form.getByLabel("Valor da ocorrência 3")).toHaveValue("333.34");

  // Parcelas que não somam o título são recusadas, sem criar nada
  await form.getByLabel("Valor da ocorrência 1").fill("300.00");
  await form.getByRole("button", { name: "Lançar conta" }).click();
  await expect(form.getByText(/As parcelas somam R\$\s966,67, mas o título é de R\$\s1\.000,00/)).toBeVisible();

  // 30% na aprovação e o resto nas demais: a soma fecha com o título
  await form.getByLabel("Valor da ocorrência 1").fill("300.00");
  await form.getByLabel("Valor da ocorrência 2").fill("350.00");
  await form.getByLabel("Valor da ocorrência 3").fill("350.00");
  await form.getByRole("button", { name: "Lançar conta" }).click();
  await expect(page.getByText(/3 títulos lançados, o primeiro vence em 15\/01\/2027/)).toBeVisible();

  await page.getByRole("combobox", { name: "Visão por período" }).click();
  await page.getByRole("option", { name: "Tudo" }).click();
  await page.getByLabel("Buscar título, cliente ou contrato").fill("parcelada de teste");
  await expect(page.getByRole("row", { name: /Receita parcelada de teste/ })).toHaveCount(3);
  await expect(page.getByRole("row", { name: /1\/3/ })).toContainText("R$ 300,00");
  await expect(page.getByRole("row", { name: /3\/3/ })).toContainText("R$ 350,00");

  // Alterar "esta e as seguintes" a partir da 2ª
  await page.getByRole("row", { name: /2\/3/ }).getByRole("button", { name: "Alterar ou cancelar a série" }).click();
  const series = page.getByRole("dialog");
  await series.getByLabel("Esta e as seguintes").check();
  await series.getByLabel("Nova descrição").fill("Receita renegociada");
  await series.getByRole("button", { name: "Alterar títulos" }).click();
  await expect(page.getByText(/2 títulos alterados. O que já foi recebido não muda./)).toBeVisible();
  // a busca antiga não acha mais os alterados: busca pela palavra que as duas descrições têm
  await page.getByLabel("Buscar título, cliente ou contrato").fill("receita");
  await expect(page.getByRole("row", { name: /Receita parcelada de teste/ })).toHaveCount(1);
  await expect(page.getByRole("row", { name: /Receita renegociada/ })).toHaveCount(2);

  // O detalhe do título mostra o resumo e a série inteira na aba Repetir
  await page.getByRole("row", { name: /2\/3/ }).getByRole("button", { name: "Ver detalhes" }).click();
  const opened = page.getByRole("dialog");
  await expect(opened.getByText("falta receber")).toBeVisible();
  await expect(opened.getByText("0% recebido", { exact: true })).toBeVisible();
  await opened.getByRole("tab", { name: "Repetir (3)" }).click();
  await expect(opened.getByRole("row", { name: /2\/3.*Aberta aqui/ })).toBeVisible();
  await expect(opened.getByRole("row", { name: /1\/3.*R\$\s300,00/ })).toBeVisible();
  await expect(opened.getByRole("row", { name: /3\/3.*R\$\s350,00/ })).toBeVisible();
  // Abrir leva a outro título da série sem fechar a janela, e a aba continua a mesma
  await opened.getByRole("row", { name: /1\/3/ }).getByRole("button", { name: "Abrir" }).click();
  await expect(opened.getByRole("heading", { name: "Receita parcelada de teste" })).toBeVisible();
  await expect(opened.getByRole("row", { name: /1\/3.*Aberta aqui/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opened).toHaveCount(0);

  // Exportar leva os filtros e a busca na primeira linha
  await page.getByRole("button", { name: "Exportar" }).click();
  const downloading = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: /CSV/ }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^contas-a-receber-.*\.csv$/);
  const csv = await readFile((await download.path()) as string, "utf8");
  expect(csv).toContain("Contas a receber · todo o período por vencimento · Total");
  expect(csv).toContain("busca: receita");
  // uma linha por título dos três da série, e mais nenhum
  expect(csv.split("\r\n").filter((line) => /Receita (parcelada|renegociada)/.test(line)).length).toBe(3);

  // O mesmo em Excel: um arquivo .xlsx de verdade
  await page.getByRole("button", { name: "Exportar" }).click();
  const excelDownloading = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: /Excel/ }).click();
  const excel = await excelDownloading;
  expect(excel.suggestedFilename()).toMatch(/^contas-a-receber-.*\.xlsx$/);
  const book = await readFile((await excel.path()) as string);
  expect(book.subarray(0, 2).toString("latin1")).toBe("PK");
});

test("Contas a receber: acréscimos, descontos e impostos pelos botões e no detalhe", async ({ page }) => {
  await signIn(page, "ajustes-receber@e2e.invalid");
  await page.goto("/contas-a-receber");
  await page.getByRole("combobox", { name: "Visão por período" }).click();
  await page.getByRole("option", { name: "Tudo" }).click();
  await page.getByRole("button", { name: "Nova conta a receber" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Vencimento *").fill("2027-04-15");
  await form.getByLabel("Valor principal (R$) *").fill("2.000,00");
  await choose(page, "Cliente *", /Beta/);
  await choose(page, "Projeto *", /PRJ-1804/);
  await choose(page, "Conta de receita *", /Receita de pesquisa/);
  await form.getByLabel("Descrição *").fill("Receita com ajustes");
  await choose(page, "Empresa *", "PPlus");
  await choose(page, "Unidade *", "Consumo SP");
  await choose(page, "Centro de custo *", "Administrativo");

  await form.getByRole("button", { name: "Acréscimos" }).click();
  const surcharges = page.getByRole("dialog", { name: "Acréscimos" });
  await surcharges.getByLabel("Descrição da linha 1").fill("Correção monetária");
  await surcharges.getByLabel("Valor da linha 1").fill("40,00");
  await surcharges.getByRole("button", { name: "Salvar acréscimos" }).click();
  await form.getByRole("button", { name: "Descontos" }).click();
  const discounts = page.getByRole("dialog", { name: "Descontos" });
  await discounts.getByLabel("Descrição da linha 1").fill("Desconto comercial");
  await discounts.getByLabel("Valor da linha 1").fill("100,00");
  await discounts.getByRole("button", { name: "Salvar descontos" }).click();
  await form.getByRole("button", { name: "Impostos" }).click();
  const taxes = page.getByRole("dialog", { name: "Impostos" });
  await taxes.getByLabel("Descrição da linha 1").fill("IR retido");
  await taxes.getByLabel("Valor da linha 1").fill("60,00");
  await taxes.getByRole("button", { name: "Salvar impostos" }).click();
  // 2.000,00 + 40,00 − 100,00 − 60,00
  await expect(form.getByLabel("Valor líquido")).toHaveValue(/1\.880,00/);
  await form.getByRole("button", { name: "Lançar conta" }).click();

  await page.getByLabel("Buscar título, cliente ou contrato").fill("Receita com ajustes");
  const row = page.getByRole("row", { name: /Receita com ajustes/ });
  await expect(row).toContainText(/R\$\s1\.880,00/);
  await expect(row).toContainText("principal R$"); // a lista mostra o líquido e o valor principal embaixo
  await row.getByRole("button", { name: "Ver detalhes" }).click();
  const opened = page.getByRole("dialog");
  await expect(opened.getByText("(+) Acréscimos")).toBeVisible();
  await expect(opened.getByText("Correção monetária")).toBeVisible();
  await expect(opened.getByText("IR retido")).toBeVisible();
  // Uma linha de abas com cara de botão, na ordem pedida, abrindo em Detalhes e alinhada à esquerda
  await expect(opened.getByRole("tab")).toHaveText([
    "Detalhes",
    "Editar título",
    "Recebimentos (0)",
    "Documentos (0)",
    "Cancelar título",
    "Histórico",
  ]);
  await expect(opened.getByRole("tab", { name: "Detalhes" })).toHaveAttribute("aria-selected", "true");
  expect(await opened.getByText("Valor líquido:").evaluate((element) => getComputedStyle(element).textAlign)).toBe("left");
  await opened.getByRole("tab", { name: /Recebimentos/ }).click();
  await expect(opened.getByRole("button", { name: "Registrar recebimento" })).toBeVisible();

  // Documentos do título: anexar com o tipo, baixar, renomear e tirar com motivo, tudo no histórico
  await opened.getByRole("tab", { name: "Documentos (0)" }).click();
  await expect(opened.getByText("Nenhum documento anexado ainda.")).toBeVisible();
  const pdf = Buffer.from("%PDF-1.4\n%nota emitida fictícia do teste\n");
  await opened.getByRole("combobox", { name: "Tipo do documento" }).click();
  await page.getByRole("option", { name: "Nota fiscal" }).click();
  await opened.getByLabel("Anexar documentos").setInputFiles([
    { name: "nota-emitida.pdf", mimeType: "application/pdf", buffer: pdf },
    { name: "programa.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") },
  ]);
  await expect(page.getByText("Documento anexado.")).toBeVisible();
  await expect(opened.getByRole("tab", { name: "Documentos (1)" })).toBeVisible();
  await expect(opened.getByText(/programa\.exe: envie PDF/)).toBeVisible(); // recusado na tela
  await expect(opened.getByRole("listitem").filter({ hasText: "nota-emitida.pdf" })).toContainText("Nota fiscal");
  const [saved] = await Promise.all([
    page.waitForEvent("download"),
    opened.getByRole("button", { name: "Baixar nota-emitida.pdf" }).click(),
  ]);
  expect(saved.suggestedFilename()).toBe("nota-emitida.pdf");
  expect(await readFile((await saved.path()) as string)).toEqual(pdf);
  await opened.getByRole("button", { name: "Renomear nota-emitida.pdf" }).click();
  const rename = page.getByRole("dialog", { name: "Renomear documento" });
  await rename.getByLabel("Nome do documento").fill("NF 12 emitida");
  await rename.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Documento atualizado.")).toBeVisible();
  await opened.getByRole("button", { name: "Tirar NF 12 emitida.pdf do título" }).click();
  await page.getByRole("dialog", { name: /Tirar o documento/ }).getByLabel("Motivo *").fill("Nota trocada");
  await page.getByRole("dialog", { name: /Tirar o documento/ }).getByRole("button", { name: "Tirar documento" }).click();
  await expect(page.getByText("Documento tirado do título.")).toBeVisible();
  await expect(opened.getByRole("tab", { name: "Documentos (0)" })).toBeVisible();
  await opened.getByRole("tab", { name: "Histórico" }).click();
  await expect(opened.getByText("Documento incluído: nota-emitida.pdf")).toBeVisible();
  await expect(opened.getByText("Documento baixado: nota-emitida.pdf")).toBeVisible();
  await expect(opened.getByText("Documento renomeado: nota-emitida.pdf → NF 12 emitida.pdf")).toBeVisible();
  await expect(opened.getByText("Documento removido: NF 12 emitida.pdf — Nota trocada")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(opened).toHaveCount(0);

  // Imprimir resultados: busca tudo o que os filtros trazem e abre a impressão; na folha só sai o relatório
  await page.evaluate(() => {
    const flags = window as unknown as { printed?: number };
    window.print = () => {
      flags.printed = (flags.printed ?? 0) + 1;
    };
  });
  await page.getByRole("button", { name: "Imprimir resultados" }).click();
  await page.waitForFunction(() => (window as unknown as { printed?: number }).printed === 1);
  await page.emulateMedia({ media: "print" });
  await expect(page.getByRole("heading", { name: /^Contas a receber · / })).toBeVisible();
  await expect(page.getByRole("row", { name: /Receita com ajustes.*1\.880,00/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /^Total/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Contas a pagar/ })).toBeHidden(); // o menu não sai no papel
  await page.emulateMedia({ media: "screen" });
  await expect(page.getByRole("heading", { name: /^Contas a receber · / })).toBeHidden(); // e a folha some da tela

  // Editar e cancelar o título, de dentro das abas
  await page.getByRole("row", { name: /Receita com ajustes/ }).getByRole("button", { name: "Ver detalhes" }).click();
  await opened.getByRole("tab", { name: "Editar título" }).click();
  await opened.getByLabel("Descrição *").fill("Receita com ajustes (revisada)");
  await opened.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Título alterado.")).toBeVisible();
  await expect(opened.getByRole("heading", { name: "Receita com ajustes (revisada)" })).toBeVisible();
  await opened.getByRole("tab", { name: "Cancelar título" }).click();
  await opened.getByRole("button", { name: "Cancelar título" }).click();
  await expect(opened.getByText("Diga o motivo.")).toBeVisible();
  await opened.getByLabel("Motivo *").fill("Cliente desistiu");
  await opened.getByRole("button", { name: "Cancelar título" }).click();
  await expect(page.getByText("Título cancelado.")).toBeVisible();
  await expect(opened.getByRole("tab", { name: "Editar título" })).toHaveCount(0);
  await expect(opened.getByRole("tab", { name: "Cancelar título" })).toHaveCount(0);
});
