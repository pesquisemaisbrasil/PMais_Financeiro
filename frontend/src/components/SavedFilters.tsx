"use client";

import { Star, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/lib/auth-context";
import {
  MAX_FAVORITES,
  MAX_NAME,
  addFavorite,
  favoritesKey,
  pick,
  readFavorites,
  removeFavorite,
  writeFavorites,
  type Favorite,
} from "@/lib/favorites";

/**
 * Favoritos da tela: guarda `value` (filtros, colunas e opções, sem as datas) com um nome e devolve
 * em `onApply`, já conferido contra o formato de agora. Fica só neste navegador (PF-76).
 */
export function SavedFilters<T extends Record<string, unknown>>({
  screen,
  value,
  onApply,
  className,
}: {
  screen: string;
  value: T;
  onApply: (value: T) => void;
  className?: string;
}) {
  const { user } = useAuth();
  const key = favoritesKey(user?.id, screen);
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Favorite[]>([]);
  const [name, setName] = useState("");

  function toggle(next: boolean) {
    // lido ao abrir: o navegador só existe no cliente, e outra aba pode ter mudado a lista
    if (next) {
      setList(readFavorites(key));
      setName("");
    }
    setOpen(next);
  }

  function store(next: Favorite[], done: string): boolean {
    if (!writeFavorites(key, next)) {
      toast.error("Este navegador não deixou guardar o favorito");
      return false;
    }
    setList(next);
    toast.success(done);
    return true;
  }

  function save(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    const next = addFavorite(list, name, value);
    if (!next) {
      toast.error(`Cada tela guarda até ${MAX_FAVORITES} favoritos. Apague um antes de salvar outro`);
      return;
    }
    if (store(next, next.length === list.length ? "Favorito atualizado" : "Favorito salvo")) setName("");
  }

  return (
    <Popover open={open} onOpenChange={toggle}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={className}>
          <Star aria-hidden="true" />
          Favoritos
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <p className="text-sm font-semibold text-brand-cinza-escuro">Favoritos desta tela</p>
        {list.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">Nenhum favorito ainda.</p>
        ) : (
          <ul aria-label="Favoritos desta tela" className="mt-2 max-h-60 space-y-1 overflow-y-auto">
            {list.map((favorite) => (
              <li key={favorite.name} className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-w-0 flex-1 justify-start font-normal"
                  onClick={() => {
                    onApply(pick(value, favorite.value));
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{favorite.name}</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Apagar o favorito ${favorite.name}`}
                  onClick={() => store(removeFavorite(list, favorite.name), "Favorito apagado")}
                >
                  <X aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Separator className="my-3" />
        <form onSubmit={save} className="space-y-2">
          <Label htmlFor={`favorito-${screen}`}>Salvar os filtros de agora</Label>
          <div className="flex gap-2">
            <Input
              id={`favorito-${screen}`}
              value={name}
              maxLength={MAX_NAME}
              placeholder="Ex.: Despesas da Matriz"
              onChange={(event) => setName(event.target.value)}
            />
            <Button type="submit" disabled={!name.trim()}>
              Salvar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Fica só neste navegador. As datas não entram: o favorito vale para o período que estiver na tela.
          </p>
        </form>
      </PopoverContent>
    </Popover>
  );
}
