import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Package, ShoppingBag, Truck, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";

type SupplyProduct = {
  id: string; name: string; description: string | null; unit: string;
  price: number; image_url: string | null; is_active: boolean; sort_order: number;
};
type Restaurant = { id: string; name: string; slug: string };
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

export function SupplyAdminPanel() {
  return (
    <Tabs defaultValue="orders" className="space-y-4">
      <TabsList>
        <TabsTrigger value="orders"><ShoppingBag className="w-4 h-4 mr-2" />Pedidos recebidos</TabsTrigger>
        <TabsTrigger value="catalog"><Package className="w-4 h-4 mr-2" />Catálogo de insumos</TabsTrigger>
      </TabsList>
      <TabsContent value="orders"><SupplyOrdersTab /></TabsContent>
      <TabsContent value="catalog"><SupplyCatalogTab /></TabsContent>
    </Tabs>
  );
}

export function SupplyOrdersTab() {
  const qc = useQueryClient();
  const { data: orders = [] } = useQuery({
    queryKey: ["admin_supply_orders"],
    queryFn: async () => {
      const { data } = await supabase.from("supply_orders")
        .select("*, supply_order_items(*)")
        .order("created_at", { ascending: false });
      return (data ?? []) as SupplyOrder[];
    },
  });
  const { data: restaurants = [] } = useQuery({
    queryKey: ["all_restaurants_min"],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants").select("id,name,slug");
      return (data ?? []) as Restaurant[];
    },
  });
  const restMap = Object.fromEntries(restaurants.map(r => [r.id, r]));

  useEffect(() => {
    const ch = supabase.channel("admin_supply_orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "supply_orders" },
        () => qc.invalidateQueries({ queryKey: ["admin_supply_orders"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const setStatus = async (o: SupplyOrder, status: SupplyOrder["status"]) => {
    const stamps: Record<string, string> = {};
    if (status === "accepted") stamps.accepted_at = new Date().toISOString();
    if (status === "shipped") stamps.shipped_at = new Date().toISOString();
    if (status === "delivered") stamps.delivered_at = new Date().toISOString();
    const { error } = await supabase.from("supply_orders").update({ status, ...stamps }).eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("Status atualizado");
    qc.invalidateQueries({ queryKey: ["admin_supply_orders"] });
  };

  const stats = {
    pending: orders.filter(o => o.status === "pending").length,
    accepted: orders.filter(o => o.status === "accepted").length,
    shipped: orders.filter(o => o.status === "shipped").length,
    delivered: orders.filter(o => o.status === "delivered").length,
    revenue: orders.filter(o => o.status === "delivered").reduce((s, o) => s + Number(o.total), 0),
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatMini label="Aguardando" value={stats.pending} />
        <StatMini label="Aceitos" value={stats.accepted} />
        <StatMini label="Enviados" value={stats.shipped} />
        <StatMini label="Entregues" value={stats.delivered} />
        <StatMini label="Faturamento" value={brl(stats.revenue)} />
      </div>

      {orders.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum pedido recebido.</CardContent></Card>
      ) : orders.map((o) => {
        const r = restMap[o.restaurant_id];
        return (
          <Card key={o.id}>
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-start gap-2 flex-wrap">
                <div>
                  <div className="font-semibold">{r?.name ?? "Restaurante removido"}</div>
                  <div className="text-xs text-muted-foreground">
                    {r && `/${r.slug} · `}{new Date(o.created_at).toLocaleString("pt-BR")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={statusColor[o.status]}>{statusLabel[o.status]}</Badge>
                  <span className="font-bold">{brl(Number(o.total))}</span>
                </div>
              </div>
              <div className="text-sm space-y-1 border-l-2 pl-3">
                {o.supply_order_items?.map(it => (
                  <div key={it.id} className="flex justify-between">
                    <span>{it.quantity}× {it.product_name}{it.unit ? ` (${it.unit})` : ""}</span>
                    <span className="text-muted-foreground">{brl(Number(it.unit_price) * it.quantity)}</span>
                  </div>
                ))}
              </div>
              {o.notes && <div className="text-xs italic text-muted-foreground">"{o.notes}"</div>}
              <div className="flex gap-2 flex-wrap">
                {o.status === "pending" && (
                  <Button size="sm" onClick={() => setStatus(o, "accepted")}><CheckCircle2 className="w-4 h-4 mr-1" />Aceitar pedido</Button>
                )}
                {o.status === "accepted" && (
                  <Button size="sm" onClick={() => setStatus(o, "shipped")}><Truck className="w-4 h-4 mr-1" />Enviar pedido</Button>
                )}
                {o.status === "shipped" && (
                  <Button size="sm" onClick={() => setStatus(o, "delivered")}><Package className="w-4 h-4 mr-1" />Marcar entregue</Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string | number }) {
  return (
    <Card><CardContent className="pt-4 pb-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">{value}</div>
    </CardContent></Card>
  );
}

export function SupplyCatalogTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SupplyProduct | null>(null);

  const { data: products = [] } = useQuery({
    queryKey: ["admin_supply_products"],
    queryFn: async () => {
      const { data } = await supabase.from("supply_products").select("*").order("sort_order").order("name");
      return (data ?? []) as SupplyProduct[];
    },
  });

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name") || "").trim(),
      description: String(fd.get("description") || "").trim() || null,
      unit: String(fd.get("unit") || "un").trim(),
      price: Number(fd.get("price") || 0),
      image_url: String(fd.get("image_url") || "").trim() || null,
      is_active: true,
    };
    if (!payload.name) return toast.error("Nome obrigatório");
    const { error } = editing
      ? await supabase.from("supply_products").update(payload).eq("id", editing.id)
      : await supabase.from("supply_products").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Salvo");
    setOpen(false); setEditing(null);
    qc.invalidateQueries({ queryKey: ["admin_supply_products"] });
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir este insumo?")) return;
    const { error } = await supabase.from("supply_products").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin_supply_products"] });
  };

  const toggleActive = async (p: SupplyProduct) => {
    await supabase.from("supply_products").update({ is_active: !p.is_active }).eq("id", p.id);
    qc.invalidateQueries({ queryKey: ["admin_supply_products"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Novo insumo</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"} insumo</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-3">
              <div><Label>Nome</Label><Input name="name" defaultValue={editing?.name} required maxLength={120} /></div>
              <div><Label>Descrição</Label><Textarea name="description" defaultValue={editing?.description ?? ""} maxLength={500} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Preço</Label><Input name="price" type="number" step="0.01" min="0" defaultValue={editing?.price ?? 0} required /></div>
                <div><Label>Unidade</Label><Input name="unit" defaultValue={editing?.unit ?? "un"} placeholder="un, kg, cx..." /></div>
              </div>
              <div><Label>URL da imagem (opcional)</Label><Input name="image_url" defaultValue={editing?.image_url ?? ""} /></div>
              <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {products.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum insumo cadastrado.</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map(p => (
            <Card key={p.id} className={!p.is_active ? "opacity-60" : ""}>
              <CardContent className="p-4 flex gap-3">
                {p.image_url && <img src={p.image_url} alt={p.name} className="w-16 h-16 rounded object-cover" />}
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-sm font-semibold">{brl(Number(p.price))} <span className="text-xs text-muted-foreground font-normal">/ {p.unit}</span></div>
                  <div className="flex items-center gap-2 mt-2">
                    <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />
                    <span className="text-xs text-muted-foreground">{p.is_active ? "Ativo" : "Inativo"}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(p.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
