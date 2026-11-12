import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./fixtures";

/** Campo de várias opções: marca (ou desmarca) uma e fecha a lista com Esc. */
async function mark(page: Page, label: string, option: string | RegExp) {
  await page.getByRole("dialog").getByRole("combobox", { name: label }).click();
  await page.getByRole("option", { name: option }).click();
  await page.keyboard.press("Escape");
}

// Datas de 2030, longe de tudo o que os outros testes usam: sábado 09/03, domingo 10/03 e quarta 13/03,
// que o teste cadastra como feriado da empresa. Os dois dias de fim de semana vão para a segunda, e a
// quarta, para a quinta.
const SATURDAY = "09/03/2030";
const SUNDAY = "10/03/2030";
const HOLIDAY = "2030-03-13";

test("feriados cadastrados e a agenda de incentivos: data da planilha em dia não útil vai para o próximo dia útil", async ({
  page,
}) => {
  await signIn(page, "agenda@e2e.invalid");

  // ---- Cadastros → Feriados ----
  await page.goto("/cadastros?aba=holidays");
  await expect(page.getByText(/Nenhum feriado cadastrado ainda/)).toBeVisible();

  // Buscar os nacionais (modo simulado, de um ano que já passou: não mexe nas datas dos outros testes)
  const lastYear = new Date().getFullYear() - 1;
  await page.getByRole("combobox", { name: "Ano dos feriados nacionais" }).click();
  await page.getByRole("option", { name: String(lastYear) }).click();
  await page.getByRole("button", { name: "Buscar nacionais do ano" }).click();
  await expect(page.getByText(new RegExp(`4 feriados novos em ${lastYear}`))).toBeVisible();
  await expect(page.getByRole("row", { name: /Carnaval/ })).toHaveCount(2);
  await expect(page.getByRole("row", { name: /Carnaval/ }).first()).toContainText("BrasilAPI");
  // Buscar de novo não repete
  await page.getByRole("button", { name: "Buscar nacionais do ano" }).click();
  await expect(page.getByText(/já estavam cadastrados/)).toBeVisible();

  // Cadastrar um feriado local: campo vazio diz quais faltam
  await page.getByRole("button", { name: "Novo feriado" }).click();
  const form = page.getByRole("dialog");
  await form.getByRole("button", { name: "Cadastrar feriado" }).click();
  await expect(form.getByText("Preencha os campos obrigatórios: Data, Nome, UF e Cidade.")).toBeVisible();
  await form.getByLabel("Data *").fill(HOLIDAY);
  await form.getByLabel("Nome *").fill("Recesso da empresa");
  await form.getByRole("combobox", { name: "UF *" }).click();
  await page.getByRole("option", { name: "SP", exact: true }).click();
  await form.getByLabel("Cidade *").fill("São Paulo");
  await form.getByRole("button", { name: "Cadastrar feriado" }).click();
  const recess = page.getByRole("row", { name: /Recesso da empresa/ });
  await expect(recess).toContainText("São Paulo/SP");
  await expect(recess).toContainText("quarta-feira");
  await expect(recess).toContainText("Cadastrado à mão");

  // O mesmo feriado de novo é recusado
  await page.getByRole("button", { name: "Novo feriado" }).click();
  await form.getByLabel("Data *").fill(HOLIDAY);
  await form.getByLabel("Nome *").fill("recesso DA empresa");
  await form.getByRole("combobox", { name: "UF *" }).click();
  await page.getByRole("option", { name: "SP", exact: true }).click();
  await form.getByLabel("Cidade *").fill("São Paulo");
  await form.getByRole("button", { name: "Cadastrar feriado" }).click();
  await expect(form.getByText("Esse feriado já está cadastrado")).toBeVisible();
  await form.getByRole("button", { name: "Voltar" }).click();

  // ---- Incentivos: importar a planilha, com data de pagamento em dia não útil ----
  const menu = page.getByRole("navigation", { name: "Menu principal" });
  await menu.getByRole("button", { name: "Relatórios" }).click();
  await menu.getByRole("link", { name: "Incentivos", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Incentivos", exact: true })).toBeVisible();
  // Os incentivos ficam só no menu Relatórios, abaixo do Relatório do projeto: com o Financeiro aberto, não há outro link
  await menu.getByRole("button", { name: "Financeiro" }).click();
  await expect(menu.getByRole("link", { name: "Incentivos", exact: true })).toHaveCount(1);
  const reports = await menu.getByRole("link", { name: /^(Relatório do projeto|Incentivos)$/ }).allTextContents();
  expect(reports).toEqual(["Relatório do projeto", "Incentivos"]);
  const sheet = [
    "Nome;Valor;Data de pagamento;Chave Pix",
    `Respondente A;100,00;${SATURDAY};pessoa-a@exemplo.invalid`,
    `Respondente B;100,00;${SUNDAY};pessoa-b@exemplo.invalid`,
    `Respondente C;100,00;13/03/2030;pessoa-c@exemplo.invalid`,
  ].join("\r\n");
  await page.getByRole("button", { name: "Importar planilha" }).click();
  const importer = page.getByRole("dialog");
  // Aqui só se importa incentivo: o diálogo já abre nesse tipo, sem perguntar
  await expect(importer.getByRole("heading", { name: "Importar incentivos" })).toBeVisible();
  await expect(importer.getByRole("combobox", { name: "Tipo *" })).toHaveCount(0);
  await mark(page, "Projeto", "PRJ-1790");
  await mark(page, "Categoria", /Serviços de terceiros/);
  await mark(page, "Forma de pagamento", "Pix");
  await mark(page, "Empresa", "PPlus");
  await mark(page, "Unidade", "Consumo SP");
  await mark(page, "Centro de custo", "Administrativo");
  await importer.getByLabel("Planilha *").setInputFiles({
    name: "incentivos-fim-de-semana.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(sheet, "utf-8"),
  });
  await importer.getByRole("button", { name: "Ler planilha" }).click();
  // A chave Pix da planilha nunca aparece inteira, nem na prévia
  await expect(importer).not.toContainText("pessoa-a@exemplo.invalid");

  // A prévia avisa cada data que mudou e o motivo, antes de criar
  await expect(importer.getByText("3 pessoas com data de pagamento em fim de semana ou feriado")).toBeVisible();
  await expect(importer.getByText(/09\/03 caiu em sábado; vai para 11\/03/)).toBeVisible();
  await expect(importer.getByText(/10\/03 caiu em domingo; vai para 11\/03/)).toBeVisible();
  await expect(importer.getByText(/13\/03 caiu em feriado: Recesso da empresa; vai para 14\/03/)).toBeVisible();
  await expect(importer.getByText(/ajustada de 09\/03 e 10\/03/)).toBeVisible();
  await importer.getByRole("button", { name: "Criar 2 lançamentos com 3 itens" }).click();
  await expect(page.getByText(/2 lançamentos criados, 3 itens/)).toBeVisible();

  // ---- Depois de importar, a própria página mostra o que entrou, em qualquer data ----
  await expect(page.getByRole("combobox", { name: "Visão por período" })).toContainText("Tudo");

  // Um lançamento por vencimento, cada um com a sua data na frente do nome (sem linha de data separada):
  // segunda 11/03 com 2 pessoas e quinta 14/03 com 1
  const mondayLaunch = page.getByRole("row", { name: /Incentivos · PRJ-1790 · pagar 11\/03/ });
  await expect(mondayLaunch).toHaveCount(1);
  await expect(mondayLaunch).toContainText("11/03/2030");
  await expect(mondayLaunch).toContainText("R$ 200,00");
  await expect(mondayLaunch).toContainText("A vencer");
  const thursdayLaunch = page.getByRole("row", { name: /Incentivos · PRJ-1790 · pagar 14\/03/ });
  await expect(thursdayLaunch).toHaveCount(1);
  await expect(thursdayLaunch).toContainText("14/03/2030");
  await expect(thursdayLaunch).toContainText("R$ 100,00");
  await expect(page.getByRole("row", { name: /segunda-feira|quinta-feira/ })).toHaveCount(0);

  // Os cartões filtram: as datas de 2030 estão a vencer, não vencem hoje
  await page.getByRole("button", { name: /^Vencem hoje/ }).click();
  await expect(mondayLaunch).toHaveCount(0);
  await page.getByRole("button", { name: /^A vencer/ }).click();
  await expect(mondayLaunch).toBeVisible();
  await page.getByRole("button", { name: "Limpar filtro" }).click();

  // O dropdown abre as pessoas a pagar do lançamento, com o resumo, as abas e o detalhe de cada uma
  await mondayLaunch.getByRole("button", { name: "Mostrar as pessoas" }).click();
  await expect(page.getByText("2 pessoas · R$ 200,00", { exact: true })).toBeVisible();
  await expect(page.getByText("0 de 2 pagos · R$ 200,00 em aberto")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Todos 2" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Em aberto 2" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Pagos 0" })).toBeVisible();
  const personA = page.getByRole("cell", { name: "Respondente A", exact: true });
  const personB = page.getByRole("cell", { name: "Respondente B", exact: true });
  await expect(personA).toBeVisible();
  await expect(personB).toBeVisible();
  await expect(page.getByRole("cell", { name: "A pagar", exact: true }).first()).toBeVisible();
  // Buscar pela pessoa, e as abas: ninguém foi pago ainda
  await page.getByLabel("Buscar pessoa").fill("Respondente B");
  await expect(personA).toHaveCount(0);
  await expect(personB).toBeVisible();
  await page.getByLabel("Buscar pessoa").fill("");
  await page.getByRole("tab", { name: "Pagos 0" }).click();
  await expect(page.getByText("Ninguém nessa situação.")).toBeVisible();
  await page.getByRole("tab", { name: "Em aberto 2" }).click();
  await expect(personA).toBeVisible();
  // Como no protótipo: de onde veio, a regra da nota, a chave Pix mascarada e a coluna Nota
  await expect(page.getByText("Veio da planilha de incentivos.")).toBeVisible();
  await expect(page.getByText("Incentivo não tem nota fiscal.")).toBeVisible();
  await expect(page.getByText("Chave Pix mascarada: a completa não é guardada.")).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Chave Pix" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Nota" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "pes***@exemplo.invalid", exact: true })).toHaveCount(2);
  await expect(page.getByRole("cell", { name: "Sem nota", exact: true })).toHaveCount(2);
  await expect(page.getByText("pessoa-a@exemplo.invalid")).toHaveCount(0);

  // Baixar a planilha das pessoas: um Excel de verdade, com o nome do projeto e da data
  const [spreadsheet] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Baixar planilha" }).click(),
  ]);
  expect(spreadsheet.suggestedFilename()).toBe("incentivos-PRJ-1790-2030-03-11.xlsx");
  expect(readFileSync(await spreadsheet.path()).subarray(0, 2).toString()).toBe("PK"); // .xlsx é um zip

  // Enviar o PDF do comprovante: fica anexado ao lançamento, sem dar baixa em ninguém
  const receipts = page.getByLabel("Escolher os PDFs de comprovante");
  await receipts.setInputFiles({ name: "foto-do-pix.png", mimeType: "image/png", buffer: Buffer.from("não é pdf") });
  await expect(page.getByText("foto-do-pix.png: envie o comprovante em PDF")).toBeVisible();
  await receipts.setInputFiles({
    name: "comprovantes-11-03.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n%comprovantes fictícios do teste\n"),
  });
  await expect(page.getByText("1 comprovante anexado", { exact: true })).toBeVisible();
  await expect(page.getByText("comprovantes-11-03.pdf", { exact: true })).toBeVisible();
  await expect(page.getByText("foto-do-pix.png: envie o comprovante em PDF")).toHaveCount(0);
  await expect(page.getByText("0 de 2 pagos · R$ 200,00 em aberto")).toBeVisible(); // anexar não dá baixa
  const [receipt] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Baixar comprovantes-11-03.pdf" }).click(),
  ]);
  expect(receipt.suggestedFilename()).toBe("comprovantes-11-03.pdf");

  await mondayLaunch.getByRole("button", { name: "Esconder as pessoas" }).click();
  await expect(personA).toHaveCount(0);

  // Abrir leva ao dia da conta no Contas a pagar, já com a lista das pessoas aberta
  await mondayLaunch.getByRole("link", { name: "Abrir" }).click();
  await expect(page).toHaveURL(/\/contas-a-pagar\?conta=\d+$/);
  await expect(page.getByRole("cell", { name: "Respondente A", exact: true })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Respondente B", exact: true })).toBeVisible();
});
