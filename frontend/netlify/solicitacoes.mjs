/**
 * Solicitações da equipe (correção de bug, correção de regra ou melhoria), enviadas pela versão de
 * demonstração. Quem roda esta regra: a função do Netlify (netlify/functions/solicitacoes.mts), que
 * guarda no Netlify Blobs, e o servidor de teste local (scripts/serve-demo.mjs), que guarda em memória.
 *
 * Enviar é aberto a quem abre a demonstração. Ler a lista e as imagens pede a chave do
 * desenvolvimento (SOLICITACOES_CHAVE, configurada no Netlify; nunca no código).
 * docs/specs/solicitacoes.md e docs/architecture/adr/0019-solicitacoes-da-demonstracao-no-netlify.md
 */

export const TYPES = Object.freeze({
  bug: "Correção de bug",
  regra: "Correção de regra",
  melhoria: "Melhoria",
});
// Uma função do Netlify recebe no máximo 6 MB, e a imagem chega codificada (um terço maior).
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
export const MAX_DESCRIPTION = 4000;
// Enviar é aberto: o limite segura o espaço guardado se alguém encher a caixa de propósito.
export const MAX_ITEMS = 500;

const BASE = "/api/solicitacoes";
const IMAGE_TOO_BIG = "A imagem passa de 4 MB. Recorte um pedaço menor da tela.";

/**
 * @typedef {{ id: string, type: string, description: string, page: string, sender: string,
 *   createdAt: string, image: { contentType: string, size: number } }} Feedback
 * @typedef {{
 *   get(key: string, options: { type: "json" }): Promise<any>,
 *   getWithMetadata(key: string, options: { type: "arrayBuffer" }):
 *     Promise<{ data: ArrayBuffer, metadata: Record<string, unknown> } | null>,
 *   set(key: string, data: ArrayBuffer, options: { metadata: Record<string, unknown> }): Promise<unknown>,
 *   setJSON(key: string, data: unknown): Promise<unknown>,
 *   list(options: { prefix: string }): Promise<{ blobs: { key: string }[] }>,
 * }} FeedbackStore
 * @typedef {{ store: FeedbackStore, key: string, now?: () => Date, newId?: () => string }} Options
 */

/** @param {Uint8Array} bytes @param {number} start @param {number} end */
const ascii = (bytes, start, end) => String.fromCharCode(...bytes.subarray(start, end));

/** @type {[string, (bytes: Uint8Array) => boolean][]} */
const SIGNATURES = [
  ["image/png", (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47],
  ["image/jpeg", (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["image/gif", (b) => ascii(b, 0, 4) === "GIF8"],
  ["image/webp", (b) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP"],
];

/** O tipo da imagem pelos primeiros bytes: o tipo que o navegador informa não vale. */
export function imageType(/** @type {Uint8Array} */ bytes) {
  return SIGNATURES.find(([, matches]) => matches(bytes))?.[0] ?? null;
}

/** @param {unknown} body @param {number} [status] */
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

/** @param {number} status @param {string} detail */
const refuse = (status, detail) => json({ detail }, status);

/** @param {string} text */
async function digest(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** Compara a chave sem que o tempo da resposta diga quantos caracteres bateram. */
async function sameKey(/** @type {string} */ given, /** @type {string} */ expected) {
  const [a, b] = await Promise.all([digest(given), digest(expected)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

/** Sem chave configurada, ou com a chave errada, a lista e as imagens não saem. */
async function denied(/** @type {Request} */ request, /** @type {string} */ key) {
  if (!key) return refuse(503, "A chave do desenvolvimento ainda não foi configurada no Netlify.");
  const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!given || !(await sameKey(given, key))) return refuse(401, "Chave errada.");
  return null;
}

/** @param {Request} request @param {Options} options */
async function create(request, { store, now = () => new Date(), newId = () => crypto.randomUUID() }) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES + 64 * 1024) {
    return refuse(413, IMAGE_TOO_BIG);
  }
  let form;
  try {
    form = await request.formData();
  } catch {
    return refuse(400, "Não foi possível ler o envio. Tente de novo.");
  }
  const type = String(form.get("tipo") ?? "");
  const description = String(form.get("descricao") ?? "").trim();
  const file = form.get("imagem");
  const missing = [
    !Object.hasOwn(TYPES, type) && "tipo",
    !description && "descrição",
    !(file instanceof Blob && file.size > 0) && "imagem",
  ].filter(Boolean);
  if (missing.length) return refuse(422, `Falta preencher: ${missing.join(", ")}.`);
  if (description.length > MAX_DESCRIPTION) {
    return refuse(422, "A descrição passa de 4.000 caracteres. Resuma um pouco.");
  }
  const image = /** @type {Blob} */ (file);
  if (image.size > MAX_IMAGE_BYTES) return refuse(413, IMAGE_TOO_BIG);
  const bytes = await image.arrayBuffer();
  const contentType = imageType(new Uint8Array(bytes));
  if (!contentType) return refuse(422, "A imagem precisa ser PNG, JPG, WEBP ou GIF.");
  const { blobs } = await store.list({ prefix: "solicitacao/" });
  if (blobs.length >= MAX_ITEMS) {
    return refuse(429, "A caixa de solicitações está cheia. Avise o desenvolvimento.");
  }

  const id = newId();
  /** @type {Feedback} */
  const item = {
    id,
    type,
    description,
    page: String(form.get("pagina") ?? "").slice(0, 200),
    sender: String(form.get("quem") ?? "").slice(0, 120),
    createdAt: now().toISOString(),
    image: { contentType, size: bytes.byteLength },
  };
  // A imagem antes do texto: a lista só mostra a solicitação quando as duas partes existem.
  await store.set(`imagem/${id}`, bytes, { metadata: { contentType } });
  await store.setJSON(`solicitacao/${id}`, item);
  return json({ id }, 201);
}

/** @param {Request} request @param {Options} options */
async function list(request, { store, key }) {
  const refused = await denied(request, key);
  if (refused) return refused;
  const { blobs } = await store.list({ prefix: "solicitacao/" });
  /** @type {Feedback[]} */
  const items = (await Promise.all(blobs.map((blob) => store.get(blob.key, { type: "json" })))).filter(Boolean);
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return json({ items });
}

/** @param {Request} request @param {Options} options @param {string} id */
async function sendImage(request, { store, key }, id) {
  const refused = await denied(request, key);
  if (refused) return refused;
  const found = await store.getWithMetadata(`imagem/${id}`, { type: "arrayBuffer" });
  const contentType = String(found?.metadata?.contentType ?? "");
  if (!found || !SIGNATURES.some(([type]) => type === contentType)) {
    return refuse(404, "Imagem não encontrada.");
  }
  return new Response(found.data, {
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "content-disposition": "inline",
    },
  });
}

/**
 * Um pedido para /api/solicitacoes: POST envia; GET lista; GET /<id>/imagem devolve a imagem.
 * @param {Request} request
 * @param {Options} options
 * @returns {Promise<Response>}
 */
export async function handle(request, options) {
  const path = new URL(request.url).pathname.replace(/\/+$/, "");
  if (path === BASE) {
    if (request.method === "POST") return create(request, options);
    if (request.method === "GET") return list(request, options);
    return refuse(405, "Pedido não aceito.");
  }
  const image = path.match(/^\/api\/solicitacoes\/([0-9a-f-]{36})\/imagem$/);
  if (image && request.method === "GET") return sendImage(request, options, image[1]);
  return refuse(404, "Endereço não encontrado.");
}

/** O armazenamento em memória do servidor de teste local e dos testes: some quando o processo acaba. */
export function memoryStore() {
  /** @type {Map<string, { value: any, metadata: Record<string, unknown> }>} */
  const entries = new Map();
  /** @type {FeedbackStore} */
  const store = {
    async get(key) {
      return entries.has(key) ? structuredClone(entries.get(key)?.value) : null;
    },
    async getWithMetadata(key) {
      const entry = entries.get(key);
      return entry ? { data: entry.value, metadata: entry.metadata } : null;
    },
    async set(key, data, options) {
      entries.set(key, { value: data, metadata: options?.metadata ?? {} });
    },
    async setJSON(key, data) {
      entries.set(key, { value: structuredClone(data), metadata: {} });
    },
    async list({ prefix }) {
      return { blobs: [...entries.keys()].filter((key) => key.startsWith(prefix)).map((key) => ({ key })) };
    },
  };
  return store;
}
