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
import { Bike, ChefHat, Clock, MapPin, MessageCircle, Phone, Plus, Printer, Store, Trash2, User, X, Utensils } from "lucide-react";
import { IfoodEventsTab } from "./IfoodEventsTab";
import { usePermissions } from "@/hooks/usePermissions";

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
  external_order_id?: string | null;
  external_display_id?: string | null;
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
  { value: "cancelled", label: "Cancelados" },
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
    .limit(500);
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
  const { can } = usePermissions(restaurantId);
  const canPdv = can("orders.channels.pdv");
  const canDelivery = can("orders.channels.delivery") || can("orders.channels.pickup");
  const canIfood = can("orders.channels.ifood");
  const canChangeStatus = can("orders.change_status");
  const canEditOrders = can("orders.edit");
  const canCreatePdv = can("orders.create_pdv_order");
  const initialChannel: "delivery" | "pdv" | "ifood" = canPdv ? "pdv" : canDelivery ? "delivery" : canIfood ? "ifood" : "pdv";
  const [channel, setChannel] = useState<"delivery" | "pdv" | "ifood">(initialChannel);
  const statusKey = (ch: "delivery" | "pdv" | "ifood", s: string) => `orders.statuses.${ch}.${s}`;
  const firstAllowedStatus = (ch: "delivery" | "pdv" | "ifood", preferred: string[]) => {
    for (const p of preferred) if (can(statusKey(ch, p))) return p;
    const list = ch === "pdv" ? ["preparing", "delivered", "cancelled", "all"] : ["pending", "preparing", "out_for_delivery", "awaiting_pickup", "delivered", "cancelled", "active", "all"];
    return list.find((s) => can(statusKey(ch, s))) ?? (ch === "pdv" ? "preparing" : "pending");
  };
  const [filter, setFilter] = useState(() => firstAllowedStatus(initialChannel, initialChannel === "pdv" ? ["preparing"] : ["pending"]));
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [printTarget, setPrintTarget] = useState<Order | null>(null);
  const [pdvOpen, setPdvOpen] = useState(false);
  const [deliveryBlink, setDeliveryBlink] = useState(false);
  const [ifoodView, setIfoodView] = useState<"orders" | "events">("orders");
  const [pendingAction, setPendingAction] = useState<Record<string, boolean>>({});
  const setPending = (id: string, v: boolean) =>
    setPendingAction((m) => ({ ...m, [id]: v }));

  // If current channel becomes forbidden, switch to first allowed
  useEffect(() => {
    const allowed = (channel === "pdv" && canPdv) || (channel === "delivery" && canDelivery) || (channel === "ifood" && canIfood);
    if (allowed) return;
    if (canPdv) setChannel("pdv");
    else if (canDelivery) setChannel("delivery");
    else if (canIfood) setChannel("ifood");
  }, [channel, canPdv, canDelivery, canIfood]);

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
        } else if (row?.external_source === "ifood") {
          setChannel("ifood");
          setIfoodView("orders");
          setFilter("pending");
        } else {
          setChannel((cur) => {
            if (cur !== "delivery") setDeliveryBlink(true);
            return cur;
          });
          setFilter("pending");
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
    if (!canChangeStatus) return toast.error("Sem permissão para mudar status");
    if (pendingAction[o.id]) return; // evita duplo-clique / corrida com outro pedido
    const next = getNextStatus(o.status, o.order_type) as Order["status"] | null;
    if (!next) return;
    setPending(o.id, true);
    const prevStatus = o.status;
    patchOrder(o.id, { status: next });

    // For iFood orders, forward the action to iHub first.
    // No iFood, "delivered" é atualizado automaticamente pelo webhook (CONCLUDED) — não enviamos ação.
    if (o.external_source === "ifood") {
      if (next === "delivered") {
        patchOrder(o.id, { status: prevStatus });
        toast.info("Pedidos do iFood são marcados como entregues automaticamente pelo iFood.");
        setPending(o.id, false);
        return;
      }
      // Defesa: precisa ter external_order_id para mandar a ação só desse pedido
      if (!o.external_order_id) {
        patchOrder(o.id, { status: prevStatus });
        toast.error("Pedido iFood sem external_order_id — não é possível enviar a ação.");
        setPending(o.id, false);
        return;
      }
      const actionMap: Record<string, string> = {
        preparing: "confirm",
        awaiting_pickup: "readyToPickup",
        out_for_delivery: "dispatch",
      };
      const action = actionMap[next];
      if (action) {
        console.info("[ifood-action] enviando", { orderId: o.id, externalOrderId: o.external_order_id, customer: o.customer_name, action });
        const { data: fnData, error: fnErr } = await supabase.functions.invoke("ifood-action", {
          body: { orderId: o.id, action },
        });
        if (fnErr || !fnData?.ok) {
          // Sem "transient pass-through": qualquer falha reverte o status local
          // para evitar dessincronia entre o painel e o iFood.
          patchOrder(o.id, { status: prevStatus });
          const msg = fnData?.error ?? fnErr?.message ?? "falha";
          const detail = fnData?.ihub_status ? ` (iHub ${fnData.ihub_status})` : "";
          toast.error(`iFood: ${msg}${detail}`);
          setPending(o.id, false);
          return;
        }
      }
    }

    const { error } = await supabase.from("orders").update({ status: next }).eq("id", o.id);
    if (error) {
      patchOrder(o.id, { status: prevStatus });
      toast.error(error.message);
    } else {
      toast.success(`Pedido #${o.order_number} → "${orderStatusLabel[next]}"`);
    }
    setPending(o.id, false);
  };

  const cancel = async (o: Order) => {
    if (!canChangeStatus) return toast.error("Sem permissão para cancelar pedido");
    if (pendingAction[o.id]) return;
    setPending(o.id, true);
    const prevStatus = o.status;
    patchOrder(o.id, { status: "cancelled" });
    if (o.external_source === "ifood") {
      if (!o.external_order_id) {
        patchOrder(o.id, { status: prevStatus });
        toast.error("Pedido iFood sem external_order_id — não é possível cancelar.");
        setPending(o.id, false);
        return;
      }
      console.info("[ifood-action] cancelando", { orderId: o.id, externalOrderId: o.external_order_id, customer: o.customer_name });
      const { data: fnData, error: fnErr } = await supabase.functions.invoke("ifood-action", {
        body: { orderId: o.id, action: "cancel", cancelReason: "Cancelado pelo restaurante" },
      });
      if (fnErr || (fnData && fnData.ok === false)) {
        patchOrder(o.id, { status: prevStatus });
        toast.error(`iFood: ${fnData?.error ?? fnErr?.message ?? "falha"}`);
        setPending(o.id, false);
        return;
      }
    }
    const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", o.id);
    if (error) {
      patchOrder(o.id, { status: prevStatus });
      toast.error(error.message);
    } else {
      toast.success(`Pedido #${o.order_number} cancelado`);
    }
    setPending(o.id, false);
  };

  const deleteOrder = async (o: Order) => {
    if (!canEditOrders) return toast.error("Sem permissão para excluir pedido");
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
    if (channel === "ifood") return o.external_source === "ifood";
    // delivery: tudo que não é pdv e não é ifood
    return o.order_type !== "pdv" && o.external_source !== "ifood";
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
    cancelled: channelOrders.filter((o) => o.status === "cancelled").length,
    active: channelOrders.filter((o) => !["delivered", "cancelled"].includes(o.status)).length,
    all: channelOrders.length,
  };

  const deliveryCount = orders.filter((o) => o.order_type !== "pdv" && o.external_source !== "ifood").length;
  const deliveryPendingCount = orders.filter((o) => o.order_type !== "pdv" && o.external_source !== "ifood" && o.status === "pending").length;
  const pdvCount = orders.filter((o) => o.order_type === "pdv").length;
  const ifoodCount = orders.filter((o) => o.external_source === "ifood").length;
  const ifoodPendingCount = orders.filter((o) => o.external_source === "ifood" && o.status === "pending").length;

  // Filtra abas de status conforme permissão por canal
  const baseFilters = channel === "pdv"
    ? FILTERS.filter((f) => ["preparing", "delivered", "cancelled", "all"].includes(f.value))
    : FILTERS;
  const visibleFilters = baseFilters.filter((f) => can(statusKey(channel, f.value)));

  // Se o filtro atual não está permitido, escolhe o primeiro disponível
  if (visibleFilters.length > 0 && !visibleFilters.find((f) => f.value === filter)) {
    setTimeout(() => setFilter(visibleFilters[0].value), 0);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={channel} onValueChange={(v) => {
          const nv = v as "delivery" | "pdv" | "ifood";
          setChannel(nv);
          if (nv === "pdv") setFilter("preparing");
          else if (nv === "delivery") { setFilter("pending"); setDeliveryBlink(false); }
          else if (nv === "ifood") { setFilter("pending"); setIfoodView("orders"); }
        }}>
          <TabsList>
            {canPdv && (
              <TabsTrigger value="pdv" className="gap-2">
                <Store className="w-4 h-4" /> PDV (Balcão)
                <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-xs">{pdvCount}</Badge>
              </TabsTrigger>
            )}
            {canDelivery && (
              <TabsTrigger value="delivery" className={`gap-2 ${deliveryPendingCount > 0 ? "animate-pulse text-destructive ring-2 ring-destructive" : ""}`}>
                <Bike className="w-4 h-4" /> Delivery / Retirada
                <Badge variant={deliveryPendingCount > 0 ? "destructive" : "secondary"} className="h-5 min-w-5 px-1.5 text-xs">{deliveryPendingCount > 0 ? deliveryPendingCount : deliveryCount}</Badge>
              </TabsTrigger>
            )}
            {canIfood && (
              <TabsTrigger value="ifood" className={`gap-2 ${ifoodPendingCount > 0 ? "animate-pulse text-destructive ring-2 ring-destructive" : ""}`}>
                <Utensils className="w-4 h-4" /> iFood
                <Badge variant={ifoodPendingCount > 0 ? "destructive" : "secondary"} className="h-5 min-w-5 px-1.5 text-xs">{ifoodPendingCount > 0 ? ifoodPendingCount : ifoodCount}</Badge>
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>

        {channel === "pdv" && canCreatePdv && (
          <Button onClick={() => setPdvOpen(true)} className="gap-2">
            <Plus className="w-4 h-4" /> Novo pedido PDV
          </Button>
        )}
      </div>

      {channel === "ifood" && (
        <Tabs value={ifoodView} onValueChange={(v) => setIfoodView(v as "orders" | "events")}>
          <TabsList>
            <TabsTrigger value="orders">Pedidos iFood</TabsTrigger>
            <TabsTrigger value="events">Histórico de webhooks</TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {channel === "ifood" && ifoodView === "events" ? (
        <IfoodEventsTab restaurantId={restaurantId} />
      ) : (
      <>

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
                      <Phone className="w-3 h-3 ml-2" />
                      {o.external_source === "ifood"
                        ? (() => {
                            const raw = String(o.customer_phone ?? "");
                            const digits = raw.replace(/\D/g, "");
                            const locMatch = raw.match(/(?:cód[^\w]*|localizador[^\w]*)([A-Za-z0-9]+)/i);
                            const loc = locMatch?.[1] ?? digits.slice(11);
                            const base = digits.slice(0, 11) || digits;
                            const masked = base.length >= 10
                              ? `${base.slice(0, 4)} ${base.slice(4, 7)} ${base.slice(7, 11)}`
                              : base;
                            return loc ? `${masked} (cód: ${loc})` : masked;
                          })()
                        : formatPhone(o.customer_phone)}
                      {o.external_source !== "ifood" && waLink(o.customer_phone) && (
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

                <div className="border-t pt-3 flex justify-between items-start gap-2">
                  <div className="text-xs text-muted-foreground">
                    {paymentLabel[o.payment_method]}
                    {o.change_for ? ` • troco p/ ${brl(o.change_for)}` : ""}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold">{brl(o.total)}</div>
                    {(Number(o.delivery_fee) > 0 || Number(o.service_fee ?? 0) > 0) && (
                      <div className="text-[11px] text-destructive leading-tight mt-0.5 space-y-0.5">
                        {Number(o.delivery_fee) > 0 && (
                          <div>Taxa de entrega: {brl(Number(o.delivery_fee))}</div>
                        )}
                        {Number(o.service_fee ?? 0) > 0 && (
                          <div>Taxas da plataforma: {brl(Number(o.service_fee))}</div>
                        )}
                      </div>
                    )}
                  </div>
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
                  {!["delivered", "cancelled"].includes(o.status) && canChangeStatus && (
                    <>
                      {next && !(o.external_source === "ifood" && next === "delivered") ? (
                        <Button size="sm" className="flex-1" onClick={() => advance(o)} disabled={!!pendingAction[o.id]}>
                          {pendingAction[o.id]
                            ? "Enviando…"
                            : o.status === "pending"
                              ? "✓ Aceitar pedido"
                              : o.external_source === "ifood" && next === "out_for_delivery"
                                ? "🛵 Enviar para entrega"
                                : `→ ${orderStatusLabel[next]}`}
                        </Button>
                      ) : o.external_source === "ifood" && o.status === "out_for_delivery" ? (
                        <div className="flex-1 text-xs text-muted-foreground italic flex items-center px-2">
                          Aguardando confirmação de entrega pelo iFood…
                        </div>
                      ) : null}
                      <Button size="sm" variant="outline" onClick={() => setCancelTarget(o)} disabled={!!pendingAction[o.id]} aria-label="Cancelar pedido"><X className="w-4 h-4" /></Button>
                    </>
                  )}
                  {canEditOrders && (
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
                  )}
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
      </>
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
