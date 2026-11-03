import { NextResponse, type NextRequest } from "next/server";

/**
 * Content-Security-Policy com nonce por pedido (handoff/06 §10). O nonce libera só os scripts que o
 * próprio Next gera; qualquer script injetado numa página (XSS) é bloqueado pelo navegador.
 * As páginas precisam ser dinâmicas para receber o nonce: o layout raiz chama `connection()`.
 */

function origin(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

export function buildCsp(nonce: string, isDev: boolean): string {
  const api = origin(process.env.NEXT_PUBLIC_API_URL);
  const connect = ["'self'", api, isDev ? "ws:" : ""].filter(Boolean).join(" ");
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Atributos style="" (Tailwind, Radix, sonner) não aceitam nonce: 'unsafe-inline' só em estilo
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${connect}`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  return directives.join("; ");
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce, process.env.NODE_ENV === "development");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  // Só em HTTPS: atrás do proxy, quem informa é o x-forwarded-proto.
  if (request.headers.get("x-forwarded-proto") === "https") {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
