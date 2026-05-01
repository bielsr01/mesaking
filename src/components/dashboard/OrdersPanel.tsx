import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { brl, orderStatusLabel, getNextStatus, paymentLabel, formatPhone, orderTypeLabel } from "@/lib/format";
import { toast } from "sonner";
import { Bike, Clock, MapPin, Phone, Store, User, X } from "lucide-react";

interface Order {
  id: string;
  customer_name: string;
  customer_phone: string;
  address_street: string;
  address_number: string;
  address_complement: string | null;
  address_neighborhood: string;
  address_city: string;
  address_notes: string | null;
  payment_method: string;
  change_for: number | null;
  total: number;
  status: string;
  order_type: "delivery" | "pickup";
  created_at: string;
}

interface Item {
  id: string;
  order_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  notes: string | null;
}

const FILTERS = [
  { value: "pending", label: "Novos" },
  { value: "preparing", label: "Em preparo" },
  { value: "out_for_delivery", label: "Em entrega" },
  { value: "awaiting_pickup", label: "Aguardando retirada" },
  { value: "delivered", label: "Entregues" },
  { value: "active", label: "Ativos" },
  { value: "all", label: "Todos" },
];

export const ordersKey = (rid: string) => ["orders", rid] as const;

export async function fetchOrders(restaurantId: string): Promise<{ orders: Order[]; items: Record<string, Item[]> }> {
  const { data } = await supabase
    .from("orders")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .order("created_at", { ascending: false })
    .limit(100);
  const orders = (data ?? []) as Order[];
  const ids = orders.map((o) => o.id);
  let grouped: Record<string, Item[]> = {};
  if (ids.length) {
    const { data: its } = await supabase.from("order_items").select("*").in("order_id", ids);
    (its ?? []).forEach((it) => { (grouped[it.order_id] ||= []).push(it as Item); });
  }
  return { orders, items: grouped };
}

export function OrdersPanel({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("pending");
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ordersKey(restaurantId),
    queryFn: () => fetchOrders(restaurantId),
    staleTime: 10_000,
  });

  const orders = data?.orders ?? [];
  const items = data?.items ?? {};

  useEffect(() => {
    const ch = supabase
      .channel(`orders-${restaurantId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, () => {
        toast.success("Novo pedido recebido!");
        try { new Audio("data:audio/wav;base64,UklGRl9vAAA=").play().catch(() => {}); } catch {}
        setFilter("pending"); // auto-switch to new orders tab
        qc.invalidateQueries({ queryKey: ordersKey(restaurantId) });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, (payload) => {
        // Apply update straight from the payload — instant, no refetch needed
        const row = payload.new as Order;
        qc.setQueryData<{ orders: Order[]; items: Record<string, Item[]> }>(ordersKey(restaurantId), (prev) => {
          if (!prev) return prev;
          return { ...prev, orders: prev.orders.map((o) => (o.id === row.id ? { ...o, ...row } : o)) };
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, (payload) => {
        const id = (payload.old as any)?.id;
        qc.setQueryData<{ orders: Order[]; items: Record<string, Item[]> }>(ordersKey(restaurantId), (prev) => {
          if (!prev) return prev;
          return { ...prev, orders: prev.orders.filter((o) => o.id !== id) };
        });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => {
        qc.invalidateQueries({ queryKey: ordersKey(restaurantId) });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [restaurantId, qc]);

  const patchOrder = (id: string, patch: Partial<Order>) => {
    qc.setQueryData<{ orders: Order[]; items: Record<string, Item[]> }>(ordersKey(restaurantId), (prev) => {
      if (!prev) return prev;
      return { ...prev, orders: prev.orders.map((o) => (o.id === id ? { ...o, ...patch } : o)) };
    });
  };

  const advance = async (o: Order) => {
    const next = getNextStatus(o.status, o.order_type);
    if (!next) return;
    const prevStatus = o.status;
    patchOrder(o.id, { status: next }); // optimistic
    const { error } = await supabase.from("orders").update({ status: next as any }).eq("id", o.id);
    if (error) {
      patchOrder(o.id, { status: prevStatus });
      toast.error(error.message);
    } else {
      toast.success(`Pedido movido para "${orderStatusLabel[next]}"`);
    }
  };

  const cancel = async (o: Order) => {
    const prevStatus = o.status;
    patchOrder(o.id, { status: "cancelled" }); // optimistic
    const { error } = await supabase.from("orders").update({ status: "cancelled" as any }).eq("id", o.id);
    if (error) {
      patchOrder(o.id, { status: prevStatus });
      toast.error(error.message);
    } else {
      toast.success("Pedido cancelado");
    }
  };

  const filtered = orders.filter((o) => {
    if (filter === "all") return true;
    if (filter === "active") return !["delivered", "cancelled"].includes(o.status);
    return o.status === filter;
  });

  const statusColor = (s: string) => {
    if (s === "pending") return "bg-warning text-warning-foreground";
    if (s === "delivered") return "bg-success text-success-foreground";
    if (s === "cancelled") return "bg-destructive text-destructive-foreground";
    return "bg-primary text-primary-foreground";
  };

  const counts: Record<string, number> = {
    pending: orders.filter((o) => o.status === "pending").length,
    preparing: orders.filter((o) => o.status === "preparing").length,
    out_for_delivery: orders.filter((o) => o.status === "out_for_delivery").length,
    delivered: orders.filter((o) => o.status === "delivered").length,
    active: orders.filter((o) => !["delivered", "cancelled"].includes(o.status)).length,
    all: orders.length,
  };

  return (
    <div className="space-y-4">
      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList className="flex-wrap h-auto">
          {FILTERS.map((f) => (
            <TabsTrigger key={f.value} value={f.value} className="gap-2">
              {f.label}
              <Badge
                variant={f.value === "pending" && counts[f.value] > 0 ? "destructive" : "secondary"}
                className="h-5 min-w-5 px-1.5 text-xs"
              >
                {counts[f.value] ?? 0}
              </Badge>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {isLoading && orders.length === 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum pedido nesta categoria.</CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((o) => (
            <Card key={o.id} className="shadow-soft">
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold flex items-center gap-2"><User className="w-4 h-4" />{o.customer_name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1 flex-wrap">
                      <Clock className="w-3 h-3" />
                      {new Date(o.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                      {" às "}
                      {new Date(o.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      <Phone className="w-3 h-3 ml-2" />{formatPhone(o.customer_phone)}
                    </div>
                  </div>
                  <Badge className={statusColor(o.status)}>{orderStatusLabel[o.status]}</Badge>
                </div>

                <div className="text-sm flex gap-2">
                  <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div>
                    {o.address_street}, {o.address_number} {o.address_complement && `- ${o.address_complement}`}<br />
                    <span className="text-muted-foreground">{o.address_neighborhood} • {o.address_city}</span>
                    {o.address_notes && <div className="text-xs italic text-muted-foreground mt-0.5">"{o.address_notes}"</div>}
                  </div>
                </div>

                <div className="border-t pt-3 space-y-1 text-sm">
                  {(items[o.id] ?? []).map((it) => (
                    <div key={it.id} className="flex justify-between gap-2">
                      <span><span className="font-medium">{it.quantity}×</span> {it.product_name}{it.notes && <em className="text-xs text-muted-foreground"> ({it.notes})</em>}</span>
                      <span>{brl(it.unit_price * it.quantity)}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t pt-3 flex justify-between items-center">
                  <div className="text-xs text-muted-foreground">
                    {paymentLabel[o.payment_method]}
                    {o.change_for ? ` • troco p/ ${brl(o.change_for)}` : ""}
                  </div>
                  <div className="text-lg font-bold">{brl(o.total)}</div>
                </div>

                {!["delivered", "cancelled"].includes(o.status) && (
                  <div className="flex gap-2 pt-1">
                    {nextStatus[o.status] && (
                      <Button size="sm" className="flex-1" onClick={() => advance(o)}>
                        {o.status === "pending" ? "✓ Aceitar pedido" : `→ ${orderStatusLabel[nextStatus[o.status]!]}`}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => setCancelTarget(o)} aria-label="Cancelar pedido"><X className="w-4 h-4" /></Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar este pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget && (
                <>Você está prestes a cancelar o pedido de <strong>{cancelTarget.customer_name}</strong> no valor de <strong>{brl(cancelTarget.total)}</strong>. Esta ação não pode ser desfeita.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (cancelTarget) { cancel(cancelTarget); setCancelTarget(null); } }}
            >
              Sim, cancelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
