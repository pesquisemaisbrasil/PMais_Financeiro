/**
 * Mensagem para os campos obrigatórios que ficaram vazios, com o nome de cada um na ordem da tela
 * ("Preencha os campos obrigatórios: Fornecedor, Categoria e Descrição."). Sem nenhum vazio, devolve null.
 */
export function missingFieldsMessage(fields: [label: string, value: unknown][]): string | null {
  const missing = fields.filter(([, value]) => !value).map(([label]) => label);
  if (!missing.length) return null;
  const list = new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" }).format(missing);
  return `Preencha ${missing.length > 1 ? "os campos obrigatórios" : "o campo obrigatório"}: ${list}.`;
}
