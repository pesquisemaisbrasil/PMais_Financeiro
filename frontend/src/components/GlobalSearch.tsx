"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { searchAll } from "@/lib/api";
import { highlightParts, searchable, type SearchResult } from "@/lib/search";

/** O texto com as palavras buscadas marcadas. */
function Marked({ text, term }: { text: string; term: string }) {
  return (
    <>
      {highlightParts(text, term).map((part, index) =>
        part.match ? (
          <mark key={index} className="rounded-sm bg-brand-azul-deep/15 px-0.5 text-inherit">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        )
      )}
    </>
  );
}

/**
 * Busca em todo o sistema, no alto de todas as telas (pedido do Bruno, 18/11/2026; spec busca-geral):
 * "itau" mostra, separado por grupo, as contas a pagar e a receber, as notas, os projetos e os
 * cadastros em que a palavra aparece. Ctrl+K (ou ⌘K) leva o cursor para cá; Enter abre o primeiro.
 */
export function GlobalSearch() {
  const router = useRouter();
  const panelId = useId();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  // Ctrl+K / ⌘K em qualquer tela
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        input.current?.focus();
        input.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Clique fora fecha
  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  // Busca enquanto digita, um pouco depois da última tecla; a resposta antiga não passa por cima da nova
  useEffect(() => {
    if (!searchable(term)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setFailed(false);
      searchAll(term.trim(), controller.signal).then(
        (found) => {
          setResult(found);
          setLoading(false);
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          console.warn("busca geral falhou", error instanceof Error ? error.name : "erro");
          setFailed(true);
          setLoading(false);
        }
      );
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  function close() {
    setOpen(false);
    input.current?.blur();
  }

  function go(href: string) {
    close();
    router.push(href);
  }

  const ready = searchable(term);
  const current = ready && result && result.term === term.trim() ? result : null;
  const first = current?.groups[0]?.hits[0];

  return (
    <div ref={box} className="relative w-full max-w-xl">
      <Search
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-brand-cinza-escuro/50"
      />
      <Input
        ref={input}
        role="combobox"
        aria-label="Buscar em todo o sistema"
        aria-expanded={open && ready}
        aria-controls={panelId}
        aria-autocomplete="list"
        className="h-9 bg-card pl-9 pr-20"
        placeholder="Buscar em todo o sistema: contas, notas, projetos, clientes…"
        value={term}
        onChange={(event) => {
          setTerm(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") close();
          if (event.key === "Enter" && first) {
            event.preventDefault();
            go(first.href);
          }
        }}
      />
      <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {loading && <Spinner aria-label="Buscando" className="size-4 text-brand-cinza-escuro/60" />}
        {term ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Limpar a busca"
            onClick={() => {
              setTerm("");
              setResult(null);
              input.current?.focus();
            }}
          >
            <X size={14} />
          </Button>
        ) : (
          <span className="rounded border border-border px-1.5 text-[11px] text-muted-foreground">Ctrl K</span>
        )}
      </div>

      {open && term.trim() && (
        <div
          id={panelId}
          role="region"
          aria-label="Resultados da busca"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-card p-1.5 shadow-lg"
        >
          {!ready ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">Digite ao menos 2 letras.</p>
          ) : failed ? (
            <p className="px-3 py-2.5 text-sm text-red-700">Não deu para buscar agora. Tente de novo.</p>
          ) : !current ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">Buscando…</p>
          ) : !current.groups.length ? (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">Nada encontrado para “{current.term}”.</p>
          ) : (
            current.groups.map((group) => (
              <section key={group.key} aria-label={group.label} className="py-1">
                <h3 className="flex items-center justify-between px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>{group.label}</span>
                  <span className="tabular-nums">{group.total}</span>
                </h3>
                {group.hits.map((hit) => (
                  <Link
                    key={hit.href + hit.title}
                    href={hit.href}
                    onClick={close}
                    className="block rounded-lg px-3 py-1.5 outline-none hover:bg-muted focus-visible:bg-muted"
                  >
                    <span className="block truncate text-sm font-medium text-brand-cinza-escuro">
                      <Marked text={hit.title} term={current.term} />
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      <Marked text={hit.subtitle} term={current.term} />
                    </span>
                  </Link>
                ))}
                {group.total > group.hits.length && (
                  <Link
                    href={group.moreHref}
                    onClick={close}
                    className="block rounded-lg px-3 py-1.5 text-xs font-medium text-brand-azul-deep outline-none hover:bg-muted focus-visible:bg-muted"
                  >
                    Ver todos os {group.total} em {group.label}
                  </Link>
                )}
              </section>
            ))
          )}
        </div>
      )}
    </div>
  );
}
