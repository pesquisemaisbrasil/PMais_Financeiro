import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // O E2E local usa outra pasta de build: com a mesma, ele derrubava o servidor de dev (porta 3010).
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // O botão de desenvolvimento do Next ficava por cima do "Sair" e do botão de recolher o menu.
  devIndicators: false,
  // A CSP com nonce e o HSTS saem por pedido, em src/proxy.ts.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
