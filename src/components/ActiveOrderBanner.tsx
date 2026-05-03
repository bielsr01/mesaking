import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { brl, orderStatusLabel } from "@/lib/format";
import { Check, ChefHat, Clock, Package, Truck, X, ChevronRight, ListOrdered } from "lucide-react";

const STEPS = ["pending", "accepted", "preparing", "out_for_delivery", "awaiting_pickup", "delivered"] as const;
const ICONS: Record<string, any> = {
  pending: Clock, accepted: Check, preparing: Package, out_for_delivery: Truck, awaiting_pickup: Package, delivered: ChefHat, cancelled: X,
};

const storageKey = (restaurantId: string) => `mesapro:active-order:${restaurantId}`;

function readTokens(restaurantId: string): string[] {
  try {
    const raw = localStorage.getItem(storageKey(restaurantId));
    if (!raw) return [];
    if (raw.startsWith("[")) {
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr.filter((t) => typeof t === "string") : [];
    }
    // legado: token único como string
    return [raw];
  } catch { return []; }
}

function writeTokens(restaurantId: string, tokens: string[]) {
  try {
    if (tokens.length === 0) localStorage.removeItem(storageKey(restaurantId));
    else localStorage.setItem(storageKey(restaurantId), JSON.stringify(tokens));
  } catch {}
}

export function setActiveOrder(restaurantId: string, token: string) {
  const cur = readTokens(restaurantId);
  if (!cur.includes(token)) cur.push(token);
  writeTokens(restaurantId, cur);
  window.dispatchEvent(new CustomEvent("mesapro:active-order-changed", { detail: { restaurantId } }));
}

interface OrderRow {
  id: string;
  status: string;
  total: number;
  public_token: string;
  created_at: string;
  order_number?: number | null;
}

export function ActiveOrderBanner({ restaurantId }: { restaurantId: string }) {
  const [tokens, setTokens] = useState<string[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [listOpen, setListOpen] = useState(false);

  useEffect(() => {
    const read = () => setTokens(readTokens(restaurantId));
    read();
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.restaurantId === restaurantId) read();
    };
    window.addEventListener("mesapro:active-order-changed", handler);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("mesapro:active-order-changed", handler);
      window.removeEventListener("storage", read);
    };
  }, [restaurantId]);

  useEffect(() => {
    if (tokens.length === 0) { setOrders([]); return; }
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from("orders")
        .select("id,status,total,public_token,created_at,order_number")
        .in("public_token", tokens);
      if (!active) return;
      const found = (data ?? []) as OrderRow[];
      // remove tokens não encontrados (ex: pedido apagado)
      const foundTokens = new Set(found.map((o) => o.public_token));
      const cleaned = tokens.filter((t) => foundTokens.has(t));
      if (cleaned.length !== tokens.length) writeTokens(restaurantId, cleaned);
      setOrders(found.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)));
    };
    load();
    const ch = supabase.channel(`active-orders-${restaurantId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
        const row: any = payload.new;
        if (!row?.public_token || !tokens.includes(row.public_token)) return;
        setOrders((prev) => prev.map((o) => (o.public_token === row.public_token ? { ...o, ...row } : o)));
      })
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [tokens, restaurantId]);

  if (orders.length === 0) return null;

  const dismiss = (token: string) => {
    const next = readTokens(restaurantId).filter((t) => t !== token);
    writeTokens(restaurantId, next);
    setTokens(next);
    setOrders((prev) => prev.filter((o) => o.public_token !== token));
  };

  // Se houver 2+ pedidos, mostra card resumido com botão "Ver"
  if (orders.length > 1) {
    return (
      <div className="px-3">
        <Card className="border-primary/40 shadow-elegant bg-card">
          <div className="p-3 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full grid place-items-center shrink-0 bg-primary text-primary-foreground">
              <ListOrdered className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm">{orders.length} pedidos ativos</div>
              <div className="text-xs text-muted-foreground">Toque em "Ver" para acompanhar cada um</div>
            </div>
            <Button size="sm" onClick={() => setListOpen(true)} className="shrink-0">
              Ver <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </Card>

        <Dialog open={listOpen} onOpenChange={setListOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Seus pedidos ativos</DialogTitle>
              <DialogDescription>Selecione um pedido para ver os detalhes.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {orders.map((o) => {
                const Icon = ICONS[o.status] ?? Clock;
                const finished = o.status === "delivered" || o.status === "cancelled";
                return (
                  <Card key={o.id} className="p-3 flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full grid place-items-center shrink-0 ${o.status === "cancelled" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {o.order_number != null && <span className="font-mono text-xs font-semibold">#{o.order_number}</span>}
                        <Badge variant={o.status === "cancelled" ? "destructive" : "secondary"} className="text-xs">
                          {orderStatusLabel[o.status]}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground">{brl(o.total)}</div>
                    </div>
                    <Button asChild size="sm" onClick={() => setListOpen(false)}>
                      <Link to={`/pedido/${o.public_token}`}>Ver</Link>
                    </Button>
                    {finished && (
                      <Button size="icon" variant="ghost" onClick={() => dismiss(o.public_token)} aria-label="Dispensar">
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </Card>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Caso 1 pedido: layout original
  const order = orders[0];
  const finished = order.status === "delivered" || order.status === "cancelled";
  const idx = STEPS.indexOf(order.status as any);
  const Icon = ICONS[order.status] ?? Clock;

  return (
    <div className="px-3">
      <Card className="border-primary/40 shadow-elegant bg-card">
        <div className="p-3 flex items-center gap-3">
          <div className={`w-10 h-10 rounded-full grid place-items-center shrink-0 ${order.status === "cancelled" ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">Seu pedido</span>
              <Badge variant={order.status === "cancelled" ? "destructive" : "secondary"} className="text-xs">
                {orderStatusLabel[order.status]}
              </Badge>
            </div>
            {!finished && (
              <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${((idx + 1) / STEPS.length) * 100}%` }} />
              </div>
            )}
            <div className="text-xs text-muted-foreground mt-1">Total {brl(order.total)}</div>
          </div>
          <Button asChild size="sm" className="shrink-0">
            <Link to={`/pedido/${order.public_token}`}>
              Ver detalhes <ChevronRight className="w-4 h-4" />
            </Link>
          </Button>
          {finished && (
            <Button size="icon" variant="ghost" onClick={() => dismiss(order.public_token)} className="shrink-0" aria-label="Dispensar">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
