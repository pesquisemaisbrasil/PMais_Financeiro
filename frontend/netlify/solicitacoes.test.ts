import { describe, expect, it } from "vitest";
import { MAX_IMAGE_BYTES, MAX_ITEMS, handle, imageType, memoryStore } from "./solicitacoes.mjs";

const BASE = "https://demonstracao.invalid/api/solicitacoes";
const KEY = "chave-de-teste";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
type Store = ReturnType<typeof memoryStore>;

function setup(key = KEY) {
  const store = memoryStore();
  let count = 0;
  let clock = Date.parse("2026-11-16T12:00:00Z");
  const options = {
    store,
    key,
    now: () => new Date((clock += 60_000)),
    newId: () => `00000000-0000-4000-8000-${String(++count).padStart(12, "0")}`,
  };
  const send = (fields: Record<string, string | Blob>) => {
    const body = new FormData();
    for (const [name, value] of Object.entries(fields)) {
      if (typeof value === "string") body.set(name, value);
      else body.set(name, value, "print.png");
    }
    return handle(new Request(BASE, { method: "POST", body }), options);
  };
  const get = (path = "", given: string | null = KEY) =>
    handle(new Request(`${BASE}${path}`, { headers: given ? { Authorization: `Bearer ${given}` } : {} }), options);
  return { store, send, get, options };
}

const complete = (overrides: Record<string, string | Blob> = {}) => ({
  tipo: "bug",
  descricao: "  O total de pagos não soma a baixa parcial.  ",
  imagem: new Blob([PNG], { type: "image/png" }),
  pagina: "/contas-a-pagar",
  quem: "Bruna Demonstração",
  ...overrides,
});

async function saved(store: Store) {
  return (await store.list({ prefix: "" })).blobs.length;
}

describe("solicitações da equipe", () => {
  it("envia com tipo, descrição e imagem; a lista e a imagem só saem com a chave", async () => {
    const { send, get } = setup();
    const sent = await send(complete());
    expect(sent.status).toBe(201);
    const { id } = await sent.json();

    for (const given of [null, "chave-errada"]) {
      const refused = await get("", given);
      expect(refused.status).toBe(401);
      expect(await refused.json()).toEqual({ detail: "Chave errada." });
    }
    const listed = await get();
    expect(listed.status).toBe(200);
    expect((await listed.json()).items).toEqual([
      {
        id,
        type: "bug",
        description: "O total de pagos não soma a baixa parcial.",
        page: "/contas-a-pagar",
        sender: "Bruna Demonstração",
        createdAt: "2026-11-16T12:01:00.000Z",
        image: { contentType: "image/png", size: PNG.byteLength },
      },
    ]);

    expect((await get(`/${id}/imagem`, null)).status).toBe(401);
    const image = await get(`/${id}/imagem`);
    expect(image.headers.get("content-type")).toBe("image/png");
    expect(image.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(PNG);
  });

  it("o que falta volta numa frase só, e nada é guardado", async () => {
    const { store, send } = setup();
    const empty = await send({});
    expect(empty.status).toBe(422);
    expect(await empty.json()).toEqual({ detail: "Falta preencher: tipo, descrição, imagem." });
    // "toString" existe em todo objeto, mas não é um tipo de solicitação
    const strange = await send(complete({ tipo: "toString" }));
    expect(await strange.json()).toEqual({ detail: "Falta preencher: tipo." });
    expect(await send(complete({ descricao: "   " }))).toHaveProperty("status", 422);
    expect(await saved(store)).toBe(0);
  });

  it("recusa o que não é imagem, a imagem grande demais e a descrição longa demais", async () => {
    const { store, send } = setup();
    const text = await send(complete({ imagem: new Blob(["não sou imagem"], { type: "image/png" }) }));
    expect(text.status).toBe(422);
    expect(await text.json()).toEqual({ detail: "A imagem precisa ser PNG, JPG, WEBP ou GIF." });

    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG);
    const tooBig = await send(complete({ imagem: new Blob([big]) }));
    expect(tooBig.status).toBe(413);
    expect(await tooBig.json()).toEqual({ detail: "A imagem passa de 4 MB. Recorte um pedaço menor da tela." });

    const long = await send(complete({ descricao: "a".repeat(4001) }));
    expect(await long.json()).toEqual({ detail: "A descrição passa de 4.000 caracteres. Resuma um pouco." });
    expect(await saved(store)).toBe(0);
  });

  it("reconhece a imagem pelos primeiros bytes, não pelo nome nem pelo tipo informado", () => {
    expect(imageType(PNG)).toBe("image/png");
    expect(imageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(imageType(new TextEncoder().encode("GIF89a"))).toBe("image/gif");
    expect(imageType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(imageType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
  });

  it("sem a chave configurada no Netlify, o envio funciona e a lista avisa", async () => {
    const { send, get } = setup("");
    expect((await send(complete())).status).toBe(201);
    const listed = await get("", "qualquer");
    expect(listed.status).toBe(503);
    expect(await listed.json()).toEqual({ detail: "A chave do desenvolvimento ainda não foi configurada no Netlify." });
  });

  it("a lista vem da mais nova para a mais antiga", async () => {
    const { send, get } = setup();
    await send(complete({ tipo: "regra", descricao: "Primeira" }));
    await send(complete({ tipo: "melhoria", descricao: "Segunda" }));
    const { items } = await (await get()).json();
    expect(items.map((item: { description: string }) => item.description)).toEqual(["Segunda", "Primeira"]);
  });

  it("com a caixa cheia, o envio é recusado em vez de crescer sem limite", async () => {
    const { send, store } = setup();
    const full = Array.from({ length: MAX_ITEMS }, (_, i) => ({ key: `solicitacao/${i}` }));
    store.list = async () => ({ blobs: full });
    const refused = await send(complete());
    expect(refused.status).toBe(429);
  });

  it("endereço, método e imagem que não existem", async () => {
    const { get, options } = setup();
    expect((await handle(new Request(BASE, { method: "PUT" }), options)).status).toBe(405);
    expect((await get("/nada")).status).toBe(404);
    expect((await get("/00000000-0000-4000-8000-000000000099/imagem")).status).toBe(404);
  });
});
