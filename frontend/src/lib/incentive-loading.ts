// A tela de carregamento do Carregar incentivos. O servidor cria os lançamentos de uma vez (todos ou
// nenhum), então a contagem acompanha o tempo: ela demora mais quanto mais incentivos a planilha tem, e
// só chega ao total depois que o servidor confirmou.

const MIN_MS = 1500;
const MAX_MS = 6000;
const MS_PER_INCENTIVE = 15;

/** Quanto tempo a contagem leva, proporcional à quantidade de incentivos da planilha. */
export function loadingDuration(total: number): number {
  return Math.min(MAX_MS, Math.max(MIN_MS, total * MS_PER_INCENTIVE));
}

/** Quantos incentivos a tela mostra depois de `elapsed` milissegundos. */
export function loadedCount(total: number, elapsed: number, confirmed: boolean): number {
  const share = Math.min(1, Math.max(0, elapsed / loadingDuration(total)));
  const shown = Math.floor(total * share);
  return confirmed ? shown : Math.min(shown, Math.max(total - 1, 0));
}
