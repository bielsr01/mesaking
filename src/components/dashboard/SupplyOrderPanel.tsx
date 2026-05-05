import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Minus, Plus, ArrowLeft, Plus as PlusIcon, Clock, Truck, Package, Check } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";

type SupplyProduct = {
  id: string; name: string; description: string | null; unit: string;
  price: number; image_url: string | null; is_active: boolean;
  variant_group_name: string | null; total_quantity: number | null; quantity_step: number;
};
type SupplyOption = { id: string; product_id: string; name: string; sort_order: number; is_active: boolean };

type SupplyOrder = {
  id: string; restaurant_id: string; status: "pending"|"accepted"|"shipped"|"delivered";
  total: number; notes: string | null; created_at: string;
  supply_order_items?: {
    id: string; product_name: string; unit_price: number; quantity: number; unit: string | null;
    supply_order_item_options?: { id: string; option_name: string; quantity: number }[];
  }[];
};

const statusLabel: Record<SupplyOrder["status"], string> = {
  pending: "Aguardando aceite", accepted: "Aceito", shipped: "Enviado", delivered: "Entregue"
};
const statusColor: Record<SupplyOrder["status"], string> = {
  pending: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400",
  accepted: "bg-blue-500/20 text-blue-700 dark:text-blue-400",
  shipped: "bg-purple-500/20 text-purple-700 dark:text-purple-400",
  delivered: "bg-green-500/20 text-green-700 dark:text-green-400",
};

export function SupplyOrderPanel({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [view, setView] = useState<"history" | "new">("history");
  // For non-variant: cart[productId] = qty. For variant: cart[productId] = "pkg" (count of packages)
  const [cart, setCart] = useState<Record<string, number>>({});
  // For variant products: distribution[productId][optionName] = qty
  const [dist, setDist] = useState<Record<string, Record<string, number>>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<"pending"|"accepted"|"shipped"|"delivered"|"all">("pending");

  const { data: products = [] } = useQuery({
    queryKey: ["supply_products"],
    queryFn: async () => {
      const { data } = await supabase.from("supply_products").select("*").eq("is_active", true).order("sort_order").order("name");
      return (data ?? []) as SupplyProduct[];
    },
  });

  const { data: allOptions = [] } = useQuery({
    queryKey: ["supply_product_options"],
    queryFn: async () => {
      const { data } = await supabase.from("supply_product_options").select("*").eq("is_active", true).order("sort_order");
      return (data ?? []) as SupplyOption[];
    },
  });
  const optsByProduct: Record<string, SupplyOption[]> = {};
  allOptions.forEach(o => { (optsByProduct[o.product_id] ??= []).push(o); });

  const { data: orders = [] } = useQuery({
    queryKey: ["supply_orders", restaurantId],
    queryFn: async () => {
      const { data } = await supabase.from("supply_orders")
        .select("*, supply_order_items(*, supply_order_item_options(*))")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false });
      return (data ?? []) as SupplyOrder[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel(`supply_orders_mgr_${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "supply_orders", filter: `restaurant_id=eq.${restaurantId}` },
        () => qc.invalidateQueries({ queryKey: ["supply_orders", restaurantId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "supply_products" },
        () => qc.invalidateQueries({ queryKey: ["supply_products"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "supply_product_options" },
        () => qc.invalidateQueries({ queryKey: ["supply_product_options"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [restaurantId, qc]);

  const total = useMemo(
    () => products.reduce((s, p) => s + (cart[p.id] ?? 0) * Number(p.price), 0),
    [cart, products]
  );

  const updateQty = (id: string, delta: number) =>
    setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + delta) }));

  const setOptionQty = (productId: string, optionName: string, qty: number) => {
    setDist(d => ({ ...d, [productId]: { ...(d[productId] ?? {}), [optionName]: qty } }));
  };

  const distSum = (productId: string) =>
    Object.values(dist[productId] ?? {}).reduce((s, n) => s + n, 0);

  const submitOrder = async () => {
    const items = products.filter((p) => (cart[p.id] ?? 0) > 0);
    if (!items.length) return toast.error("Adicione ao menos um item");

    // Validate variant distributions
    for (const p of items) {
      if (p.variant_group_name && p.total_quantity) {
        const expected = (cart[p.id] ?? 0) * p.total_quantity;
        const sum = distSum(p.id);
        if (sum !== expected) {
          return toast.error(`${p.name}: distribua exatamente ${expected} (atual: ${sum})`);
        }
      }
    }

    setSubmitting(true);
    const { data: order, error } = await supabase.from("supply_orders").insert({
      restaurant_id: restaurantId, created_by: user?.id, total, notes: notes || null,
    }).select().single();
    if (error || !order) { setSubmitting(false); return toast.error(error?.message ?? "Erro"); }

    const rows = items.map((p) => ({
      supply_order_id: order.id, product_id: p.id, product_name: p.name,
      unit: p.unit, unit_price: Number(p.price), quantity: cart[p.id],
    }));
    const { data: insertedItems, error: e2 } = await supabase.from("supply_order_items").insert(rows).select();
    if (e2 || !insertedItems) { setSubmitting(false); return toast.error(e2?.message ?? "Erro"); }

    // Insert option distributions
    const optRows: { supply_order_item_id: string; option_name: string; quantity: number }[] = [];
    insertedItems.forEach((it) => {
      const p = products.find(pp => pp.id === it.product_id);
      if (!p?.variant_group_name) return;
      Object.entries(dist[p.id] ?? {}).forEach(([name, q]) => {
        if (q > 0) optRows.push({ supply_order_item_id: it.id, option_name: name, quantity: q });
      });
    });
    if (optRows.length) {
      const { error: e3 } = await supabase.from("supply_order_item_options").insert(optRows);
      if (e3) { setSubmitting(false); return toast.error(e3.message); }
    }

    setSubmitting(false);
    setCart({}); setDist({}); setNotes("");
    toast.success("Pedido enviado!");
    qc.invalidateQueries({ queryKey: ["supply_orders", restaurantId] });
    setView("history");
  };

  if (view === "new") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setView("history")}>
            <ArrowLeft className="w-4 h-4 mr-1" />Voltar
          </Button>
          <h2 className="text-lg font-semibold">Novo pedido</h2>
          <div className="w-20" />
        </div>

        {products.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            Nenhum insumo disponível no momento.
          </CardContent></Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="grid gap-3">
              {products.map((p) => {
                const qty = cart[p.id] ?? 0;
                const hasVariants = !!p.variant_group_name && !!p.total_quantity;
                const opts = optsByProduct[p.id] ?? [];
                const expectedTotal = hasVariants ? qty * (p.total_quantity ?? 0) : 0;
                const currentSum = distSum(p.id);
                const remaining = expectedTotal - currentSum;
                return (
                  <Card key={p.id} className={qty > 0 ? "ring-2 ring-primary" : ""}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex gap-3">
                        {p.image_url && <img src={p.image_url} alt={p.name} className="w-16 h-16 rounded object-cover" />}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{p.name}</div>
                          {p.description && <div className="text-xs text-muted-foreground line-clamp-2">{p.description}</div>}
                          <div className="text-sm font-semibold mt-1">{brl(Number(p.price))} <span className="text-xs text-muted-foreground font-normal">/ {p.unit}</span></div>
                          {hasVariants && <div className="text-xs text-muted-foreground mt-1">Pacote com {p.total_quantity} · subgrupo: {p.variant_group_name}</div>}
                        </div>
                        <div className="flex items-center gap-1 self-center">
                          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQty(p.id, -1)} disabled={qty === 0}><Minus className="w-3 h-3" /></Button>
                          <span className="w-6 text-center text-sm font-semibold">{qty}</span>
                          <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQty(p.id, 1)}><Plus className="w-3 h-3" /></Button>
                        </div>
                      </div>

                      {hasVariants && qty > 0 && opts.length > 0 && (
                        <div className="rounded-md border p-3 space-y-3 bg-muted/30">
                          <div className="flex justify-between text-xs">
                            <span className="font-medium">{p.variant_group_name}</span>
                            <span className={remaining === 0 ? "text-green-600 font-semibold" : remaining < 0 ? "text-destructive font-semibold" : "text-muted-foreground"}>
                              {currentSum} / {expectedTotal} {remaining !== 0 && `(${remaining > 0 ? "+" : ""}${remaining})`}
                            </span>
                          </div>
                          {opts.map(op => {
                            const v = dist[p.id]?.[op.name] ?? 0;
                            return (
                              <div key={op.id} className="space-y-1">
                                <div className="flex justify-between text-sm">
                                  <span>{op.name}</span>
                                  <span className="font-semibold">{v}</span>
                                </div>
                                <Slider
                                  value={[v]}
                                  min={0}
                                  max={expectedTotal}
                                  step={p.quantity_step || 50}
                                  onValueChange={([nv]) => setOptionQty(p.id, op.name, nv)}
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <Card className="h-fit lg:sticky lg:top-20">
              <CardHeader><CardTitle className="text-base">Resumo</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(cart).filter(([,q]) => q > 0).length === 0 ? (
                  <p className="text-sm text-muted-foreground">Selecione os insumos.</p>
                ) : (
                  <div className="space-y-2 text-sm">
                    {products.filter(p => (cart[p.id] ?? 0) > 0).map(p => (
                      <div key={p.id} className="space-y-0.5">
                        <div className="flex justify-between gap-2">
                          <span className="truncate">{cart[p.id]}× {p.name}</span>
                          <span className="font-medium">{brl(cart[p.id] * Number(p.price))}</span>
                        </div>
                        {p.variant_group_name && (
                          <div className="text-xs text-muted-foreground ml-2">
                            {Object.entries(dist[p.id] ?? {}).filter(([,q]) => q > 0).map(([n, q]) => `${q}× ${n}`).join(", ") || "—"}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Observações</label>
                  <Textarea
                    placeholder="Ex: entregar pela manhã, trocar sabor X por Y..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={500}
                    rows={3}
                  />
                </div>
                <div className="flex justify-between font-bold pt-2 border-t">
                  <span>Total</span><span>{brl(total)}</span>
                </div>
                <Button className="w-full" onClick={async () => { await submitOrder(); }} disabled={submitting || total === 0}>
                  {submitting ? "Enviando..." : "Enviar pedido"}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    );
  }

  const counts = {
    pending: orders.filter(o => o.status === "pending").length,
    accepted: orders.filter(o => o.status === "accepted").length,
    shipped: orders.filter(o => o.status === "shipped").length,
    delivered: orders.filter(o => o.status === "delivered").length,
    all: orders.length,
  };
  const FILTERS = [
    { value: "pending", label: "Aguardando", icon: Clock },
    { value: "accepted", label: "Aceitos", icon: Check },
    { value: "shipped", label: "Enviados", icon: Truck },
    { value: "delivered", label: "Entregues", icon: Package },
    { value: "all", label: "Todos", icon: null },
  ] as const;
  const filtered = filter === "all" ? orders : orders.filter(o => o.status === filter);

  const STEPS = [
    { key: "pending", label: "Pendente" },
    { key: "shipped", label: "Enviado" },
    { key: "delivered", label: "Entregue" },
  ] as const;
  const stepIndex = (s: SupplyOrder["status"]) => {
    if (s === "delivered") return 2;
    if (s === "shipped") return 1;
    return 0;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-2xl font-bold">Meus pedidos</h2>
        <Button
          size="lg"
          onClick={() => setView("new")}
          className="bg-orange-500 hover:bg-orange-600 text-white font-semibold text-base px-6 h-12 shadow-md"
        >
          <PlusIcon className="w-5 h-5 mr-2" />Novo pedido
        </Button>
      </div>

      {orders.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum pedido nesta categoria.</CardContent></Card>
      ) : (
        <div className="flex flex-col gap-4">
          {orders.map((o) => {
            const active = stepIndex(o.status);
            const isFinished = o.status === "delivered";
            return (
              <Card key={o.id} className="w-full overflow-hidden shadow-soft">
                <CardContent className="p-5 space-y-3">
                  <div className="flex justify-between items-start gap-2 flex-wrap">
                    <div>
                      <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</div>
                      <div className="font-bold text-xl">{brl(Number(o.total))}</div>
                    </div>
                    <Badge className={statusColor[o.status]}>{statusLabel[o.status]}</Badge>
                  </div>
                  <div className="text-sm space-y-1 border-l-2 pl-3">
                    {o.supply_order_items?.map(it => (
                      <div key={it.id}>
                        <div className="flex justify-between text-muted-foreground">
                          <span>{it.quantity}× {it.product_name}</span>
                          <span>{brl(Number(it.unit_price) * it.quantity)}</span>
                        </div>
                        {it.supply_order_item_options && it.supply_order_item_options.length > 0 && (
                          <div className="ml-3 text-xs text-muted-foreground">
                            {it.supply_order_item_options.map(op => `${op.quantity}× ${op.option_name}`).join(" · ")}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {o.notes && <div className="text-xs text-muted-foreground italic">"{o.notes}"</div>}
                </CardContent>
                <div className="border-t bg-muted/20 px-5 py-4">
                  <div className="text-xs font-semibold text-foreground mb-3">Acompanhamento</div>
                  <div className="flex items-center justify-between gap-2">
                    {STEPS.map((step, idx) => {
                      const reached = idx <= active;
                      const isPendingStep = idx === 0 && o.status === "pending";
                      const isDone = reached && !isPendingStep;
                      return (
                        <div key={step.key} className="flex items-center flex-1 last:flex-none">
                          <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                              isDone
                                ? "bg-green-500 text-white"
                                : isPendingStep
                                  ? "bg-orange-500 text-white"
                                  : "bg-muted text-muted-foreground"
                            }`}>
                              {isDone ? <Check className="w-4 h-4" /> : idx + 1}
                            </div>
                            <span className={`text-sm whitespace-nowrap ${reached ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                              {step.label}
                            </span>
                          </div>
                          {idx < STEPS.length - 1 && (
                            <div className={`h-0.5 flex-1 mx-3 ${idx < active ? "bg-green-500" : "bg-border"}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
