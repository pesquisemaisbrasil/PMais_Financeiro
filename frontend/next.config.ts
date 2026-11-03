import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // shortcut: sem CSP nem HSTS; o CSP com nonce e o HSTS no proxy entram na PF-15 (handoff/06 §10).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
