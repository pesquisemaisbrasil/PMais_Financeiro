import { BANNER_HEIGHT, readTestEnvironment } from "@/lib/testEnvironment";

/**
 * Faixa fixa no topo do ambiente de teste publicado: ele só tem dados fictícios, e a faixa lembra
 * disso a quem for digitar. Leva de volta ao protótipo quando o endereço dele está configurado.
 */
export function TestEnvironmentBanner() {
  const { banner, prototypeUrl } = readTestEnvironment();
  if (!banner) return null;
  return (
    <div
      role="status"
      style={{ height: BANNER_HEIGHT }}
      className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-brand-roxo/10 px-3 text-center text-xs font-semibold text-brand-roxo print:hidden"
    >
      <span>Ambiente de teste com dados fictícios. Não digite dado real.</span>
      {prototypeUrl && (
        // Endereço comum, não <Link>: o protótipo fica fora do caminho deste app (basePath).
        <a href={prototypeUrl} className="underline underline-offset-2 hover:opacity-80">
          Voltar ao protótipo
        </a>
      )}
    </div>
  );
}
