"use client";

import { ImageIcon, Inbox, KeyRound, RefreshCw } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CARD, ErrorBox, Field, FormError, PageHeader, TD, TH, Tag } from "@/components/finance";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError, getFeedbackImage, listFeedback } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { DEMO, DEV_EMAIL } from "@/lib/demo/client";
import {
  FEEDBACK_TYPES,
  feedbackTypeLabel,
  pageLabel,
  saveFeedbackKey,
  savedFeedbackKey,
  type FeedbackItem,
} from "@/lib/feedback";
import { useFormAction } from "@/lib/use-form-action";
import { cn } from "@/lib/utils";

const TYPE_COLORS = { bug: "vermelho", regra: "ambar", melhoria: "azul" } as const;

const when = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/** As solicitações da equipe, só no acesso do desenvolvimento da demonstração. */
export default function FeedbackPage() {
  const { user } = useAuth();
  if (!DEMO || user?.email !== DEV_EMAIL) {
    return (
      <main className="mx-auto w-full max-w-[1280px] px-6 pb-16 pt-8">
        <PageHeader title="Solicitações" icon={Inbox} />
        <p className="text-sm text-muted-foreground">
          Esta tela é do acesso do desenvolvimento, na versão de demonstração.
        </p>
      </main>
    );
  }
  return <FeedbackInbox />;
}

function FeedbackInbox() {
  const [key, setKey] = useState<string | null>(savedFeedbackKey);
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [opened, setOpened] = useState<FeedbackItem | null>(null);
  // Atualizar: cada clique pede a lista de novo
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((current) => current + 1), []);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    listFeedback(key).then(
      (found) => {
        if (!alive) return;
        setItems(found);
        setError(null);
      },
      (err) => {
        if (!alive) return;
        if (err instanceof ApiError && err.status === 401) {
          saveFeedbackKey(null);
          setKey(null);
          setNotice("A chave mudou. Digite a chave nova.");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Não foi possível carregar as solicitações.");
      }
    );
    return () => {
      alive = false;
    };
  }, [key, version]);

  function forgetKey() {
    saveFeedbackKey(null);
    setKey(null);
    setItems(null);
    setNotice(null);
  }

  if (!key) {
    return (
      <main className="mx-auto w-full max-w-[1280px] px-6 pb-16 pt-8">
        <PageHeader title="Solicitações" icon={Inbox} />
        <KeyForm
          notice={notice}
          onOpened={(typed, found) => {
            setKey(typed);
            setItems(found);
            setNotice(null);
          }}
        />
      </main>
    );
  }

  const counts = FEEDBACK_TYPES.map((option) => ({
    ...option,
    count: (items ?? []).filter((item) => item.type === option.id).length,
  }));

  return (
    <main className="mx-auto w-full max-w-[1280px] px-6 pb-16 pt-8">
      <PageHeader
        title="Solicitações"
        icon={Inbox}
        subtitle="O que a equipe enviou pelo botão Enviar solicitação, da mais nova para a mais antiga."
        actions={
          <>
            <Button variant="outline" onClick={reload}>
              <RefreshCw size={16} />
              Atualizar
            </Button>
            <Button variant="outline" onClick={forgetKey}>
              <KeyRound size={16} />
              Trocar chave
            </Button>
          </>
        }
      />
      {error && (
        <div className="mb-4">
          <ErrorBox message={error} onRetry={reload} />
        </div>
      )}
      {!items && !error && (
        <div className="flex justify-center p-8">
          <Spinner aria-label="Carregando" className="size-6 text-brand-cinza-escuro/70" />
        </div>
      )}
      {items && (
        <>
          <div className="mb-4 flex flex-wrap gap-2" aria-label="Quantas de cada tipo">
            {counts.map((option) => (
              <Tag key={option.id} color={TYPE_COLORS[option.id]}>
                {option.label}: {option.count}
              </Tag>
            ))}
          </div>
          <div className={cn(CARD, "overflow-hidden")}>
            {items.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Nenhuma solicitação ainda.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={TH}>Quando</TableHead>
                    <TableHead className={TH}>Tipo</TableHead>
                    <TableHead className={TH}>Descrição</TableHead>
                    <TableHead className={TH}>Tela</TableHead>
                    <TableHead className={TH}>Quem</TableHead>
                    <TableHead className={TH}>Imagem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className={cn(TD, "whitespace-nowrap")}>{when(item.createdAt)}</TableCell>
                      <TableCell className={TD}>
                        <Tag color={TYPE_COLORS[item.type] ?? "cinza"}>{feedbackTypeLabel(item.type)}</Tag>
                      </TableCell>
                      <TableCell className={cn(TD, "min-w-[280px] whitespace-pre-wrap")}>{item.description}</TableCell>
                      <TableCell className={TD}>{pageLabel(item.page)}</TableCell>
                      <TableCell className={TD}>{item.sender || "—"}</TableCell>
                      <TableCell className={TD}>
                        <Button variant="outline" size="sm" onClick={() => setOpened(item)}>
                          <ImageIcon size={14} />
                          Ver imagem
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}
      {opened && <ImageDialog item={opened} feedbackKey={key} onClose={() => setOpened(null)} />}
    </main>
  );
}

/** A chave do desenvolvimento (a que está no Netlify): sem ela, a lista não sai. */
function KeyForm({
  notice,
  onOpened,
}: {
  notice: string | null;
  onOpened: (key: string, items: FeedbackItem[]) => void;
}) {
  const { error, submitting, run } = useFormAction();
  const [typed, setTyped] = useState("");

  function submit(event: FormEvent) {
    event.preventDefault();
    const key = typed.trim();
    if (!key) return;
    void run(async () => {
      const found = await listFeedback(key);
      saveFeedbackKey(key);
      onOpened(key, found);
    });
  }

  return (
    <form onSubmit={submit} className={cn(CARD, "flex max-w-md flex-col gap-3 p-5")}>
      <Field label="Chave de acesso *" id="chave-solicitacoes" hint="A chave do desenvolvimento, a mesma configurada no Netlify.">
        <Input
          id="chave-solicitacoes"
          type="password"
          autoComplete="off"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
        />
      </Field>
      <FormError message={error ?? notice} />
      <Button type="submit" disabled={submitting || !typed.trim()} className="self-start">
        <KeyRound size={16} />
        {submitting ? "Abrindo…" : "Abrir solicitações"}
      </Button>
    </form>
  );
}

/** A imagem vem com a chave no cabeçalho: por isso é baixada e mostrada daqui do navegador. */
function ImageDialog({ item, feedbackKey, onClose }: { item: FeedbackItem; feedbackKey: string; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let created: string | null = null;
    let alive = true;
    getFeedbackImage(item.id, feedbackKey).then(
      (blob) => {
        if (!alive) return;
        created = URL.createObjectURL(blob);
        setUrl(created);
      },
      (err) => alive && setError(err instanceof ApiError ? err.message : "Não foi possível abrir a imagem.")
    );
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [item.id, feedbackKey]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[960px]">
        <DialogHeader>
          <DialogTitle>{feedbackTypeLabel(item.type)}</DialogTitle>
          <DialogDescription>
            {when(item.createdAt)} · {pageLabel(item.page)}
            {item.sender ? ` · ${item.sender}` : ""}
          </DialogDescription>
        </DialogHeader>
        {error && <FormError message={error} />}
        {!url && !error && (
          <div className="flex justify-center p-8">
            <Spinner aria-label="Carregando a imagem" className="size-6 text-brand-cinza-escuro/70" />
          </div>
        )}
        {url && (
          <Image
            src={url}
            alt={`Imagem da solicitação: ${item.description.slice(0, 80)}`}
            width={1280}
            height={720}
            unoptimized
            className="h-auto w-full rounded-lg border border-border"
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
