import { describe, expect, it } from "vitest";
import { MAX_DOCUMENT_BYTES, checkDocument, fileSize } from "./documents";

describe("checkDocument", () => {
  it("aceita os tipos permitidos, em qualquer caixa", () => {
    for (const name of ["nota.pdf", "FOTO.JPG", "a.jpeg", "b.png", "c.xlsx", "d.docx", "e.xml", "nota fiscal 58.PDF"]) {
      expect(checkDocument({ name, size: 1000 })).toBeNull();
    }
  });

  it("recusa o que não é permitido, sem extensão ou acima de 20 MB", () => {
    const message = "envie PDF, imagem, planilha, documento ou XML de até 20 MB";
    expect(checkDocument({ name: "programa.exe", size: 1000 })).toBe(`programa.exe: ${message}`);
    expect(checkDocument({ name: "sem-extensao", size: 1000 })).toBe(`sem-extensao: ${message}`);
    expect(checkDocument({ name: "livro.xls", size: 1000 })).toBe(`livro.xls: ${message}`);
    expect(checkDocument({ name: "grande.pdf", size: MAX_DOCUMENT_BYTES + 1 })).toBe(`grande.pdf: ${message}`);
    expect(checkDocument({ name: "limite.pdf", size: MAX_DOCUMENT_BYTES })).toBeNull();
  });

  it("recusa arquivo vazio com mensagem própria", () => {
    expect(checkDocument({ name: "vazio.pdf", size: 0 })).toBe("vazio.pdf: o arquivo está vazio");
  });
});

describe("fileSize", () => {
  it("mostra KB até 1 MB e MB com vírgula depois", () => {
    expect(fileSize(10)).toBe("1 KB");
    expect(fileSize(340 * 1024)).toBe("340 KB");
    expect(fileSize(1.4 * 1024 * 1024)).toBe("1,4 MB");
    expect(fileSize(20 * 1024 * 1024)).toBe("20,0 MB");
  });
});
