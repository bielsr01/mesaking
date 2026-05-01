import { Bell, BellRing } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { brl } from "@/lib/format";
import type { NotificationItem } from "@/hooks/useNewOrderNotifications";
import { cn } from "@/lib/utils";

interface Props {
  notifications: NotificationItem[];
  unreadCount: number;
  pulse: boolean;
  onOpenOrders: () => void;
  onMarkAllRead: () => void;
  onClear: () => void;
}

function timeAgo(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s atrás`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}min atrás`;
  const h = Math.floor(m / 60);
  return `${h}h atrás`;
}

export function NotificationsBell({ notifications, unreadCount, pulse, onOpenOrders, onMarkAllRead, onClear }: Props) {
  const hasUnread = unreadCount > 0;

  return (
    <Popover onOpenChange={(o) => o && onMarkAllRead()}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative transition-colors",
            hasUnread && "text-destructive hover:text-destructive",
            pulse && "animate-pulse"
          )}
          aria-label="Notificações"
        >
          {hasUnread ? <BellRing className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
          {hasUnread && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold grid place-items-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
          {pulse && (
            <span className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-destructive animate-ping" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <div className="font-semibold text-sm">Notificações</div>
            {pulse && (
              <div className="text-xs text-destructive font-medium animate-fade-in">Novo pedido recebido!</div>
            )}
          </div>
          {notifications.length > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClear}>Limpar</Button>
          )}
        </div>
        <ScrollArea className="max-h-80">
          {notifications.length === 0 ? (
            <div className="py-10 px-4 text-center text-sm text-muted-foreground">Sem notificações ainda.</div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={onOpenOrders}
                  className="w-full text-left px-4 py-3 hover:bg-muted/60 transition-colors flex flex-col gap-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      Novo pedido {n.orderNumber ? `#${n.orderNumber}` : ""}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {n.customerName ?? "Cliente"} {n.total != null && `• ${brl(n.total)}`}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
