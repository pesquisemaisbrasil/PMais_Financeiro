/**
 * Ambiente de teste publicado (versão de teste do site do protótipo): só com dados fictícios.
 * Tudo vem de variáveis de build; sem elas (desenvolvimento e produção) nada aparece.
 */

export interface TestEnvironment {
  /** Mostra a faixa "Ambiente de teste com dados fictícios". */
  banner: boolean;
  /** Para onde "Voltar ao protótipo" leva; só existe com a faixa ligada. */
  prototypeUrl: string | null;
}

interface RawEnv {
  testEnv?: string;
  prototypeUrl?: string;
}

// As variáveis NEXT_PUBLIC_* só entram no navegador quando aparecem escritas assim, por inteiro.
const BUILD_ENV: RawEnv = {
  testEnv: process.env.NEXT_PUBLIC_TEST_ENV,
  prototypeUrl: process.env.NEXT_PUBLIC_PROTOTYPE_URL,
};

/** O caminho do próprio site ("/") ou um endereço http(s): nada de `javascript:`, de `//outro-site` nem de endereço solto. */
function safeAddress(value: string): boolean {
  return /^\/(?!\/)[\w\-./]*$/.test(value) || /^https?:\/\/[^\s]+$/.test(value);
}

export function readTestEnvironment(env: RawEnv = BUILD_ENV): TestEnvironment {
  const banner = env.testEnv === "1";
  const url = (env.prototypeUrl ?? "").trim();
  return { banner, prototypeUrl: banner && url && safeAddress(url) ? url : null };
}

/** A altura da faixa; o menu lateral desce esse tanto para não ficar escondido por ela. */
export const BANNER_HEIGHT = "2rem";
