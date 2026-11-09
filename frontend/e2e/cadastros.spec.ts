import { expect, test } from "@playwright/test";
import { signIn } from "./fixtures";

// CNPJs inventados da consulta de mentira (CNPJ_LOOKUP_MODE=simulated):
const GRAFICA = "11.444.777/0001-61"; // baixada na Receita
const MEI = "12.345.678/0001-95"; // razão social com CPF no fim
const ALFA = "11.222.333/0001-81"; // ativa
const SEM_CADASTRO = "99.887.766/0001-05"; // a Receita não conhece

test("cadastros: o CNPJ preenche nome e apelido pela Receita, e tudo continua editável", async ({ page }) => {
  await signIn(page, "cnpj@e2e.invalid");

  // Fornecedor: a busca começa pelo CNPJ e preenche sozinha quando ele fecha
  await page.goto("/cadastros?aba=suppliers");
  await page.getByRole("button", { name: "Novo fornecedor" }).click();
  const supplier = page.getByRole("dialog");
  await supplier.getByLabel("CNPJ").fill(GRAFICA);
  await expect(supplier.getByLabel("Nome / razão social *")).toHaveValue("GRAFICA EXEMPLO LTDA");
  await expect(supplier.getByLabel("Apelido *")).toHaveValue("Grafica Exemplo Ltda");
  // empresa baixada na Receita: a tela avisa, mas deixa cadastrar
  await expect(supplier.getByRole("status")).toContainText("Situação na Receita: BAIXADA");
  // as informações são editáveis, e o código é opcional
  await supplier.getByLabel("Apelido *").fill("Gráfica Exemplo");
  await supplier.getByLabel("Código").fill("F-01");
  await supplier.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByText("Cadastro criado.")).toBeVisible();
  const row = page.getByRole("row", { name: /Gráfica Exemplo/ });
  await expect(row).toContainText("F-01");
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
  await company.getByLabel("Código").fill("02");
  await company.getByRole("button", { name: "Cadastrar" }).click();
  await expect(page.getByText("Cadastro criado.")).toBeVisible();
  const companyRow = page.getByRole("row", { name: /Alfa Pesquisas/ });
  await expect(companyRow).toContainText("02");
  await expect(companyRow).toContainText("11.222.333/0001-81");
  await page.getByRole("button", { name: "Nova empresa" }).click();
  const again = page.getByRole("dialog");
  await again.getByLabel("CNPJ").fill(ALFA);
  await again.getByLabel("Nome / razão social *").fill("Outra com o mesmo CNPJ");
  await again.getByRole("button", { name: "Cadastrar" }).click();
  await expect(again.getByRole("alert")).toContainText("Já existe uma empresa ativa com esse documento");
});
