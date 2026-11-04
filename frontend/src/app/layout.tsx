import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import { connection } from "next/server";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-context";
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
  await connection();
  return (
    <html lang="pt-BR" className={`${openSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
        <Toaster position="bottom-center" richColors />
      </body>
    </html>
  );
}
