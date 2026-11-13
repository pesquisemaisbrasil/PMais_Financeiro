import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import { connection } from "next/server";
import { DemoGate } from "@/components/Demo";
import { TestEnvironmentBanner } from "@/components/TestEnvironmentBanner";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-context";
import { BANNER_HEIGHT, readTestEnvironment } from "@/lib/testEnvironment";
import "./globals.css";

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "P+ Financeiro",
  description: "Sistema financeiro da Pesquise+",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Renderização dinâmica: o Next só coloca o nonce da CSP (src/proxy.ts) nos scripts assim.
  // A versão de demonstração é estática (a CSP dela vem do netlify.toml) e não pode ser dinâmica.
  if (process.env.NEXT_PUBLIC_DEMO !== "1") await connection();
  return (
    <html lang="pt-BR" className={`${openSans.variable} h-full antialiased`}>
      {/* --faixa: a altura da faixa do ambiente de teste (0 sem ela); o menu lateral desce esse tanto */}
      <body
        className="min-h-full flex flex-col"
        style={{ "--faixa": readTestEnvironment().banner ? BANNER_HEIGHT : "0px" } as React.CSSProperties}
      >
        <TestEnvironmentBanner />
        <DemoGate>
          <AuthProvider>{children}</AuthProvider>
        </DemoGate>
        <Toaster position="bottom-center" richColors />
      </body>
    </html>
  );
}
