"use client";

import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PAYABLES_CHANGED, formatDate } from "@/lib/payables";
import { listNotices, readNotice, unreadCount, type Notice } from "@/lib/receipts";
import { cn } from "@/lib/utils";

const REFRESH_MS = 60_000;

/** Sino de avisos da equipe: comprovante de pessoa fora do projeto, baixa recusada pelo Connect. */
export function NotificationsBell() {
  const router = useRouter();
  const [notices, setNotices] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    listNotices()
      .then(setNotices)
      .catch(() => undefined); // sem aviso, o sino só fica vazio: não vale um erro na tela
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS);
    // enviar ou confirmar comprovantes (e fechar o envio) avisa a lista, e o sino acompanha
    window.addEventListener(PAYABLES_CHANGED, load);
    return () => {
      clearInterval(timer);
      window.removeEventListener(PAYABLES_CHANGED, load);
    };
  }, [load]);

  const unread = unreadCount(notices);

  async function openNotice(notice: Notice) {
    setOpen(false);
    if (!notice.readAt) {
      await readNotice(notice.id).catch(() => undefined);
      load();
    }
    if (notice.link) router.push(notice.link);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) load();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={unread ? `Avisos, ${unread} não lidos` : "Avisos"}
          className="relative size-8 shrink-0 text-brand-cinza-escuro/70"
        >
          <Bell size={16} />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-[#f59e0b] px-1 text-[10px] font-bold leading-4 text-white">
              {unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent side="right" align="end" className="w-[340px] p-0">
        <div className="border-b border-border px-3.5 py-2.5 text-[13px] font-semibold">Avisos</div>
        {notices.length === 0 ? (
          <p className="px-3.5 py-6 text-center text-sm text-muted-foreground">Nenhum aviso por enquanto.</p>
        ) : (
          <ul className="max-h-[360px] overflow-y-auto">
            {notices.map((notice) => (
              <li key={notice.id}>
                <Button
                  variant="ghost"
                  onClick={() => openNotice(notice)}
                  className="h-auto w-full flex-col items-start gap-0.5 whitespace-normal rounded-none px-3.5 py-2.5 text-left"
                >
                  <span className={cn("text-[13px]", notice.readAt ? "font-normal" : "font-semibold")}>
                    {notice.title}
                  </span>
                  {notice.body && <span className="text-xs font-normal text-muted-foreground">{notice.body}</span>}
                  <span className="text-[11px] font-normal text-muted-foreground">
                    {formatDate(notice.createdAt)}
                    {!notice.readAt && " · novo"}
                  </span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
