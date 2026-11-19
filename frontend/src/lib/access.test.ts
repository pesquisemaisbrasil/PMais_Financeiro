import { describe, expect, it } from "vitest";
import { demandFileProblem, isAdmin, isSuperAdmin, pastedDemandImage, screenAllowed, screenOf } from "./access";

describe("níveis de acesso", () => {
  it("super admin também é admin; usuário não é nenhum dos dois", () => {
    expect([isAdmin("superadmin"), isAdmin("admin"), isAdmin("financeiro")]).toEqual([true, true, false]);
    expect([isSuperAdmin("superadmin"), isSuperAdmin("admin")]).toEqual([true, false]);
  });
});

describe("telas bloqueadas", () => {
  it("cada endereço do menu tem a sua tela; Cadastros vale para todas as abas", () => {
    expect(screenOf("/contas-a-pagar")).toBe("contas-a-pagar");
    expect(screenOf("/contas-a-receber/")).toBe("contas-a-receber");
    expect(screenOf("/cadastros?aba=suppliers")).toBe("cadastros");
    expect(screenOf("/relatorios/projeto")).toBe("relatorio-projeto");
    expect(screenOf("/")).toBeNull();
    expect(screenOf("/acessos")).toBeNull();
  });

  it("a tela bloqueada some; o resto continua", () => {
    const user = { blockedScreens: ["cadastros", "divergencias"] };
    expect(screenAllowed(user, "/cadastros?aba=units")).toBe(false);
    expect(screenAllowed(user, "/divergencias")).toBe(false);
    expect(screenAllowed(user, "/contas-a-pagar")).toBe(true);
    expect(screenAllowed(user, "/")).toBe(true);
    expect(screenAllowed({}, "/cadastros")).toBe(true);
  });
});

describe("anexo da demanda", () => {
  const file = (type: string, size = 10) => new File([new Uint8Array(size)], "x", { type });

  it("aceita imagem e PDF de até 10 MB", () => {
    expect(demandFileProblem(file("image/png"))).toBeNull();
    expect(demandFileProblem(file("application/pdf"))).toBeNull();
    expect(demandFileProblem(file("image/gif"))).toBe("Anexe uma imagem (PNG, JPG ou WEBP) ou um PDF.");
    expect(demandFileProblem(file("image/png", 10 * 1024 * 1024 + 1))).toBe(
      "O anexo passa de 10 MB. Envie um arquivo menor."
    );
  });

  it("o print colado vira o anexo, com nome próprio", () => {
    const pasted = pastedDemandImage({ files: [file("image/png")] as unknown as FileList });
    expect(pasted?.name).toBe("print-colado.png");
    expect(pastedDemandImage({ files: [file("text/plain")] as unknown as FileList })).toBeNull();
    expect(pastedDemandImage(null)).toBeNull();
  });
});
