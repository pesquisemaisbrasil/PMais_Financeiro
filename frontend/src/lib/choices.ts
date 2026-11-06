/**
 * Filtro com mais de uma opção: o valor é o texto dos ids separados por vírgula ("3,5"), e o
 * texto vazio é "todos". Assim cada filtro continua sendo uma string só, como o resto da tela.
 */

export interface ChoiceOption {
  id: number | string;
  label: string;
}

export function choiceIds(value: string): string[] {
  return value ? value.split(",").filter(Boolean) : [];
}

/**
 * Marca ou desmarca uma opção. Uma opção "exclusiva" (ex.: Cancelada) não combina com as outras:
 * marcá-la limpa o resto, e marcar outra tira a exclusiva.
 */
export function toggleChoice(value: string, id: string, exclusive: string[] = []): string {
  const ids = choiceIds(value);
  if (ids.includes(id)) return ids.filter((current) => current !== id).join(",");
  if (exclusive.includes(id)) return id;
  return [...ids.filter((current) => !exclusive.includes(current)), id].join(",");
}

/** O que o botão do filtro mostra: "Todos", o nome, os dois nomes ou "3 selecionados". */
export function choiceLabel(value: string, options: ChoiceOption[], allLabel: string): string {
  const names = choiceIds(value)
    .map((id) => options.find((option) => String(option.id) === id)?.label)
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return allLabel;
  return names.length <= 2 ? names.join(", ") : `${names.length} selecionados`;
}

/** Quantas opções estão marcadas (para contar o filtro como um só, ou para avisar). */
export function choiceCount(value: string): number {
  return choiceIds(value).length;
}
