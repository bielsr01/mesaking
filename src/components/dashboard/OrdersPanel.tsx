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
import { Bike, ChefHat, Clock, MapPin, MessageCircle, Phone, Plus, Printer, Store, Trash2, User, X } from "lucide-react";

/** Monta link wa.me garantindo DDI 55 (Brasil) sem duplicar */
function waLink(phone: string | null | undefined): string | null {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  let normalized = digits;
  if (normalized.startsWith("55") && (normalized.length === 12 || normalized.length === 13)) {
    // já tem DDI
  } else if (normalized.length === 10 || normalized.length === 11) {
    normalized = "55" + normalized;
  } else if (normalized.length < 10) {
    return null;
  }
  return `https://wa.me/${normalized}`;
}
import { buildTicketHtml, TicketMode, TicketOptionCatalog, TicketRestaurant } from "@/lib/ticket";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PdvDialog } from "./PdvDialog";

interface Order {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  address_street: string;
  address_number: string;
  address_complement: string | null;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  address_cep: string;
  address_notes: string | null;
  payment_method: string;
  change_for: number | null;
  subtotal: number;
  delivery_fee: number;
  total: number;
  status: "accepted" | "awaiting_pickup" | "cancelled" | "delivered" | "out_for_delivery" | "pending" | "preparing";
  order_type: "delivery" | "pickup" | "pdv";
  discount?: number | null;
  service_fee?: number | null;
  created_at: string;
  delivery_latitude: number | null;
  delivery_longitude: number | null;
  external_source?: string | null;
}

interface Item {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number;
  quantity: number;
  notes: string | null;
}

interface OptionGroupRow { id: string; name: string; sort_order: number | null; }
interface OptionItemRow { id: string; group_id: string; name: string; sort_order: number | null; }
interface ProductOptionGroupRow { product_id: string; group_id: string; sort_order: number | null; }

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
  const grouped: Record<string, Item[]> = {};
  if (ids.length) {
    const { data: its } = await supabase.from("order_items").select("*").in("order_id", ids);
    (its ?? []).forEach((it) => { (grouped[it.order_id] ||= []).push(it as Item); });
  }
  return { orders, items: grouped };
}

export function OrdersPanel({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const [channel, setChannel] = useState<"delivery" | "pdv">("pdv");
  const [filter, setFilter] = useState("pending");
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [printTarget, setPrintTarget] = useState<Order | null>(null);
  const [pdvOpen, setPdvOpen] = useState(false);
  const [deliveryBlink, setDeliveryBlink] = useState(false);

  const doPrint = (o: Order, mode: TicketMode) => {
    const html = buildTicketHtml(
      o,
      items[o.id] ?? [],
      (restaurantInfo as unknown as TicketRestaurant | null) ?? null,
      optionCatalog,
      mode,
    );
    const w = window.open("", "_blank", "width=420,height=720");
    if (!w) {
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      return;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  const { data, isLoading } = useQuery({
    queryKey: ordersKey(restaurantId),
    queryFn: () => fetchOrders(restaurantId),
    staleTime: 10_000,
  });

  const { data: restaurantInfo } = useQuery({
    queryKey: ["restaurant-print-info", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("name,logo_url,address_street,address_number,address_neighborhood,address_city,address_state,address_cep,print_settings,kitchen_print_settings")
        .eq("id", restaurantId)
        .maybeSingle();
      return data;
    },
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const orders = data?.orders ?? [];
  const items = data?.items ?? {};
  const productIds = Array.from(new Set(Object.values(items).flat().map((it) => it.product_id).filter(Boolean))) as string[];

  const { data: optionCatalog = {} } = useQuery({
    queryKey: ["ticket-option-catalog", restaurantId, productIds.join("|")],
    enabled: productIds.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [{ data: groups }, { data: optionRows }, { data: links }] = await Promise.all([
        supabase.from("option_groups").select("id,name,sort_order").eq("restaurant_id", restaurantId),
        supabase
          .from("option_items")
          .select("id,group_id,name,sort_order,option_groups!inner(restaurant_id)")
          .eq("option_groups.restaurant_id", restaurantId),
        supabase.from("product_option_groups").select("product_id,group_id,sort_order").in("product_id", productIds),
      ]);

      const groupRows = (groups ?? []) as OptionGroupRow[];
      const itemRows = (optionRows ?? []) as OptionItemRow[];
      const linkRows = (links ?? []) as ProductOptionGroupRow[];
      const groupMap = new Map(groupRows.map((g) => [g.id, g]));
      const itemsByGroup = new Map<string, OptionItemRow[]>();
      itemRows.forEach((row) => {
        const arr = itemsByGroup.get(row.group_id) ?? [];
        arr.push(row);
        itemsByGroup.set(row.group_id, arr);
      });

      return linkRows.reduce<TicketOptionCatalog>((acc, link) => {
        const group = groupMap.get(link.group_id);
        if (!group) return acc;
        const catalogItems = itemsByGroup.get(link.group_id) ?? [];
        acc[link.product_id] = [
          ...(acc[link.product_id] ?? []),
          ...catalogItems.map((it) => ({
            groupName: group.name,
            itemName: it.name,
            groupSortOrder: link.sort_order ?? group.sort_order ?? 0,
            itemSortOrder: it.sort_order ?? 0,
          })),
        ].sort((a, b) => (a.groupSortOrder ?? 0) - (b.groupSortOrder ?? 0) || (a.itemSortOrder ?? 0) - (b.itemSortOrder ?? 0));
        return acc;
      }, {});
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`orders-${restaurantId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, (payload) => {
        const row = payload.new as Order;
        if (row?.order_type === "pdv") {
          setChannel("pdv");
          setFilter("preparing");
        } else {
          setChannel((cur) => {
            if (cur !== "delivery") setDeliveryBlink(true);
            return cur;
          });
          setFilter((cur) => (cur === "pending" ? cur : cur));
        }
        qc.invalidateQueries({ queryKey: ordersKey(restaurantId) });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, (payload) => {
        const row = payload.new as Order;
        qc.setQueryData<{ orders: Order[]; items: Record<string, Item[]> }>(ordersKey(restaurantId), (prev) => {
          if (!prev) return prev;
          return { ...prev, orders: prev.orders.map((o) => (o.id === row.id ? { ...o, ...row } : o)) };
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, (payload) => {
        const id = (payload.old as Partial<Order>)?.id;
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
    const next = getNextStatus(o.status, o.order_type) as Order["status"] | null;
    if (!next) return;
    const prevStatus = o.status;
    patchOrder(o.id, { status: next });
    const { error } = await supabase.from("orders").update({ status: next }).eq("id", o.id);
    if (error) {
      patchOrder(o.id, { status: prevStatus });
      toast.error(error.message);
    } else {
      toast.success(`Pedido movido para "${orderStatusLabel[next]}"`);
    }
  };

  const cancel = async (o: Order) => {
    const prevStatus = o.status;
    patchOrder(o.id, { status: "cancelled" });
    const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", o.id);
    if (error) {
      patchOrder(o.id, { status: prevStatus });
      toast.error(error.message);
    } else {
      toast.success("Pedido cancelado");
    }
  };

  const deleteOrder = async (o: Order) => {
    const prev = qc.getQueryData<{ orders: Order[]; items: Record<string, Item[]> }>(ordersKey(restaurantId));
    qc.setQueryData<{ orders: Order[]; items: Record<string, Item[]> }>(ordersKey(restaurantId), (p) => {
      if (!p) return p;
      return { ...p, orders: p.orders.filter((x) => x.id !== o.id) };
    });
    const { error: itemsErr } = await supabase.from("order_items").delete().eq("order_id", o.id);
    const { error } = await supabase.from("orders").delete().eq("id", o.id);
    if (error || itemsErr) {
      if (prev) qc.setQueryData(ordersKey(restaurantId), prev);
      toast.error((error || itemsErr)!.message);
      return;
    }
    toast.success("Pedido excluído permanentemente");
    qc.invalidateQueries();
  };

  const channelOrders = orders.filter((o) => {
    if (channel === "pdv") return o.order_type === "pdv";
    return o.order_type !== "pdv";
  });

  const filtered = channelOrders.filter((o) => {
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
    pending: channelOrders.filter((o) => o.status === "pending").length,
    preparing: channelOrders.filter((o) => o.status === "preparing").length,
    out_for_delivery: channelOrders.filter((o) => o.status === "out_for_delivery").length,
    awaiting_pickup: channelOrders.filter((o) => o.status === "awaiting_pickup").length,
    delivered: channelOrders.filter((o) => o.status === "delivered").length,
    active: channelOrders.filter((o) => !["delivered", "cancelled"].includes(o.status)).length,
    all: channelOrders.length,
  };

  const deliveryCount = orders.filter((o) => o.order_type !== "pdv").length;
  const pdvCount = orders.filter((o) => o.order_type === "pdv").length;

  // PDV: em preparo + entregues
  const visibleFilters = channel === "pdv"
    ? FILTERS.filter((f) => ["preparing", "delivered", "all"].includes(f.value))
    : FILTERS;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={channel} onValueChange={(v) => {
          const nv = v as "delivery" | "pdv";
          setChannel(nv);
          setFilter(nv === "pdv" ? "preparing" : "pending");
          if (nv === "delivery") setDeliveryBlink(false);
        }}>
          <TabsList>
            <TabsTrigger value="pdv" className="gap-2">
              <Store className="w-4 h-4" /> PDV (Balcão)
              <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-xs">{pdvCount}</Badge>
            </TabsTrigger>
            <TabsTrigger value="delivery" className={`gap-2 ${deliveryBlink ? "animate-pulse text-destructive ring-2 ring-destructive" : ""}`}>
              <Bike className="w-4 h-4" /> Delivery / Retirada
              <Badge variant={deliveryBlink ? "destructive" : "secondary"} className="h-5 min-w-5 px-1.5 text-xs">{deliveryCount}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {channel === "pdv" && (
          <Button onClick={() => setPdvOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Novo pedido PDV
          </Button>
        )}
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList className="flex-wrap h-auto">
          {visibleFilters.map((f) => (
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
        <div className={channel === "pdv" ? "flex flex-col gap-3" : "grid gap-4 lg:grid-cols-2"}>
          {filtered.map((o) => {
            const isPickup = o.order_type === "pickup";
            const isPdv = o.order_type === "pdv";
            const next = getNextStatus(o.status, o.order_type);
            return (
            <Card key={o.id} className="shadow-soft">
              <CardContent className="pt-0 space-y-3">
                <div className="pt-3" />
                {/* Tipo do pedido — destaque no topo */}
                <div className={`-mt-2 -mx-1 px-3 py-1.5 rounded-md flex items-center gap-2 text-xs font-semibold ${isPdv ? "bg-success/15 text-success border border-success/30" : isPickup ? "bg-accent/20 text-accent-foreground border border-accent/40" : "bg-primary/10 text-primary border border-primary/20"}`}>
                  {isPdv ? <Store className="w-3.5 h-3.5" /> : isPickup ? <Store className="w-3.5 h-3.5" /> : <Bike className="w-3.5 h-3.5" />}
                  {orderTypeLabel[o.order_type] ?? "Delivery"}
                </div>

                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold flex items-center gap-2 flex-wrap">
                      <User className="w-4 h-4" />{o.customer_name}
                      <Badge variant="outline" className="font-mono text-xs">#{o.order_number}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1 flex-wrap">
                      <Clock className="w-3 h-3" />
                      {new Date(o.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                      {" às "}
                      {new Date(o.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      <Phone className="w-3 h-3 ml-2" />{formatPhone(o.customer_phone)}
                      {waLink(o.customer_phone) && (
                        <a
                          href={waLink(o.customer_phone)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          title="Abrir WhatsApp"
                          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-success text-success-foreground hover:opacity-90 transition-opacity"
                        >
                          <MessageCircle className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  </div>
                  <Badge className={statusColor(o.status)}>
                    {orderStatusLabel[o.status]}{isPdv && (o.status === "preparing" || o.status === "delivered") ? " Balcão" : ""}
                  </Badge>
                </div>

                {isPdv ? (
                  <div className="text-sm flex gap-2 bg-success/10 rounded-md p-2">
                    <Store className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="text-muted-foreground italic">Venda PDV — atendimento no balcão.</div>
                  </div>
                ) : isPickup ? (
                  <div className="text-sm flex gap-2 bg-accent/10 rounded-md p-2">
                    <Store className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="text-muted-foreground italic">Retirada na loja — cliente irá buscar.</div>
                  </div>
                ) : (
                  <div className="text-sm flex gap-2">
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      {o.address_street}, {o.address_number} {o.address_complement && `- ${o.address_complement}`}<br />
                      <span className="text-muted-foreground">{o.address_neighborhood} • {o.address_city}</span>
                      {o.address_notes && <div className="text-xs italic text-muted-foreground mt-0.5">"{o.address_notes}"</div>}
                      {o.delivery_latitude != null && o.delivery_longitude != null && (
                        <a
                          href={`https://www.google.com/maps?q=${o.delivery_latitude},${o.delivery_longitude}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-primary hover:underline mt-1 inline-flex items-center gap-1 tabular-nums"
                        >
                          <MapPin className="w-3 h-3" />
                          {o.delivery_latitude.toFixed(6)}, {o.delivery_longitude.toFixed(6)} — abrir no mapa
                        </a>
                      )}
                    </div>
                  </div>
                )}

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

                <div className="flex gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setPrintTarget(o)}
                    aria-label="Imprimir ticket"
                    title="Imprimir ticket"
                  >
                    <Printer className="w-4 h-4" />
                  </Button>
                  {!["delivered", "cancelled"].includes(o.status) && (
                    <>
                      {next && (
                        <Button size="sm" className="flex-1" onClick={() => advance(o)}>
                          {o.status === "pending" ? "✓ Aceitar pedido" : `→ ${orderStatusLabel[next]}`}
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => setCancelTarget(o)} aria-label="Cancelar pedido"><X className="w-4 h-4" /></Button>
                    </>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setDeleteTarget(o)}
                    aria-label="Excluir pedido permanentemente"
                    title="Excluir permanentemente"
                    className="text-destructive hover:bg-destructive hover:text-destructive-foreground"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
            );
          })}
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir pedido permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget && (
                <>Esta ação <strong>não pode ser desfeita</strong>. O pedido <strong>#{deleteTarget.order_number}</strong> de <strong>{deleteTarget.customer_name}</strong> ({brl(deleteTarget.total)}) será removido do banco e todos os relatórios serão recalculados.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { if (deleteTarget) { deleteOrder(deleteTarget); setDeleteTarget(null); } }}
            >
              Sim, excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!printTarget} onOpenChange={(o) => !o && setPrintTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Imprimir ticket</DialogTitle>
            <DialogDescription>Escolha qual ticket deseja imprimir.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button
              variant="outline"
              className="justify-start gap-2 h-12"
              onClick={() => { if (printTarget) { doPrint(printTarget, "customer"); setPrintTarget(null); } }}
            >
              <Printer className="w-4 h-4" /> Imprimir Ticket do Cliente
            </Button>
            <Button
              variant="outline"
              className="justify-start gap-2 h-12"
              onClick={() => { if (printTarget) { doPrint(printTarget, "kitchen"); setPrintTarget(null); } }}
            >
              <ChefHat className="w-4 h-4" /> Imprimir Ticket da Cozinha
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PdvDialog open={pdvOpen} onOpenChange={setPdvOpen} restaurantId={restaurantId} />
    </div>
  );
}
