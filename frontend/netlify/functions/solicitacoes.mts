import { getStore } from "@netlify/blobs";
import { handle } from "../solicitacoes.mjs";

/**
 * A função do Netlify das solicitações da equipe. Guarda no Netlify Blobs do próprio site; a regra
 * (o que se aceita, a chave, as respostas) está em ../solicitacoes.mjs. Publicada pelo
 * scripts/deploy-demo.mjs (o ZIP arrastado no Netlify não leva funções).
 */
export default async function solicitacoes(request: Request): Promise<Response> {
  return handle(request, {
    store: getStore({ name: "solicitacoes", consistency: "strong" }),
    key: process.env.SOLICITACOES_CHAVE ?? "",
  });
}

export const config = { path: ["/api/solicitacoes", "/api/solicitacoes/*"] };
