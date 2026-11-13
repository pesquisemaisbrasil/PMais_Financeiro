/**
 * Prefixo do app quando ele roda debaixo de um caminho do site (ambiente de teste: "/teste").
 * Vazio em desenvolvimento e produção. Vem de NEXT_PUBLIC_BASE_PATH, definida na geração do app
 * (a mesma que o `basePath` do next.config.ts).
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/**
 * Endereço de um arquivo da pasta `public` para o `next/image`, que (ao contrário de Link e do
 * roteador) não coloca o prefixo sozinho.
 */
export function publicAsset(path: string): string {
  return `${BASE_PATH}${path}`;
}
