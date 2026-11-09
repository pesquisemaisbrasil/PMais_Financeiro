import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { addDays } from "../src/lib/payables";
import { box, signIn } from "./fixtures";

async function choose(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("dialog").getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
}

/** Campo de várias opções: marca (ou desmarca) uma e fecha a lista com Esc. */
async function mark(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("dialog").getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
  await page.keyboard.press("Escape");
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
  // O grupo de lançamentos fica dentro de Filtros, com a contagem de cada um
  await page.getByRole("button", { name: /^Filtros/ }).click();
  await page.getByRole("combobox", { name: "Grupo de lançamentos" }).click();
  await expect(page.getByRole("option", { name: /Do Connect/ })).toContainText("(1)");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Ver \d+ contas?$/ }).click();

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
  // Os valores vêm primeiro, alinhados à esquerda como os outros campos; depois, a divisão entre projetos
  // (com o "Colar várias linhas"); e só então "Repetir esta conta"
  const payment = await box(form.getByRole("combobox", { name: "Forma de pagamento *" }));
  const grossField = await box(form.getByLabel("Valor principal (R$) *"));
  const netField = await box(form.getByLabel("Valor líquido"));
  const paste = await box(form.getByText("Colar várias linhas da planilha"));
  const repeat = await box(form.getByLabel("Repetir esta conta"));
  // A descrição vem logo abaixo do valor líquido, numa caixa de várias linhas, antes da divisão entre projetos
  const description = await box(form.getByLabel("Descrição *"));
  expect(description.y).toBeGreaterThan(netField.y + netField.height);
  expect(description.height).toBeGreaterThan(80);
  expect(paste.y).toBeGreaterThan(description.y + description.height);
  expect(Math.abs(grossField.x - payment.x)).toBeLessThan(2);
  expect(paste.y).toBeGreaterThan(netField.y + netField.height);
  expect(repeat.y).toBeGreaterThan(paste.y + paste.height);
  await form.getByRole("button", { name: "Lançar conta" }).click();
  await expect(form.getByText("Informe um valor maior que zero.")).toBeVisible();
  const today = await form.getByLabel("Programação *").inputValue();
  await form.getByLabel("Vencimento *").fill(today);
  await form.getByLabel("Valor principal (R$) *").fill("1.000,50");
  await choose(page, "Fornecedor *", /Exata/);
  await choose(page, "Categoria *", /Serviços de terceiros/);
  await form.getByLabel("Descrição *").fill("Consultoria de teste");
  await choose(page, "Empresa *", "PPlus");
  await choose(page, "Unidade *", "Consumo SP");
  await choose(page, "Centro de custo *", "Administrativo");
  // Forma de pagamento e Projeto têm busca, mesmo com poucas opções
  await form.getByRole("combobox", { name: "Forma de pagamento *" }).click();
  await page.getByLabel("Buscar na lista").fill("pi");
  await expect(page.getByRole("option", { name: "Boleto" })).toHaveCount(0);
  await page.getByRole("option", { name: "Pix" }).click();
  await form.getByRole("combobox", { name: "Projeto", exact: true }).click();
  await page.getByLabel("Buscar na lista").fill("1790");
  await expect(page.getByRole("option", { name: /PRJ-1790/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /PRJ-1804/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  // Dividir entre projetos nos campos, sem digitar separador: a tela diz quanto falta
  await form.getByRole("button", { name: "Adicionar projeto" }).click();
  await form.getByRole("combobox", { name: "Projeto da linha 1" }).click();
  await page.getByRole("option", { name: /PRJ-1804/ }).click();
  await form.getByLabel("Valor da linha 1 (R$)").fill("1.000,00");
  await expect(form.getByText(/Faltam R\$\s0,50 para fechar\./)).toBeVisible();
  await form.getByRole("button", { name: "Lançar conta" }).click();
  await expect(form.getByText(/somam R\$\s1\.000,00.*R\$\s1\.000,50/)).toBeVisible();
  // Colar da planilha com espaço (ou tabulação) vira os campos, para conferir antes de lançar
  await form.getByText("Colar várias linhas da planilha").click();
  await form.getByLabel("Linhas coladas da planilha").fill("1804 500,50\n1790 500,00");
  await form.getByRole("button", { name: "Passar para os campos" }).click();
  await expect(form.getByLabel("Valor da linha 2 (R$)")).toHaveValue("500,00");
  await expect(form.getByText(/A divisão fecha com o valor da conta/)).toBeVisible();
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

  // Exportar traz o que os filtros mostram, em CSV ou em Excel
  await page.getByRole("button", { name: "Exportar" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /CSV/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^contas-a-pagar-.*\.csv$/);
  const csv = await readFile(await download.path(), "utf-8");
  expect(csv).toContain("Vencimento;Fornecedor;");
  expect(csv).toContain("Consultoria de teste");
  await page.getByRole("button", { name: "Exportar" }).click();
  const [excel] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /Excel/ }).click(),
  ]);
  expect(excel.suggestedFilename()).toMatch(/^contas-a-pagar-.*\.xlsx$/);
  // .xlsx é um zip: começa com "PK", e o texto da conta está lá dentro
  const excelFile = await readFile(await excel.path());
  expect(excelFile.subarray(0, 2).toString("latin1")).toBe("PK");
  expect(excelFile.length).toBeGreaterThan(2000);

  // Clicar na conta abre os detalhes, onde dá para editar e ver as baixas
  await page.getByRole("row", { name: /Consultoria de teste/ }).getByText("Consultoria de teste").first().click();
  const opened = page.getByRole("dialog");
  await expect(opened.getByRole("tab", { name: /Baixas/ })).toBeVisible();
  await expect(opened.getByText("Incluído em:")).toBeVisible(); // Detalhes em blocos, como no sistema antigo
  await expect(opened.getByText("Valor líquido:")).toBeVisible();
  // O resumo (valor, pago e pendente) fica acima das abas
  await expect(opened.getByText("falta pagar")).toBeVisible();
  await expect(opened.getByText("0% pago", { exact: true })).toBeVisible();
  await opened.getByRole("button", { name: "Editar conta" }).click();
  // Na edição, os valores vêm depois da classificação e antes do documento
  const editPayment = await box(opened.getByRole("combobox", { name: "Forma de pagamento", exact: true }));
  const editGross = await box(opened.getByLabel("Valor principal (R$)", { exact: true }));
  const editDocument = await box(opened.getByRole("combobox", { name: "Documento", exact: true }));
  expect(editGross.y).toBeGreaterThan(editPayment.y);
  expect(editDocument.y).toBeGreaterThan(editGross.y);
  await opened.getByLabel("Observações").fill("Combinado por telefone");
  // Documentação que chegou menos de 3 dias antes do vencimento (a conta vence hoje) vira aviso na conta
  await opened.getByLabel("Documentação recebida em").fill(today);
  await opened.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Conta alterada.")).toBeVisible();
  await expect(opened.getByText("Documentação atrasada")).toBeVisible();
  await opened.getByRole("tab", { name: "Histórico" }).click();
  await expect(opened.getByText(/observações alteradas/)).toBeVisible();

  // Documentos: anexar, baixar o mesmo arquivo, recusar o que não é permitido e tirar com motivo
  await opened.getByRole("tab", { name: /Documentos/ }).click();
  await expect(opened.getByText("Nenhum documento anexado ainda.")).toBeVisible();
  const pdf = Buffer.from("%PDF-1.4\n%nota fiscal fictícia do teste\n");
  await opened.getByRole("combobox", { name: "Tipo do documento" }).click();
  await page.getByRole("option", { name: "Nota fiscal" }).click();
  await opened.getByLabel("Anexar documentos").setInputFiles([
    { name: "nota-fiscal.pdf", mimeType: "application/pdf", buffer: pdf },
    { name: "programa.exe", mimeType: "application/octet-stream", buffer: Buffer.from("MZ") },
    { name: "falso.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ isto não é um PDF") },
  ]);
  await expect(page.getByText("Documento anexado.")).toBeVisible();
  await expect(opened.getByRole("tab", { name: "Documentos (1)" })).toBeVisible();
  await expect(opened.getByRole("listitem").filter({ hasText: "nota-fiscal.pdf" })).toContainText("Nota fiscal");
  await expect(opened.getByText(/programa\.exe: envie PDF/)).toBeVisible(); // recusado na tela
  await expect(opened.getByText(/falso\.pdf: Envie PDF/)).toBeVisible(); // recusado pelo conteúdo, no servidor
  const [saved] = await Promise.all([
    page.waitForEvent("download"),
    opened.getByRole("button", { name: "Baixar nota-fiscal.pdf" }).click(),
  ]);
  expect(saved.suggestedFilename()).toBe("nota-fiscal.pdf");
  expect(await readFile(await saved.path())).toEqual(pdf);
  await opened.getByRole("tab", { name: "Histórico" }).click();
  await expect(opened.getByText("Documento baixado: nota-fiscal.pdf")).toBeVisible();
  // Renomear e mudar o tipo: o arquivo é o mesmo, a extensão não muda e a trilha guarda os dois
  await opened.getByRole("tab", { name: /Documentos/ }).click();
  await opened.getByRole("button", { name: "Renomear nota-fiscal.pdf" }).click();
  const rename = page.getByRole("dialog", { name: "Renomear documento" });
  await rename.getByLabel("Nome do documento").fill("NF 58 março");
  await rename.getByRole("combobox", { name: "Tipo" }).click();
  await page.getByRole("option", { name: "Boleto" }).click();
  await rename.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText("Documento atualizado.")).toBeVisible();
  await expect(opened.getByRole("listitem").filter({ hasText: "NF 58 março.pdf" })).toContainText("Boleto");
  await opened.getByRole("tab", { name: "Histórico" }).click();
  await expect(opened.getByText("Documento renomeado: nota-fiscal.pdf → NF 58 março.pdf")).toBeVisible();
  await expect(opened.getByText(/Tipo do documento mudou: NF 58 março\.pdf \(Nota fiscal → Boleto\)/)).toBeVisible();

  await opened.getByRole("tab", { name: /Documentos/ }).click();
  await opened.getByRole("button", { name: "Tirar NF 58 março.pdf da conta" }).click();
  await opened.getByLabel("Motivo").fill("Nota trocada");
  await opened.getByRole("button", { name: "Tirar documento", exact: true }).click();
  await expect(page.getByText("Documento tirado da conta.")).toBeVisible();
  await opened.getByRole("tab", { name: /Documentos/ }).click();
  await expect(opened.getByText("Nenhum documento anexado ainda.")).toBeVisible();
  await opened.getByRole("tab", { name: "Histórico" }).click();
  await expect(opened.getByText("Documento removido: NF 58 março.pdf — Nota trocada")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(opened).toHaveCount(0);

  // Reclassificar pede o que muda, e o projeto fica 100%
  await page.getByRole("checkbox", { name: "Selecionar Consultoria de teste" }).check();
  await page.getByRole("button", { name: "Reclassificar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reclassificar 1 conta" }).click();
  await expect(page.getByRole("dialog").getByText("Escolha o que vai mudar.")).toBeVisible();
  await choose(page, "Projeto", "PRJ-1790");
  await page.getByRole("dialog").getByRole("button", { name: "Reclassificar 1 conta" }).click();
  await expect(page.getByText("1 conta reclassificada.")).toBeVisible();
  const consultoria = page.getByRole("row", { name: /Consultoria de teste/ });
  await expect(consultoria).toContainText("PRJ-1790");
  await expect(consultoria).not.toContainText("PRJ-1804");

  // Duplicar leva a cópia para o mês seguinte
  await page.getByRole("checkbox", { name: "Selecionar Consultoria de teste" }).check();
  await page.getByRole("button", { name: "Duplicar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Duplicar" }).click();
  await expect(page.getByText("1 conta duplicada para o mês seguinte.")).toBeVisible();

  // A provisão dá lugar ao real, e o seletor de fornecedor tem busca
  const provision = page.getByRole("row", { name: /Gráfica · PRJ-1804/ });
  await provision.getByRole("button", { name: "Substituir pelo valor real" }).click();
  const replace = page.getByRole("dialog");
  await replace.getByRole("button", { name: "Substituir", exact: true }).click();
  await expect(replace.getByText("Informe o valor real.")).toBeVisible();
  await replace.getByLabel("Valor real (R$)").fill("1.500,00");
  await replace.getByRole("combobox", { name: "Fornecedor" }).click();
  await page.getByLabel("Buscar na lista").fill("exata");
  await page.getByRole("option", { name: /Exata/ }).click();
  await replace.getByRole("button", { name: "Substituir", exact: true }).click();
  await expect(page.getByText(/substituída pelo real de R\$\s1\.500,00/)).toBeVisible();
  await expect(provision).toContainText("substitui a provisão");
  await expect(provision.getByRole("button", { name: "Substituir pelo valor real" })).toHaveCount(0);

  // Os filtros novos mudam a lista, e limpar volta tudo
  await page.getByRole("button", { name: /^Filtros/ }).click();
  const panel = page.getByRole("dialog", { name: "Filtros" });
  await expect(panel.getByRole("combobox", { name: "Plano de contas" })).toBeVisible();
  await panel.getByRole("combobox", { name: "Tipo" }).click();
  await page.getByRole("option", { name: "Provisão" }).click();
  // Mais de uma opção no mesmo filtro: a lista fica aberta, e marcar "Conta real" junto traz tudo
  await page.getByRole("option", { name: "Conta real" }).click();
  await page.keyboard.press("Escape");
  await expect(panel.getByRole("combobox", { name: "Tipo" })).toContainText("Provisão, Conta real");
  // O painel cobre a tela: fecha para conferir a lista por trás dele
  await panel.getByRole("button", { name: /^Ver \d+ contas?$/ }).click();
  await expect(consultoria).toBeVisible();
  await page.getByRole("button", { name: /^Filtros/ }).click();
  await panel.getByRole("combobox", { name: "Tipo" }).click();
  await page.getByRole("option", { name: "Conta real" }).click();
  await page.keyboard.press("Escape");
  await expect(panel.getByRole("combobox", { name: "Tipo" })).toContainText("Provisão");
  // O painel cobre a tela: fecha para conferir a lista por trás dele
  await panel.getByRole("button", { name: /^Ver \d+ contas?$/ }).click();
  await expect(consultoria).toHaveCount(0);
  await page.getByRole("button", { name: /Limpar filtros/ }).click();
  await expect(consultoria).toBeVisible();

  expect(blocked).toEqual([]);
});

test("Importar planilha, colunas, cadastros, projetos e menu lateral", async ({ page }) => {
  const blocked: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy/i.test(message.text())) blocked.push(message.text());
  });

  // outra conta: o mesmo código do autenticador não vale duas vezes no mesmo período
  await signIn(page, "cadastros@e2e.invalid");
  await page.goto("/contas-a-pagar");

  // Importar planilha: confere antes, e cria um lançamento por data de pagamento
  const sheet = [
    "Nome;CPF;Chave Pix;Valor;Data da pesquisa",
    "Respondente A;000.000.000-00;pessoa-a@exemplo.invalid;120,00;22/10/2026",
    "Respondente B;000.000.000-00;pessoa-b@exemplo.invalid;80,00;26/10/2026",
    "Respondente C;000.000.000-00;pessoa-c@exemplo.invalid;R$ 400;26/10/2026",
  ].join("\r\n");
  await page.getByRole("button", { name: "Importar planilha" }).click();
  const importer = page.getByRole("dialog");
  await importer.getByRole("button", { name: "Ler planilha" }).click();
  await expect(importer.getByText("Escolha a planilha.")).toBeVisible();
  await mark(page, "Projeto", "PRJ-1790");
  await mark(page, "Categoria", /Serviços de terceiros/);
  await mark(page, "Forma de pagamento", "Pix");
  await mark(page, "Empresa", "PPlus");
  await mark(page, "Unidade", "Consumo SP");
  await mark(page, "Centro de custo", "Administrativo");
  await importer.getByLabel("Planilha *").setInputFiles({
    name: "incentivos-exemplo.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(sheet, "utf-8"),
  });
  await importer.getByRole("button", { name: "Ler planilha" }).click();
  // Projeto sem prazo não importa linha sem data de pagamento
  await expect(importer.getByText("Este projeto não tem incentivo ou prazo marcado")).toBeVisible();
  await importer.getByRole("button", { name: "Voltar" }).click();
  // A marcação continua: tira o 1790 e marca o 1804
  await mark(page, "Projeto", "PRJ-1790");
  await mark(page, "Projeto", "PRJ-1804");
  await importer.getByRole("button", { name: "Ler planilha" }).click();
  await expect(importer.getByText("Use só números no valor")).toBeVisible();
  await expect(importer).not.toContainText("pessoa-a@exemplo.invalid");
  await importer.getByRole("button", { name: "Criar 2 lançamentos com 2 itens" }).click();
  await expect(page.getByText(/2 lançamentos criados, 2 itens/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Filtros/ })).toContainText("1");
  await expect(page.getByRole("row", { name: /Incentivos \(1 pessoa\)/ })).toHaveCount(2);
  // Cada pessoa mostra o dia da pesquisa e como está de pagamento
  await page.getByRole("row", { name: /Incentivos \(1 pessoa\)/ }).first().getByRole("button", { name: "Mostrar os itens" }).click();
  await expect(page.getByRole("columnheader", { name: "Data da pesquisa" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "22/10/2026", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "A pagar", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Esconder os itens" }).click();

  // Colunas e densidade ficam lembradas depois de recarregar
  await page.getByRole("button", { name: "Colunas" }).click();
  await page.getByRole("radio", { name: "Compacta" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Aplicar" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Colunas" }).click();
  await expect(page.getByRole("radio", { name: "Compacta" })).toBeChecked();
  await page.keyboard.press("Escape");

  // Cadastros: fornecedor com CNPJ conferido, e cadastro em uso só é inativado
  await page.getByRole("button", { name: "Cadastros" }).click();
  await page.getByRole("link", { name: "Fornecedores" }).click();
  await expect(page.getByRole("heading", { name: "Cadastros" })).toBeVisible();
  await page.getByRole("button", { name: "Novo fornecedor" }).click();
  const supplier = page.getByRole("dialog");
  await supplier.getByLabel("Apelido *").fill("Teste Ltda");
  await supplier.getByLabel("Nome / razão social *").fill("Fornecedor de Teste Ltda");
  await supplier.getByLabel("CNPJ").fill("11.222.333/0001-82");
  await supplier.getByRole("button", { name: "Cadastrar" }).click();
  await expect(supplier.getByText("CNPJ inválido. Confira os dígitos")).toBeVisible();
  await supplier.getByLabel("CNPJ").fill("11.222.333/0001-81");
  await supplier.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByText("Cadastro criado.")).toBeVisible();
  await page.getByLabel("Buscar em fornecedores").fill("teste ltda");
  const created = page.getByRole("row", { name: /Teste Ltda/ });
  await expect(created).toContainText("11.222.333/0001-81");
  await created.getByRole("button", { name: /^Inativar/ }).click();
  await expect(created).toContainText("Inativo");
  await created.getByRole("button", { name: /^Excluir/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Excluir" }).click();
  await expect(created).toHaveCount(0);

  // O projeto vem do Connect: aqui só se marca o tipo e o incentivo
  await page.getByRole("link", { name: "Projetos" }).click();
  const project = page.getByRole("row", { name: /PRJ-1790/ });
  await expect(project).toContainText("Sem incentivo");
  await project.getByRole("button", { name: "Editar tipo e incentivo" }).click();
  await choose(page, "Tem incentivo?", "Sim");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByRole("dialog").getByText(/de 1 a 30/)).toBeVisible();
  await page.getByLabel("Prazo do incentivo (dias úteis)").fill("3");
  await page.getByRole("dialog").getByRole("button", { name: "Salvar" }).click();
  await expect(project).toContainText("Incentivo em 3 dias úteis");

  // O menu recolhe, continua navegável e lembra da escolha
  await page.getByRole("button", { name: "Recolher menu" }).click();
  await expect(page.getByRole("link", { name: "Fornecedores" })).toBeHidden();
  await page.reload();
  await expect(page.getByRole("button", { name: "Expandir menu" })).toBeVisible();
  await page.getByRole("link", { name: "Início" }).click();
  await expect(page.getByRole("heading", { name: /^(Bom dia|Boa tarde|Boa noite), / })).toBeVisible();
  await page.getByRole("button", { name: "Expandir menu" }).click();
  await expect(page.getByRole("link", { name: "Fornecedores" })).toBeVisible();

  expect(blocked).toEqual([]);
});

test("Importar planilha com vários projetos: todos os da planilha, ou só os marcados", async ({ page }) => {
  // outra conta: o mesmo código do autenticador não vale duas vezes no mesmo período
  await signIn(page, "importacao@e2e.invalid");
  await page.goto("/contas-a-pagar");
  const sheet = [
    "Nome;Valor;Data de pagamento;Projeto;Empresa;Unidade",
    "Respondente A;100,00;20/11/2026;1804;PPlus;Consumo SP",
    "Respondente B;50,00;20/11/2026;1790;MC;Matriz",
    "Respondente C;70,00;27/11/2026;PRJ-1804;PPlus;CATI Curitiba",
    "Respondente D;30,00;27/11/2026;9999;PPlus;Consumo SP",
  ].join("\r\n");
  await page.getByRole("button", { name: "Importar planilha" }).click();
  const importer = page.getByRole("dialog");
  // Empresa e unidade ficam em "Todas": a planilha diz as de cada linha
  await mark(page, "Categoria", /Serviços de terceiros/);
  await mark(page, "Forma de pagamento", "Pix");
  await mark(page, "Centro de custo", "Administrativo");
  await importer.getByLabel("Planilha *").setInputFiles({
    name: "incentivos-varios-projetos.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(sheet, "utf-8"),
  });

  // Sem marcar projeto, entram todos os projetos que a planilha trouxer
  await expect(importer.getByRole("combobox", { name: "Projeto" })).toContainText("Todos os projetos da planilha");
  await importer.getByRole("button", { name: "Ler planilha" }).click();
  await expect(importer.getByText("PRJ-1790, PRJ-1804")).toBeVisible();
  await expect(importer.getByText("Projeto 9999 não existe")).toBeVisible();
  // Cada combinação de projeto, empresa e unidade vira um lançamento, com a classificação à mostra
  await expect(importer.getByText("por classificação e data de pagamento")).toBeVisible();
  await expect(importer.getByText("MC · Matriz · Administrativo").first()).toBeVisible();
  await expect(importer.getByRole("button", { name: "Criar 3 lançamentos com 3 itens" })).toBeEnabled();

  // Marcando só o 1804 e a PPlus, a linha do 1790 (e da MC) fica de fora sem virar erro
  await importer.getByRole("button", { name: "Voltar" }).click();
  await mark(page, "Projeto", "PRJ-1804");
  await mark(page, "Empresa", "PPlus");
  await expect(importer.getByRole("combobox", { name: "Projeto" })).toContainText("PRJ-1804");
  await expect(importer.getByRole("combobox", { name: "Empresa" })).toContainText("PPlus");
  await importer.getByRole("button", { name: "Ler planilha" }).click();
  await expect(importer.getByText("Fora da seleção").first()).toBeVisible();
  await importer.getByRole("button", { name: "Criar 2 lançamentos com 2 itens" }).click();
  await expect(page.getByText(/2 lançamentos criados, 2 itens/)).toBeVisible();
  // O banco é compartilhado com os outros testes: confere só as datas desta planilha.
  // Em 20/11 entrou só a Respondente A (1804); a B (1790) ficou de fora.
  const created = page.getByRole("row", { name: /Incentivos \(1 pessoa\)/ });
  await expect(created.filter({ hasText: "20/11/2026" })).toHaveCount(1);
  await expect(created.filter({ hasText: "27/11/2026" })).toHaveCount(1);
});

test("Acréscimos, descontos e impostos: lançar pelos botões, ver o líquido e editar", async ({ page }) => {
  await signIn(page, "ajustes@e2e.invalid");
  await page.goto("/contas-a-pagar");
  await page.getByRole("combobox", { name: "Visão por período" }).click();
  await page.getByRole("option", { name: "Tudo" }).click();

  await page.getByRole("button", { name: "Nova conta a pagar" }).click();
  const form = page.getByRole("dialog");
  await form.getByLabel("Vencimento *").fill("2027-03-15");
  await form.getByLabel("Valor principal (R$) *").fill("1.000,00");
  await choose(page, "Fornecedor *", /Exata/);
  await choose(page, "Categoria *", /Serviços de terceiros/);
  await form.getByLabel("Descrição *").fill("Conta com ajustes");
  await choose(page, "Empresa *", "PPlus");
  await choose(page, "Unidade *", "Consumo SP");
  await choose(page, "Centro de custo *", "Administrativo");
  await choose(page, "Forma de pagamento *", "Pix");

  // Cada botão abre a lista de lançamentos do tipo, e o total fica só para leitura
  await expect(form.getByLabel("(+) Total de acréscimos")).toHaveValue(/0,00/);
  await form.getByRole("button", { name: "Acréscimos" }).click();
  const surcharges = page.getByRole("dialog", { name: "Acréscimos" });
  await surcharges.getByRole("button", { name: "Salvar acréscimos" }).click(); // lista vazia: nada a conferir
  await form.getByRole("button", { name: "Acréscimos" }).click();
  await surcharges.getByLabel("Descrição da linha 1").fill("Multa por atraso");
  await surcharges.getByLabel("Valor da linha 1").fill("abc");
  await surcharges.getByRole("button", { name: "Salvar acréscimos" }).click();
  await expect(surcharges.getByText('Informe o valor de "Multa por atraso", como 12,50.')).toBeVisible();
  await surcharges.getByLabel("Valor da linha 1").fill("20,00");
  await surcharges.getByRole("button", { name: "Adicionar linha" }).click();
  await surcharges.getByLabel("Descrição da linha 2").fill("Juros");
  await surcharges.getByLabel("Valor da linha 2").fill("5,00");
  await expect(surcharges.getByText(/Total:\s*R\$\s25,00/)).toBeVisible();
  await surcharges.getByRole("button", { name: "Salvar acréscimos" }).click();
  await expect(form.getByLabel("(+) Total de acréscimos")).toHaveValue(/25,00/);

  await form.getByRole("button", { name: "Descontos" }).click();
  const discounts = page.getByRole("dialog", { name: "Descontos" });
  await discounts.getByLabel("Descrição da linha 1").fill("Desconto combinado");
  await discounts.getByLabel("Valor da linha 1").fill("50,00");
  await discounts.getByRole("button", { name: "Salvar descontos" }).click();
  await form.getByRole("button", { name: "Impostos" }).click();
  const taxes = page.getByRole("dialog", { name: "Impostos" });
  await taxes.getByLabel("Descrição da linha 1").fill("ISS retido");
  await taxes.getByLabel("Valor da linha 1").fill("30,00");
  await taxes.getByRole("button", { name: "Salvar impostos" }).click();
  // 1.000,00 + 25,00 − 50,00 − 30,00
  await expect(form.getByLabel("Valor líquido")).toHaveValue(/945,00/);
  await form.getByRole("button", { name: "Lançar conta" }).click();

  // A lista mostra o líquido, e a conta aberta mostra o valor principal, os três totais e as linhas
  await page.getByLabel("Buscar conta, fornecedor ou NF").fill("Conta com ajustes");
  const row = page.getByRole("row", { name: /Conta com ajustes/ });
  await expect(row).toContainText(/R\$\s945,00/);
  await row.getByText("Conta com ajustes").first().click();
  const opened = page.getByRole("dialog");
  await expect(opened.getByText("Valor principal:")).toBeVisible();
  await expect(opened.getByText("Valor principal:").locator("xpath=following-sibling::dd[1]")).toContainText(/R\$\s1\.000,00/);
  await expect(opened.getByText("Valor líquido:").locator("xpath=following-sibling::dd[1]")).toContainText(/R\$\s945,00/);
  await expect(opened.getByText(/Multa por atraso R\$\s20,00 · Juros R\$\s5,00/)).toBeVisible();
  await expect(opened.getByText(/ISS retido R\$\s30,00/)).toBeVisible();

  // Editar abre com o valor principal (não o líquido) e as linhas já lançadas
  await opened.getByRole("button", { name: "Editar conta" }).click();
  await expect(opened.getByLabel("Valor principal (R$)")).toHaveValue("1000,00");
  await expect(opened.getByLabel("(−) Total de impostos")).toHaveValue(/30,00/);
  // Desconto que zera o valor é barrado na hora
  await opened.getByRole("button", { name: /Descontos/ }).click();
  const editDiscounts = page.getByRole("dialog", { name: "Descontos" });
  await editDiscounts.getByLabel("Valor da linha 1").fill("2.000,00");
  await editDiscounts.getByRole("button", { name: "Salvar descontos" }).click();
  await expect(opened.getByText(/valor líquido precisa ser maior que zero/).first()).toBeVisible();
  await opened.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(opened.getByText(/valor líquido precisa ser maior que zero/).first()).toBeVisible();
  // Volta o desconto e tira o imposto
  await opened.getByRole("button", { name: /Descontos/ }).click();
  await editDiscounts.getByLabel("Valor da linha 1").fill("50,00");
  await editDiscounts.getByRole("button", { name: "Salvar descontos" }).click();
  await opened.getByRole("button", { name: /Impostos/ }).click();
  const editTaxes = page.getByRole("dialog", { name: "Impostos" });
  await editTaxes.getByRole("button", { name: "Tirar a linha 1" }).click();
  await editTaxes.getByRole("button", { name: "Salvar impostos" }).click();
  await opened.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Conta alterada.")).toBeVisible();
  await opened.getByRole("tab", { name: "Histórico" }).click();
  await expect(opened.getByText("Alterada: impostos R$ 30,00 → R$ 0,00")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("row", { name: /Conta com ajustes/ })).toContainText(/R\$\s975,00/);

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
  await expect(page.getByRole("heading", { name: /^Contas a pagar · / })).toBeVisible();
  await expect(page.getByRole("row", { name: /Conta com ajustes.*975,00/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /^Total/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Contas a receber/ })).toBeHidden(); // o menu não sai no papel
  await page.emulateMedia({ media: "screen" });
  await expect(page.getByRole("heading", { name: /^Contas a pagar · / })).toBeHidden(); // e a folha some da tela
});
