import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

// As barras de rolagem do Windows ocupam espaço: sem isto, o teste não vê a janela como a pessoa vê.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

// As colunas da planilha que o financeiro usa hoje, mais a coluna Projeto. Tudo fictício.
const HEADER =
  "Projeto;Plano de contas;Forma de pagamento;Nome Completo:;Beneficiário:;Chave Pix:;PIX:;VALOR TOTAL;STATUS;PEDIDO EM;" +
  "DATA DE REALIZAÇÃO DA PESQUISA;PAGAR (PREENCHIDO PELO FINANCEIRO);COMPROVANTES SALVOS NA REDE;OBS";

function line(
  project: string,
  name: string,
  value: string,
  status: string,
  pay: string,
  account = "2.02 Incentivos",
  method = "Pix"
) {
  const key = `${name.toLowerCase().replace(" ", "-")}@exemplo.invalid`;
  return `${project};${account};${method};${name};${name};E-mail;${key};${value};${status};01/06/2030;03/06/2030;${pay};Sim;nada`;
}

function csv(name: string, rows: string[]) {
  return { name, mimeType: "text/csv", buffer: Buffer.from(rows.join("\r\n"), "utf-8") };
}

test("carregar incentivos: baixa o modelo, confere a planilha e cria um lançamento por projeto e data", async ({
  page,
}) => {
  await signIn(page, "carregar-incentivos@e2e.invalid");
  await page.goto("/contas-a-pagar");
  await page.getByRole("button", { name: "Carregar incentivos" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Carregar incentivos" })).toBeVisible();

  // Tudo vem da planilha: a janela não pergunta nenhum cadastro
  await expect(dialog.getByRole("combobox")).toHaveCount(0);

  // A planilha modelo vem para o computador
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    dialog.getByRole("button", { name: "Baixar planilha modelo" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("modelo-carregar-incentivos.xlsx");
  const template = await readFile(await download.path());
  expect(template.subarray(0, 2).toString()).toBe("PK"); // .xlsx é um arquivo compactado

  // Planilha sem projeto, plano de contas e forma de pagamento: diz o que falta
  await dialog.getByLabel("Planilha *").setInputFiles(
    csv("sem-detalhes.csv", [
      "Beneficiário:;VALOR TOTAL;PAGAR (PREENCHIDO PELO FINANCEIRO)",
      "Respondente Z;10,00;05/06/2030",
    ])
  );
  await dialog.getByRole("button", { name: "Ler planilha" }).click();
  await expect(
    dialog.getByText('A planilha precisa das colunas "projeto", "plano de contas" e "forma de pagamento"')
  ).toBeVisible();

  // A planilha atual com a coluna Projeto: vários projetos, datas, quem já recebeu e um erro.
  // Duas pessoas por lançamento: outros testes contam os de "1 pessoa" no banco compartilhado.
  await dialog.getByLabel("Planilha *").setInputFiles(
    csv("incentivos-atual.csv", [
      HEADER,
      line("1804", "Respondente A", "100,00", "Pendente", "05/06/2030"),
      line("1804", "Respondente F", "30,00", "", "05/06/2030"),
      line("1804", "Respondente B", "50,00", "", "06/06/2030"),
      line("1804", "Respondente G", "20,00", "", "06/06/2030"),
      line("1790", "Respondente C", "70,00", "", "06/06/2030"),
      line("1790", "Respondente H", "10,00", "", "06/06/2030"),
      line("1804", "Respondente D", "40,00", "Pago", "05/06/2030"),
      line("9999", "Respondente E", "10,00", "", "05/06/2030"),
      line("1804", "Respondente I", "10,00", "", "05/06/2030", ""),
      line("1804", "Respondente J", "10,00", "", "05/06/2030", "2.02 Incentivos", ""),
    ])
  );
  await dialog.getByRole("button", { name: "Ler planilha" }).click();

  await expect(dialog.getByText("Projeto 9999 não existe")).toBeVisible();
  await expect(dialog.getByText("Sem plano de contas na linha")).toBeVisible();
  await expect(dialog.getByText("Sem forma de pagamento na linha")).toBeVisible();
  await expect(dialog.getByText("Já pagas", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Já paga", { exact: true })).toBeVisible();
  // A chave Pix nunca aparece inteira, e o que a planilha traz a mais não é lido
  await expect(dialog).not.toContainText("respondente-a@exemplo.invalid");
  await expect(dialog).not.toContainText("nada");

  // A conferência cabe na janela, sem rolar para o lado, do computador ao celular
  for (const width of [1280, 960, 780, 700, 390]) {
    await page.setViewportSize({ width, height: 800 });
    const overflow = await dialog.evaluate((element) => ({
      window: element.scrollWidth - element.clientWidth,
      tables: Array.from(element.querySelectorAll('[data-slot="table-container"]')).map(
        (table) => table.scrollWidth - table.clientWidth
      ),
    }));
    expect(overflow.window, `janela com a tela de ${width}px`).toBeLessThanOrEqual(0);
    expect(Math.max(...overflow.tables), `tabelas com a tela de ${width}px`).toBeLessThanOrEqual(0);
  }
  await page.setViewportSize({ width: 1280, height: 720 });

  // Se o servidor recusar, a tela de carregamento some e a conferência volta com o motivo
  await page.route(
    "**/payables/import",
    (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ detail: "Falha de teste ao carregar" }),
      }),
    { times: 1 }
  );
  await dialog.getByRole("button", { name: "Criar 3 lançamentos com 6 itens" }).click();
  await expect(dialog.getByText("Falha de teste ao carregar")).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Conferir antes de importar" })).toBeVisible();

  // A tela de carregamento conta os incentivos da planilha e só fecha quando tudo entrou
  await dialog.getByRole("button", { name: "Criar 3 lançamentos com 6 itens" }).click();
  await expect(dialog.getByRole("heading", { name: "Carregando incentivos" })).toBeVisible();
  await expect(dialog.getByText(/^\d de 6 incentivos$/)).toBeVisible();
  await expect(dialog.getByRole("progressbar", { name: "Incentivos carregados" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Fechar janela" })).toHaveCount(0);
  await expect(dialog.getByRole("heading", { name: "Incentivos carregados" })).toBeVisible();
  await expect(dialog.getByText("6 incentivos carregados", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/3 lançamentos criados, 6 itens/)).toBeVisible();

  // Um lançamento por projeto e data de pagamento
  const search = page.getByLabel("Buscar conta, fornecedor, NF, projeto ou valor");
  await search.fill("pagar 06/06");
  await expect(page.getByRole("row", { name: /Incentivos · PRJ-1804 · pagar 06\/06/ })).toHaveCount(1);
  await expect(page.getByRole("row", { name: /Incentivos · PRJ-1790 · pagar 06\/06/ })).toHaveCount(1);
  await search.fill("pagar 05/06");
  const first = page.getByRole("row", { name: /Incentivos · PRJ-1804 · pagar 05\/06/ });
  await expect(first).toHaveCount(1);
  await expect(first).toContainText("R$ 130,00");
});
