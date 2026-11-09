import { expect, test } from "@playwright/test";
import { box, signIn } from "./fixtures";

// CNPJs inventados da consulta de mentira (CNPJ_LOOKUP_MODE=simulated):
const GRAFICA = "11.444.777/0001-61"; // baixada na Receita
const MEI = "12.345.678/0001-95"; // razão social com CPF no fim
const ALFA = "11.222.333/0001-81"; // ativa
const SEM_CADASTRO = "99.887.766/0001-05"; // a Receita não conhece

test("cadastros: o CNPJ preenche nome e apelido pela Receita, e tudo continua editável", async ({ page }) => {
  await signIn(page, "cnpj@e2e.invalid");

  // O menu de Cadastros na ordem pedida, e sem escolher o tipo abre o primeiro (Empresas)
  await page.goto("/cadastros");
  await expect(page.getByRole("button", { name: "Nova empresa" })).toBeVisible();
  const menu = [
    "Empresas",
    "Unidades",
    "Centros de custo",
    "Clientes",
    "Fornecedores",
    "Plano de contas",
    "Projetos",
    "Contas bancárias",
    "Formas de pagamento",
  ];
  const tops: number[] = [];
  for (const name of menu) tops.push((await box(page.getByRole("link", { name, exact: true }))).y);
  expect(tops).toEqual([...tops].sort((a, b) => a - b));

  // As três ações (editar, inativar e excluir) aparecem em todas as linhas; com lançamentos, o excluir explica
  await page.goto("/cadastros?aba=suppliers");
  const editButtons = page.getByRole("button", { name: /^Editar / });
  await expect(editButtons.first()).toBeVisible();
  const lines = await editButtons.count();
  await expect(page.getByRole("button", { name: /^(Inativar|Reativar) / })).toHaveCount(lines);
  await expect(page.getByRole("button", { name: /^Excluir / })).toHaveCount(lines);
  const inUse = page.getByRole("row", { name: /Ponto Certo/ });
  await inUse.getByRole("button", { name: /^Excluir / }).click();
  await expect(page.getByText(/tem lançamentos: inative em vez de excluir/)).toBeVisible();
  await expect(inUse).toHaveCount(1);

  // Fornecedor: a busca começa pelo CNPJ e preenche sozinha quando ele fecha
  await page.goto("/cadastros?aba=suppliers");
  // No alto da aba: o que a busca mostra e o total de cadastros da aba (com ativos e inativos)
  const total = page.getByRole("group", { name: "Total de fornecedores" });
  const showing = page.getByRole("group", { name: "Exibindo", exact: true });
  await expect(total.getByText(/^\d+$/)).toBeVisible();
  const before = Number(await total.getByText(/^\d+$/).innerText());
  // Ativos e Inativos são cards à parte, e a soma dos dois é o total
  const activeCard = page.getByRole("group", { name: "Ativos", exact: true });
  const inactiveCard = page.getByRole("group", { name: "Inativos", exact: true });
  const activeBefore = Number(await activeCard.getByText(/^\d+$/).innerText());
  expect(activeBefore + Number(await inactiveCard.getByText(/^\d+$/).innerText())).toBe(before);
  await expect(showing.getByText(/^\d+$/)).toHaveText(String(before));
  await page.getByLabel("Buscar em fornecedores").fill("nada-assim-existe");
  await expect(showing.getByText(/^\d+$/)).toHaveText("0");
  await expect(total.getByText(/^\d+$/)).toHaveText(String(before)); // o total não depende da busca
  await page.getByLabel("Buscar em fornecedores").fill("");

  await page.getByRole("button", { name: "Novo fornecedor" }).click();
  const supplier = page.getByRole("dialog");
  await supplier.getByLabel("CNPJ").fill(GRAFICA);
  await expect(supplier.getByLabel("Nome / razão social *")).toHaveValue("GRAFICA EXEMPLO LTDA");
  await expect(supplier.getByLabel("Apelido *")).toHaveValue("Grafica Exemplo Ltda");
  // empresa baixada na Receita: a tela avisa, mas deixa cadastrar
  await expect(supplier.getByRole("status")).toContainText("Situação na Receita: BAIXADA");
  // as informações são editáveis, e o código é opcional
  await supplier.getByLabel("Apelido *").fill("Gráfica Exemplo");
  // o código é gerado pelo sistema: o campo só mostra
  await expect(supplier.getByLabel("Código")).toBeDisabled();
  await supplier.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByText("Cadastro criado.")).toBeVisible();
  await expect(total.getByText(/^\d+$/)).toHaveText(String(before + 1));
  await expect(activeCard.getByText(/^\d+$/)).toHaveText(String(activeBefore + 1)); // o novo nasce ativo
  const row = page.getByRole("row", { name: /Gráfica Exemplo/ });
  await expect(row.getByRole("cell").first()).toHaveText(/^\d{4}$/); // 0001, 0002...
  await expect(row).toContainText("GRAFICA EXEMPLO LTDA");
  await expect(row).toContainText("11.444.777/0001-61");

  // O que a pessoa já escreveu a consulta automática não troca; o botão Buscar troca
  await page.getByRole("button", { name: "Novo fornecedor" }).click();
  const second = page.getByRole("dialog");
  await second.getByLabel("Nome / razão social *").fill("Meu nome do jeito que eu quero");
  await second.getByLabel("CNPJ").fill(ALFA);
  await expect(second.getByRole("status")).toContainText("Dados da Receita preenchidos");
  await expect(second.getByLabel("Nome / razão social *")).toHaveValue("Meu nome do jeito que eu quero");
  await expect(second.getByLabel("Apelido *")).toHaveValue("Alfa Pesquisas"); // vazio: a consulta completou
  await second.getByRole("button", { name: "Buscar" }).click();
  await expect(second.getByLabel("Nome / razão social *")).toHaveValue("ALFA PESQUISAS LTDA");
  await second.getByRole("button", { name: "Cancelar" }).click();

  // CNPJ que a Receita não conhece: avisa e deixa preencher à mão
  await page.getByRole("button", { name: "Novo fornecedor" }).click();
  const unknown = page.getByRole("dialog");
  await unknown.getByLabel("CNPJ").fill(SEM_CADASTRO);
  await expect(unknown.getByRole("status")).toContainText("CNPJ não encontrado na Receita");
  await expect(unknown.getByLabel("Nome / razão social *")).toHaveValue("");
  await unknown.getByRole("button", { name: "Cancelar" }).click();

  // Pessoa física: sem documento (o CPF não é guardado), e trocar o tipo limpa o CNPJ
  await page.getByRole("button", { name: "Novo fornecedor" }).click();
  const person = page.getByRole("dialog");
  await expect(person.getByRole("combobox", { name: "Tipo" })).toContainText("Pessoa jurídica");
  await person.getByLabel("CNPJ").fill(ALFA);
  await person.getByRole("combobox", { name: "Tipo" }).click();
  await page.getByRole("option", { name: "Pessoa física" }).click();
  await expect(person.getByLabel("CNPJ")).toBeDisabled();
  await expect(person.getByLabel("CNPJ")).toHaveValue("");
  await expect(person.getByRole("button", { name: "Buscar" })).toBeDisabled();
  await expect(person.getByRole("status")).toContainText("o CPF não é guardado");
  await person.getByLabel("Apelido *").fill("João Autônomo");
  await person.getByLabel("Nome / razão social *").fill("João da Silva Autônomo");
  await person.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("row", { name: /João Autônomo/ })).toContainText("Pessoa física");

  // Unidade: o código também é gerado
  await page.goto("/cadastros?aba=units");
  await page.getByRole("button", { name: "Nova unidade" }).click();
  const unit = page.getByRole("dialog");
  await expect(unit.getByLabel("Código")).toBeDisabled();
  await unit.getByRole("combobox", { name: "Empresa *" }).click();
  await page.getByRole("option", { name: "PPlus" }).click();
  await unit.getByLabel("Nome *").fill("Unidade do teste de cadastros");
  await unit.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByRole("row", { name: /Unidade do teste de cadastros/ }).getByRole("cell").first()).toHaveText(
    /^\d{4}$/
  );

  // Cliente MEI: o CPF que vem no fim da razão social nunca chega à tela
  await page.goto("/cadastros?aba=customers");
  await page.getByRole("button", { name: "Novo cliente" }).click();
  const customer = page.getByRole("dialog");
  await customer.getByLabel("CNPJ").fill(MEI);
  await expect(customer.getByLabel("Nome / razão social *")).toHaveValue("MARIA EXEMPLO DA SILVA");
  expect(await customer.getByLabel("Nome / razão social *").inputValue()).not.toMatch(/\d{11}/);
  await customer.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByText("Cadastro criado.")).toBeVisible();

  // Empresa do Grupo: os mesmos campos, e o CNPJ não repete entre as ativas
  await page.goto("/cadastros?aba=companies");
  await page.getByRole("button", { name: "Nova empresa" }).click();
  const company = page.getByRole("dialog");
  await company.getByLabel("CNPJ").fill(ALFA);
  await expect(company.getByLabel("Nome / razão social *")).toHaveValue("ALFA PESQUISAS LTDA");
  await expect(company.getByLabel("Código")).toBeDisabled();
  await company.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByText("Cadastro criado.")).toBeVisible();
  const companyRow = page.getByRole("row", { name: /Alfa Pesquisas/ });
  await expect(companyRow.getByRole("cell").first()).toHaveText(/^\d{4}$/);
  await expect(companyRow).toContainText("11.222.333/0001-81");
  await page.getByRole("button", { name: "Nova empresa" }).click();
  const again = page.getByRole("dialog");
  await again.getByLabel("CNPJ").fill(ALFA);
  await again.getByLabel("Nome / razão social *").fill("Outra com o mesmo CNPJ");
  await again.getByRole("button", { name: "Cadastrar" }).click();
  await expect(again.getByRole("alert")).toContainText("Já existe uma empresa ativa com esse documento");
});
