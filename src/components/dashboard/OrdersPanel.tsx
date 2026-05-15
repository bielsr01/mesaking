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
import { brl, orderStatusLabel, getNextStatus, paymentLabel, paymentLabelFor, formatPhone, orderTypeLabel } from "@/lib/format";
import { toast } from "sonner";
import { Bike, ChefHat, Clock, History, MapPin, MessageCircle, Phone, Plus, Printer, Store, Trash2, User, X, Utensils } from "lucide-react";

import { usePermissions } from "@/hooks/usePermissions";
import { OrderDetailsDialog } from "./OrderDetailsDialog";
import { OrderHistoryDialog } from "./OrderHistoryDialog";

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
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  updated_at: string;
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
  const canQuero = can("orders.channels.quero");
  const canChangeStatus = can("orders.change_status");
  const canEditOrders = can("orders.edit");
  const canViewFeeBreakdown = can("finance.view_fee_breakdown");
  const canCreatePdv = can("orders.create_pdv_order");
  type Channel = "all" | "delivery" | "pdv" | "ifood" | "quero";
  const initialChannel: Channel = "all";
  const [channel, setChannel] = useState<Channel>(initialChannel);
  const statusKey = (ch: Channel, s: string) => `orders.statuses.${ch === "all" ? "delivery" : ch}.${s}`;
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [queroCancelInfoOpen, setQueroCancelInfoOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelCode, setCancelCode] = useState<string>("INTERNAL_DIFFICULTIES_OF_THE_RESTAURANT");
  const [deleteTarget, setDeleteTarget] = useState<Order | null>(null);
  const [printTarget, setPrintTarget] = useState<Order | null>(null);
  const [detailsTarget, setDetailsTarget] = useState<Order | null>(null);
  const [pdvOpen, setPdvOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deliveryBlink, setDeliveryBlink] = useState(false);
  const [pendingAction, setPendingAction] = useState<Record<string, boolean>>({});
  const [ifoodCodeTarget, setIfoodCodeTarget] = useState<Order | null>(null);
  const [ifoodCodeValue, setIfoodCodeValue] = useState("");
  const [ifoodCodeSubmitting, setIfoodCodeSubmitting] = useState(false);

  const confirmIfoodDelivery = async () => {
    if (!ifoodCodeTarget) return;
    const targetOrderId = ifoodCodeTarget.id;
    const code = ifoodCodeValue.trim();
    if (!code) { toast.error("Informe o código de entrega"); return; }
    setIfoodCodeSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("ihub-link", {
        body: {
          action: "verify-delivery-code",
          restaurantId,
          orderId: ifoodCodeTarget.id,
          externalOrderId: ifoodCodeTarget.external_order_id,
          code,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Falha ao validar código");
      toast.success("Entrega confirmada");
      patchOrder(targetOrderId, { status: "delivered" });
      setIfoodCodeTarget(null);
      setIfoodCodeValue("");
      await qc.invalidateQueries({ queryKey: ordersKey(restaurantId) });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setIfoodCodeSubmitting(false);
    }
  };

  const setPending = (id: string, v: boolean) =>
    setPendingAction((m) => ({ ...m, [id]: v }));

  // If current channel becomes forbidden, switch to first allowed
  useEffect(() => {
    const allowed = channel === "all" || (channel === "pdv" && canPdv) || (channel === "delivery" && canDelivery) || (channel === "ifood" && canIfood) || (channel === "quero" && canQuero);
    if (allowed) return;
    if (canPdv) setChannel("pdv");
    else if (canDelivery) setChannel("delivery");
    else if (canIfood) setChannel("ifood");
    else if (canQuero) setChannel("quero");
  }, [channel, canPdv, canDelivery, canIfood, canQuero]);

  const doPrint = async (o: Order, mode: TicketMode) => {
    const orderItems = items[o.id] ?? [];
    const itemIds = orderItems.map((it) => it.id).filter(Boolean);
    let orderOptions: Record<string, { group_name: string | null; item_name: string | null; extra_price: number }[]> = {};
    if (itemIds.length) {
      const { data } = await supabase
        .from("order_item_options")
        .select("order_item_id,group_name,item_name,extra_price")
        .in("order_item_id", itemIds);
      (data ?? []).forEach((row: any) => {
        (orderOptions[row.order_item_id] ||= []).push({
          group_name: row.group_name,
          item_name: row.item_name,
          extra_price: Number(row.extra_price ?? 0),
        });
      });
    }
    const html = buildTicketHtml(
      o,
      orderItems,
      (restaurantInfo as unknown as TicketRestaurant | null) ?? null,
      optionCatalog,
      mode,
      orderOptions,
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

  const allOrders = data?.orders ?? [];
  const items = data?.items ?? {};
  // Pedidos entregues/cancelados somem do painel principal após 12h.
  // Continuam visíveis no Histórico de Pedidos.
  const cutoff = Date.now() - 12 * 60 * 60 * 1000;
  const orders = allOrders.filter((o) => {
    if (o.status !== "delivered" && o.status !== "cancelled") return true;
    const ref = new Date(o.updated_at ?? o.created_at).getTime();
    return ref >= cutoff;
  });
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
        if (row?.external_source === "ifood") {
          // não troca canal automaticamente — usuário pode estar no "Todos"
        } else if (row?.order_type !== "pdv" && row?.external_source !== "quero") {
          setChannel((cur) => {
            if (cur !== "delivery" && cur !== "all") setDeliveryBlink(true);
            return cur;
          });
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

    if (o.external_source === "quero") {
      if (!o.external_order_id) {
        patchOrder(o.id, { status: prevStatus });
        toast.error("Pedido Quero sem external_order_id — não é possível enviar a ação.");
        setPending(o.id, false);
        return;
      }
      const actionMap: Record<string, string> = {
        preparing: "confirm",
        awaiting_pickup: "readyForPickup",
        out_for_delivery: "dispatch",
        delivered: "delivered",
      };
      const action = actionMap[next];
      if (action) {
        const { data: fnData, error: fnErr } = await supabase.functions.invoke("quero-action", {
          body: { orderId: o.id, action },
        });
        if (fnErr || !fnData?.ok) {
          patchOrder(o.id, { status: prevStatus });
          toast.error(`Quero: ${fnData?.error ?? fnErr?.message ?? "falha"}`);
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

  const cancel = async (o: Order, opts?: { cancelReason?: string; cancelCode?: string }) => {
    if (!canChangeStatus) return toast.error("Sem permissão para cancelar pedido");
    if (pendingAction[o.id]) return;
    const reason = opts?.cancelReason?.trim() || "Cancelado pelo restaurante";
    const code = opts?.cancelCode || "INTERNAL_DIFFICULTIES_OF_THE_RESTAURANT";
    setPending(o.id, true);
    if (o.external_source === "ifood") {
      if (!o.external_order_id) {
        toast.error("Pedido iFood sem external_order_id — não é possível cancelar.");
        setPending(o.id, false);
        return;
      }
      console.info("[ifood-action] cancelando", { orderId: o.id, externalOrderId: o.external_order_id, customer: o.customer_name });
      const { data: fnData, error: fnErr } = await supabase.functions.invoke("ifood-action", {
        body: { orderId: o.id, action: "cancel", cancelReason: reason },
      });
      if (fnErr || (fnData && fnData.ok === false)) {
        toast.error(`iFood: ${fnData?.error ?? fnErr?.message ?? "falha"}`);
        setPending(o.id, false);
        return;
      }
    }
    if (o.external_source === "quero") {
      if (!o.external_order_id) {
        toast.error("Pedido Quero sem external_order_id — não é possível cancelar.");
        setPending(o.id, false);
        return;
      }
      const { data: fnData, error: fnErr } = await supabase.functions.invoke("quero-action", {
        body: { orderId: o.id, action: "cancel", cancelReason: reason, cancelCode: code },
      });
      if (fnErr || (fnData && fnData.ok === false)) {
        toast.error(`Quero: ${fnData?.error ?? fnErr?.message ?? "falha"}`);
        setPending(o.id, false);
        return;
      }
    }
    const { error } = await supabase.from("orders").update({ status: "cancelled" }).eq("id", o.id);
    if (error) {
      toast.error(error.message);
    } else {
      patchOrder(o.id, { status: "cancelled" });
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
    if (channel === "all") return true;
    if (channel === "pdv") return o.order_type === "pdv";
    if (channel === "ifood") return o.external_source === "ifood";
    if (channel === "quero") return o.external_source === "quero";
    // delivery: tudo que não é pdv e não é ifood/quero
    return o.order_type !== "pdv" && o.external_source !== "ifood" && o.external_source !== "quero";
  });

  const statusColor = (s: string) => {
    if (s === "pending") return "bg-warning text-warning-foreground";
    if (s === "delivered") return "bg-success text-success-foreground";
    if (s === "cancelled") return "bg-destructive text-destructive-foreground";
    return "bg-primary text-primary-foreground";
  };

  const deliveryCount = orders.filter((o) => o.order_type !== "pdv" && o.external_source !== "ifood" && o.external_source !== "quero").length;
  const deliveryPendingCount = orders.filter((o) => o.order_type !== "pdv" && o.external_source !== "ifood" && o.external_source !== "quero" && o.status === "pending").length;
  const pdvCount = orders.filter((o) => o.order_type === "pdv").length;
  const ifoodCount = orders.filter((o) => o.external_source === "ifood").length;
  const ifoodPendingCount = orders.filter((o) => o.external_source === "ifood" && o.status === "pending").length;
  const queroCount = orders.filter((o) => o.external_source === "quero").length;
  const queroPendingCount = orders.filter((o) => o.external_source === "quero" && o.status === "pending").length;
  const allPendingCount = deliveryPendingCount + ifoodPendingCount + queroPendingCount;

  const sortRecent = (a: Order, b: Order) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  const pendingOrders = channelOrders.filter((o) => o.status === "pending").sort(sortRecent);
  const preparingOrders = channelOrders.filter((o) => o.status === "preparing").sort(sortRecent);
  const readyOrders = channelOrders.filter((o) => o.status === "awaiting_pickup").sort(sortRecent);
  const outForDeliveryOrders = channelOrders.filter((o) => o.status === "out_for_delivery").sort(sortRecent);
  const finalizedOrders = channelOrders.filter((o) => o.status === "delivered" || o.status === "cancelled").sort(sortRecent);

  const renderCard = (o: Order) => {
    const isPickup = o.order_type === "pickup";
    const isPdv = o.order_type === "pdv";
    const next = getNextStatus(o.status, o.order_type);
    return (
      <Card key={o.id} className="shadow-soft cursor-pointer hover:bg-accent/30 transition-colors" onClick={() => setDetailsTarget(o)}>
        <CardContent className="p-2.5 space-y-2" onClick={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest('button,a,[role="button"]')) e.stopPropagation();
        }}>
          <div className={`px-2 py-1 rounded-md flex items-center gap-1.5 text-[11px] font-semibold ${isPdv ? "bg-success/15 text-success border border-success/30" : isPickup ? "bg-accent/20 text-accent-foreground border border-accent/40" : o.external_source === "ifood" ? "bg-orange-100 text-orange-700 border border-orange-200" : o.external_source === "quero" ? "bg-blue-100 text-blue-700 border border-blue-200" : "bg-primary/10 text-primary border border-primary/20"}`}>
            {isPdv ? <Store className="w-3 h-3" /> : isPickup ? <Store className="w-3 h-3" /> : <Bike className="w-3 h-3" />}
            <span className="truncate">{o.external_source === "ifood" ? "iFood" : o.external_source === "quero" ? "Quero" : (orderTypeLabel[o.order_type] ?? "Delivery")}</span>
          </div>

          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm flex items-center gap-1.5 flex-wrap">
                <User className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{o.customer_name}</span>
                <Badge variant="outline" className="font-mono text-[10px] px-1 py-0">#{o.order_number}</Badge>
              </div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3" />
                {new Date(o.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                {o.external_source !== "ifood" && waLink(o.customer_phone) && (
                  <a
                    href={waLink(o.customer_phone)!}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="Abrir WhatsApp"
                    className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-success text-success-foreground hover:opacity-90 transition-opacity ml-1"
                  >
                    <MessageCircle className="w-2.5 h-2.5" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {!isPdv && !isPickup && (
            <div className="text-[11px] flex gap-1 text-muted-foreground">
              <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
              <div className="min-w-0 leading-tight">
                {o.address_street}, {o.address_number}{o.address_complement ? ` - ${o.address_complement}` : ""}
                <div>{o.address_neighborhood}</div>
              </div>
            </div>
          )}

          <div className="border-t pt-2 space-y-0.5 text-[11px]">
            {(items[o.id] ?? []).slice(0, 3).map((it) => (
              <div key={it.id} className="flex justify-between gap-2">
                <span className="truncate"><span className="font-medium">{it.quantity}×</span> {it.product_name}</span>
              </div>
            ))}
            {(items[o.id]?.length ?? 0) > 3 && (
              <div className="text-muted-foreground italic">+{(items[o.id]!.length - 3)} item(ns)…</div>
            )}
          </div>

          <div className="border-t pt-2 flex justify-between items-center gap-2">
            <div className="text-[10px] text-muted-foreground truncate">
              {paymentLabelFor(o.payment_method, o.external_source)}
            </div>
            <div className="text-base font-bold">{brl(o.total)}</div>
          </div>

          <div className="flex gap-1 pt-0.5">
            <Button
              size="sm"
              variant="outline"
              className="h-8 px-2"
              onClick={() => setPrintTarget(o)}
              aria-label="Imprimir ticket"
              title="Imprimir ticket"
            >
              <Printer className="w-3.5 h-3.5" />
            </Button>
            {!["delivered", "cancelled"].includes(o.status) && canChangeStatus && (
              <>
                {next && !(o.external_source === "ifood" && next === "delivered") ? (
                  <Button size="sm" className="flex-1 h-8 text-xs" onClick={() => advance(o)} disabled={!!pendingAction[o.id]}>
                    {pendingAction[o.id]
                      ? "…"
                      : o.status === "pending"
                        ? "✓ Aceitar"
                        : o.external_source === "ifood" && next === "out_for_delivery"
                          ? "🛵 Enviar"
                          : `→ ${orderStatusLabel[next]}`}
                  </Button>
                ) : o.external_source === "ifood" && o.status === "out_for_delivery" && o.order_type !== "pickup" && o.external_order_id ? (
                  <Button
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => { setIfoodCodeTarget(o); setIfoodCodeValue(""); }}
                  >
                    📦 Confirmar
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2"
                  onClick={() => {
                    if (o.external_source === "quero") {
                      setQueroCancelInfoOpen(true);
                    } else {
                      setCancelTarget(o);
                    }
                  }}
                  disabled={!!pendingAction[o.id]}
                  aria-label="Cancelar pedido"
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </>
            )}
            {canEditOrders && o.status !== "delivered" && o.status !== "cancelled" && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2"
                onClick={() => setDeleteTarget(o)}
                aria-label="Excluir pedido permanentemente"
                title="Excluir permanentemente"
              >
                <Trash2 className="w-3.5 h-3.5 text-destructive" />
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const Column = ({ title, count, accent, children }: { title: string; count: number; accent?: string; children: React.ReactNode }) => (
    <div className="flex flex-col min-w-0 bg-muted/30 rounded-lg border">
      <div className={`px-3 py-2 border-b flex items-center justify-between rounded-t-lg ${accent ?? "bg-background"}`}>
        <span className="text-sm font-semibold">{title}</span>
        <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-xs">{count}</Badge>
      </div>
      <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[calc(100vh-260px)]">
        {count === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-6">—</div>
        ) : children}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs value={channel} onValueChange={(v) => {
          const nv = v as Channel;
          setChannel(nv);
          if (nv === "delivery" || nv === "all") setDeliveryBlink(false);
        }}>
          <TabsList>
            <TabsTrigger value="all" className={`gap-2 ${allPendingCount > 0 ? "animate-pulse" : ""}`}>
              Todos
              <Badge variant={allPendingCount > 0 ? "destructive" : "secondary"} className="h-5 min-w-5 px-1.5 text-xs">
                {allPendingCount > 0 ? allPendingCount : orders.length}
              </Badge>
            </TabsTrigger>
            {canPdv && (
              <TabsTrigger value="pdv" className="gap-2">
                <Store className="w-4 h-4" /> PDV
                <Badge variant="secondary" className="h-5 min-w-5 px-1.5 text-xs">{pdvCount}</Badge>
              </TabsTrigger>
            )}
            {canDelivery && (
              <TabsTrigger value="delivery" className={`gap-2 ${deliveryPendingCount > 0 ? "animate-pulse text-destructive ring-2 ring-destructive" : ""}`}>
                <Bike className="w-4 h-4" /> Delivery
                <Badge variant={deliveryPendingCount > 0 ? "destructive" : "secondary"} className="h-5 min-w-5 px-1.5 text-xs">{deliveryPendingCount > 0 ? deliveryPendingCount : deliveryCount}</Badge>
              </TabsTrigger>
            )}
            {canIfood && (
              <TabsTrigger value="ifood" className={`gap-2 ${ifoodPendingCount > 0 ? "animate-pulse text-destructive ring-2 ring-destructive" : ""}`}>
                <Utensils className="w-4 h-4" /> iFood
                <Badge variant={ifoodPendingCount > 0 ? "destructive" : "secondary"} className="h-5 min-w-5 px-1.5 text-xs">{ifoodPendingCount > 0 ? ifoodPendingCount : ifoodCount}</Badge>
              </TabsTrigger>
            )}
            {canQuero && (
              <TabsTrigger value="quero" className={`gap-2 ${queroPendingCount > 0 ? "animate-pulse text-destructive ring-2 ring-destructive" : ""}`}>
                <Bike className="w-4 h-4" /> Quero
                <Badge variant={queroPendingCount > 0 ? "destructive" : "secondary"} className="h-5 min-w-5 px-1.5 text-xs">{queroPendingCount > 0 ? queroPendingCount : queroCount}</Badge>
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setHistoryOpen(true)} className="gap-2">
            <History className="w-4 h-4" /> Histórico de Pedidos
          </Button>
          {canCreatePdv && (
            <Button onClick={() => setPdvOpen(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Novo pedido PDV
            </Button>
          )}
        </div>
      </div>

      {isLoading && orders.length === 0 ? (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-56 w-full" />
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 lg:grid-cols-4 items-start">
          <div className="flex flex-col gap-3 min-w-0">
            {pendingOrders.length > 0 && (
              <Column title="Aguardando aceitação" count={pendingOrders.length} accent="bg-destructive/15 text-destructive">
                {pendingOrders.map(renderCard)}
              </Column>
            )}
            <Column title="Em preparo" count={preparingOrders.length}>
              {preparingOrders.map(renderCard)}
            </Column>
          </div>
          <Column title="Pronto" count={readyOrders.length}>
            {readyOrders.map(renderCard)}
          </Column>
          <Column title="Em entrega" count={outForDeliveryOrders.length}>
            {outForDeliveryOrders.map(renderCard)}
          </Column>
          <Column title="Finalizados" count={finalizedOrders.length}>
            {finalizedOrders.map(renderCard)}
          </Column>
        </div>
      )}

      <AlertDialog
        open={!!cancelTarget}
        onOpenChange={(o) => {
          if (!o) {
            setCancelTarget(null);
            setCancelReason("");
            setCancelCode("INTERNAL_DIFFICULTIES_OF_THE_RESTAURANT");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar este pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget && (
                <>Você está prestes a cancelar o pedido de <strong>{cancelTarget.customer_name}</strong> no valor de <strong>{brl(cancelTarget.total)}</strong>. Esta ação não pode ser desfeita.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {cancelTarget?.external_source === "quero" && (
            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="cancel-code">Motivo do cancelamento</Label>
                <Select value={cancelCode} onValueChange={setCancelCode}>
                  <SelectTrigger id="cancel-code"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INTERNAL_DIFFICULTIES_OF_THE_RESTAURANT">Dificuldades internas do restaurante</SelectItem>
                    <SelectItem value="SYSTEMIC_ISSUES">Problemas sistêmicos</SelectItem>
                    <SelectItem value="DUPLICATE_APPLICATION">Pedido duplicado</SelectItem>
                    <SelectItem value="UNAVAILABLE_ITEM">Item indisponível</SelectItem>
                    <SelectItem value="RESTAURANT_WITHOUT_DELIVERY_MAN">Sem entregador disponível</SelectItem>
                    <SelectItem value="OUTDATED_MENU">Cardápio desatualizado</SelectItem>
                    <SelectItem value="ORDER_OUTSIDE_THE_DELIVERY_AREA">Pedido fora da área de entrega</SelectItem>
                    <SelectItem value="BLOCKED_CUSTOMER">Cliente bloqueado</SelectItem>
                    <SelectItem value="OUTSIDE_DELIVERY_HOURS">Fora do horário de entrega</SelectItem>
                    <SelectItem value="RISK_AREA">Área de risco</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cancel-reason">Descrição (opcional)</Label>
                <Textarea
                  id="cancel-reason"
                  placeholder="Detalhe o motivo do cancelamento"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (cancelTarget) {
                  const isQuero = cancelTarget.external_source === "quero";
                  cancel(cancelTarget, isQuero ? { cancelReason, cancelCode } : undefined);
                  setCancelTarget(null);
                  setCancelReason("");
                  setCancelCode("INTERNAL_DIFFICULTIES_OF_THE_RESTAURANT");
                }
              }}
            >
              Sim, cancelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={queroCancelInfoOpen} onOpenChange={setQueroCancelInfoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelamento indisponível por aqui</AlertDialogTitle>
            <AlertDialogDescription>
              O cancelamento de pedidos do <strong>Quero Delivery</strong> só pode ser feito diretamente pelo <strong>painel do gestor de pedidos do Quero</strong>. Acesse o painel da Quero para concluir o cancelamento — o status será atualizado automaticamente aqui em seguida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setQueroCancelInfoOpen(false)}>Entendi</AlertDialogAction>
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

      <OrderDetailsDialog
        order={detailsTarget}
        items={detailsTarget ? (items[detailsTarget.id] ?? []) : []}
        onClose={() => setDetailsTarget(null)}
        onAdvance={(o) => advance(o as Order)}
        onCancel={(o) => setCancelTarget(o as Order)}
        onDelete={(o) => setDeleteTarget(o as Order)}
        onPrint={(o) => setPrintTarget(o as Order)}
        pending={detailsTarget ? !!pendingAction[detailsTarget.id] : false}
        canChangeStatus={canChangeStatus}
        canEditOrders={canEditOrders}
        canViewFeeBreakdown={canViewFeeBreakdown}
      />

      <PdvDialog open={pdvOpen} onOpenChange={setPdvOpen} restaurantId={restaurantId} />
      <OrderHistoryDialog open={historyOpen} onOpenChange={setHistoryOpen} restaurantId={restaurantId} />

      <Dialog open={!!ifoodCodeTarget} onOpenChange={(o) => { if (!o) { setIfoodCodeTarget(null); setIfoodCodeValue(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar entrega iFood</DialogTitle>
            <DialogDescription>
              Digite o código de entrega informado pelo cliente para confirmar o pedido
              {ifoodCodeTarget ? ` #${ifoodCodeTarget.order_number}` : ""}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="ifood-delivery-code">Código de entrega</Label>
            <Input
              id="ifood-delivery-code"
              value={ifoodCodeValue}
              onChange={(e) => setIfoodCodeValue(e.target.value.replace(/\D/g, ""))}
              placeholder="Ex: 9999"
              inputMode="numeric"
              autoFocus
              onKeyDown={(e) => { if (e.key === "Enter" && !ifoodCodeSubmitting) confirmIfoodDelivery(); }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setIfoodCodeTarget(null); setIfoodCodeValue(""); }} disabled={ifoodCodeSubmitting}>
              Cancelar
            </Button>
            <Button onClick={confirmIfoodDelivery} disabled={ifoodCodeSubmitting || !ifoodCodeValue.trim()}>
              {ifoodCodeSubmitting ? "Confirmando…" : "Confirmar entrega"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
