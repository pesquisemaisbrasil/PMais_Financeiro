import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_IMAGE_BYTES,
  feedbackTypeLabel,
  imageProblem,
  pageLabel,
  pastedImage,
  saveFeedbackKey,
  savedFeedbackKey,
} from "./feedback";

const image = (type = "image/png", size = 10) => new File([new Uint8Array(size)], "print.png", { type });

describe("solicitações: o que a tela confere antes de enviar", () => {
  it("aceita print em PNG, JPG, WEBP ou GIF de até 4 MB", () => {
    expect(imageProblem(image())).toBeNull();
    expect(imageProblem(image("image/jpeg"))).toBeNull();
    expect(imageProblem(image("application/pdf"))).toBe("Anexe uma imagem PNG, JPG, WEBP ou GIF (um print da tela).");
    expect(imageProblem(image("image/svg+xml"))).not.toBeNull();
    expect(imageProblem(image("image/png", MAX_IMAGE_BYTES + 1))).toBe(
      "A imagem passa de 4 MB. Recorte um pedaço menor da tela."
    );
  });

  it("o Ctrl+V com um print vira a imagem anexada; colar texto não muda nada", () => {
    const pasted = pastedImage({ files: [image("image/jpeg")] as unknown as FileList });
    expect(pasted?.name).toBe("print-colado.jpg");
    expect(pasted?.type).toBe("image/jpeg");
    expect(pastedImage({ files: [] as unknown as FileList })).toBeNull();
    expect(pastedImage(null)).toBeNull();
  });

  it("a tela de onde veio aparece como no título dela", () => {
    expect(pageLabel("/contas-a-pagar/")).toBe("Financeiro - Contas a pagar");
    expect(pageLabel("/cadastros?aba=suppliers")).toBe("Cadastros - Fornecedores");
    expect(pageLabel("/cadastros/")).toBe("Cadastros - Empresas");
    expect(pageLabel("/")).toBe("Início");
    expect(pageLabel("/solicitacoes")).toBe("/solicitacoes");
  });

  it("o nome de cada tipo", () => {
    expect(feedbackTypeLabel("bug")).toBe("Correção de bug");
    expect(feedbackTypeLabel("regra")).toBe("Correção de regra");
    expect(feedbackTypeLabel("melhoria")).toBe("Melhoria");
  });
});

describe("a chave do desenvolvimento no navegador", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("guarda, lê e apaga", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    saveFeedbackKey("minha-chave");
    expect(savedFeedbackKey()).toBe("minha-chave");
    saveFeedbackKey(null);
    expect(savedFeedbackKey()).toBeNull();
  });

  it("sem armazenamento (janela privativa) não quebra: só pede a chave de novo", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    });
    expect(savedFeedbackKey()).toBeNull();
    expect(() => saveFeedbackKey("x")).not.toThrow();
  });
});
