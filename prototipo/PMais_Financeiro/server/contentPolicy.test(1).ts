import { describe, expect, it } from "vitest";
import { contentPolicy } from "./security/contentPolicy";

describe("CSP da entrega informativa", () => {
  it("declara origem padrão e controles explícitos de scripts, estilos, imagens e conexões", () => {
    const policy = contentPolicy(false);
    for (const directive of ["default-src 'self'", "script-src", "style-src", "font-src", "img-src", "connect-src", "object-src 'none'", "form-action 'self'"]) {
      expect(policy).toContain(directive);
    }
  });
  it("preserva embedding e admite recursos HTTPS da plataforma sem host CDN obsoleto", () => {
    expect(contentPolicy(false)).not.toContain("frame-ancestors");
    expect(contentPolicy(false)).toContain("script-src 'self' 'unsafe-inline' https:");
  });
  it("admite HMR WebSocket somente na variante de desenvolvimento", () => {
    expect(contentPolicy(true)).toContain(" ws: wss:");
    expect(contentPolicy(false)).not.toContain(" ws:");
  });
});
