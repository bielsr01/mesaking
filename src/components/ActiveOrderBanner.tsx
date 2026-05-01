import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { brl, orderStatusLabel } from "@/lib/format";
import { Check, ChefHat, Clock, Package, Truck, X, ChevronRight } from "lucide-react";

const STEPS = ["pending", "accepted", "preparing", "out_for_delivery", "awaiting_pickup", "delivered"] as const;
const ICONS: Record<string, any> = {
  pending: Clock, accepted: Check, preparing: Package, out_for_delivery: Truck, awaiting_pickup: Package, delivered: ChefHat, cancelled: X,
};

const storageKey = (restaurantId: string) => `mesapro:active-order:${restaurantId}`;

export function setActiveOrder(restaurantId: string, token: string) {
  try { localStorage.setItem(storageKey(restaurantId), token); } catch {}
  window.dispatchEvent(new CustomEvent("mesapro:active-order-changed", { detail: { restaurantId } }));
}

export function ActiveOrderBanner({ restaurantId }: { restaurantId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [order, setOrder] = useState<any | null>(null);

  useEffect(() => {
    const read = () => {
      try { setToken(localStorage.getItem(storageKey(restaurantId))); } catch { setToken(null); }
    };
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
    if (!token) { setOrder(null); return; }
    let active = true;
    const load = async () => {
      const { data } = await supabase.from("orders").select("id,status,total,public_token,created_at").eq("public_token", token).maybeSingle();
      if (!active) return;
      if (!data) {
        try { localStorage.removeItem(storageKey(restaurantId)); } catch {}
        setOrder(null);
        return;
      }
      setOrder(data);
    };
    load();
    const ch = supabase.channel(`active-order-${token}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, (payload) => {
        const row: any = payload.new;
        if (row?.public_token === token) setOrder((prev: any) => ({ ...(prev || {}), ...row }));
      })
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [token, restaurantId]);

  if (!order) return null;

  const finished = order.status === "delivered" || order.status === "cancelled";
  const idx = STEPS.indexOf(order.status);
  const Icon = ICONS[order.status] ?? Clock;

  const dismiss = () => {
    try { localStorage.removeItem(storageKey(restaurantId)); } catch {}
    setToken(null);
    setOrder(null);
  };

  return (
    <div className="px-3 pt-3">
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
            <Button size="icon" variant="ghost" onClick={dismiss} className="shrink-0" aria-label="Dispensar">
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
