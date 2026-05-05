import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Minus, Plus, ArrowLeft, Plus as PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";

type SupplyProduct = {
  id: string; name: string; description: string | null; unit: string;
  price: number; image_url: string | null; is_active: boolean;
};

type SupplyOrder = {
  id: string; restaurant_id: string; status: "pending"|"accepted"|"shipped"|"delivered";
  total: number; notes: string | null; created_at: string;
  supply_order_items?: { id: string; product_name: string; unit_price: number; quantity: number; unit: string | null }[];
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
  const [cart, setCart] = useState<Record<string, number>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ["supply_products"],
    queryFn: async () => {
      const { data } = await supabase.from("supply_products").select("*").eq("is_active", true).order("sort_order").order("name");
      return (data ?? []) as SupplyProduct[];
    },
  });

  const { data: orders = [] } = useQuery({
    queryKey: ["supply_orders", restaurantId],
    queryFn: async () => {
      const { data } = await supabase.from("supply_orders")
        .select("*, supply_order_items(*)")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false });
      return (data ?? []) as SupplyOrder[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel(`supply_orders_mgr_${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "supply_orders", filter: `restaurant_id=eq.${restaurantId}` },
        () => qc.invalidateQueries({ queryKey: ["supply_orders", restaurantId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [restaurantId, qc]);

  const total = useMemo(
    () => products.reduce((s, p) => s + (cart[p.id] ?? 0) * Number(p.price), 0),
    [cart, products]
  );

  const updateQty = (id: string, delta: number) =>
    setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] ?? 0) + delta) }));

  const submitOrder = async () => {
    const items = products.filter((p) => (cart[p.id] ?? 0) > 0);
    if (!items.length) return toast.error("Adicione ao menos um item");
    setSubmitting(true);
    const { data: order, error } = await supabase.from("supply_orders").insert({
      restaurant_id: restaurantId, created_by: user?.id, total, notes: notes || null,
    }).select().single();
    if (error || !order) { setSubmitting(false); return toast.error(error?.message ?? "Erro"); }
    const rows = items.map((p) => ({
      supply_order_id: order.id, product_id: p.id, product_name: p.name,
      unit: p.unit, unit_price: Number(p.price), quantity: cart[p.id],
    }));
    const { error: e2 } = await supabase.from("supply_order_items").insert(rows);
    setSubmitting(false);
    if (e2) return toast.error(e2.message);
    setCart({}); setNotes("");
    toast.success("Pedido enviado!");
    qc.invalidateQueries({ queryKey: ["supply_orders", restaurantId] });
  };

  return (
    <Tabs defaultValue="new" className="space-y-4">
      <TabsList>
        <TabsTrigger value="new"><ShoppingCart className="w-4 h-4 mr-2" />Novo pedido</TabsTrigger>
        <TabsTrigger value="history"><Package className="w-4 h-4 mr-2" />Meus pedidos ({orders.length})</TabsTrigger>
      </TabsList>

      <TabsContent value="new" className="space-y-4">
        {products.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            Nenhum insumo disponível no momento.
          </CardContent></Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <div className="grid gap-3 sm:grid-cols-2">
              {products.map((p) => {
                const qty = cart[p.id] ?? 0;
                return (
                  <Card key={p.id} className={qty > 0 ? "ring-2 ring-primary" : ""}>
                    <CardContent className="p-4 flex gap-3">
                      {p.image_url && <img src={p.image_url} alt={p.name} className="w-16 h-16 rounded object-cover" />}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{p.name}</div>
                        {p.description && <div className="text-xs text-muted-foreground line-clamp-2">{p.description}</div>}
                        <div className="text-sm font-semibold mt-1">{brl(Number(p.price))} <span className="text-xs text-muted-foreground font-normal">/ {p.unit}</span></div>
                      </div>
                      <div className="flex items-center gap-1 self-center">
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQty(p.id, -1)} disabled={qty === 0}><Minus className="w-3 h-3" /></Button>
                        <span className="w-6 text-center text-sm font-semibold">{qty}</span>
                        <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => updateQty(p.id, 1)}><Plus className="w-3 h-3" /></Button>
                      </div>
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
                      <div key={p.id} className="flex justify-between gap-2">
                        <span className="truncate">{cart[p.id]}× {p.name}</span>
                        <span className="font-medium">{brl(cart[p.id] * Number(p.price))}</span>
                      </div>
                    ))}
                  </div>
                )}
                <Input placeholder="Observações (opcional)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
                <div className="flex justify-between font-bold pt-2 border-t">
                  <span>Total</span><span>{brl(total)}</span>
                </div>
                <Button className="w-full" onClick={submitOrder} disabled={submitting || total === 0}>
                  {submitting ? "Enviando..." : "Enviar pedido"}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </TabsContent>

      <TabsContent value="history" className="space-y-3">
        {orders.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum pedido ainda.</CardContent></Card>
        ) : orders.map((o) => (
          <Card key={o.id}>
            <CardContent className="p-4 space-y-2">
              <div className="flex justify-between items-start gap-2 flex-wrap">
                <div>
                  <div className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString("pt-BR")}</div>
                  <div className="font-semibold">{brl(Number(o.total))}</div>
                </div>
                <Badge className={statusColor[o.status]}>{statusLabel[o.status]}</Badge>
              </div>
              <div className="text-sm space-y-1">
                {o.supply_order_items?.map(it => (
                  <div key={it.id} className="flex justify-between text-muted-foreground">
                    <span>{it.quantity}× {it.product_name}</span>
                    <span>{brl(Number(it.unit_price) * it.quantity)}</span>
                  </div>
                ))}
              </div>
              {o.notes && <div className="text-xs text-muted-foreground italic">"{o.notes}"</div>}
            </CardContent>
          </Card>
        ))}
      </TabsContent>
    </Tabs>
  );
}
