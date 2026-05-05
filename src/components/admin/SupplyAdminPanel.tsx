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
import { Plus, Pencil, Trash2, Package, ShoppingBag, Truck, CheckCircle2, X, Store } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { SupplyReportsDialog } from "./SupplyReportsDialog";

type SupplyProduct = {
  id: string; name: string; description: string | null; unit: string;
  price: number; image_url: string | null; is_active: boolean; sort_order: number;
  variant_group_name: string | null; total_quantity: number | null; quantity_step: number;
};
type SupplyOption = { id: string; product_id: string; name: string; sort_order: number; is_active: boolean };
type Restaurant = { id: string; name: string; slug: string };
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

const STATUS_FILTERS: { value: SupplyOrder["status"] | "all"; label: string }[] = [
  { value: "pending", label: "Aguardando" },
  { value: "accepted", label: "Aceitos" },
  { value: "shipped", label: "Enviados" },
  { value: "delivered", label: "Entregues" },
  { value: "all", label: "Todos" },
];

export function SupplyOrdersTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<SupplyOrder["status"] | "all">("pending");
  const { data: orders = [] } = useQuery({
    queryKey: ["admin_supply_orders"],
    queryFn: async () => {
      const { data } = await supabase.from("supply_orders")
        .select("*, supply_order_items(*, supply_order_item_options(*))")
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

  const counts = {
    pending: orders.filter(o => o.status === "pending").length,
    accepted: orders.filter(o => o.status === "accepted").length,
    shipped: orders.filter(o => o.status === "shipped").length,
    delivered: orders.filter(o => o.status === "delivered").length,
    all: orders.length,
  };
  const revenue = orders.filter(o => o.status === "delivered").reduce((s, o) => s + Number(o.total), 0);

  const filtered = orders;

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

  const nextAction = (s: SupplyOrder["status"]) => {
    if (s === "pending") return { label: "Aceitar pedido", next: "accepted" as const, icon: CheckCircle2, cls: "bg-blue-600 hover:bg-blue-700" };
    if (s === "accepted") return { label: "Enviar pedido", next: "shipped" as const, icon: Truck, cls: "bg-purple-600 hover:bg-purple-700" };
    if (s === "shipped") return { label: "Marcar como entregue", next: "delivered" as const, icon: Package, cls: "bg-green-600 hover:bg-green-700" };
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-xl font-bold">Pedidos recebidos</h2>
        <SupplyReportsDialog />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatMini label="Aguardando" value={counts.pending} />
        <StatMini label="Aceitos" value={counts.accepted} />
        <StatMini label="Enviados" value={counts.shipped} />
        <StatMini label="Entregues" value={counts.delivered} />
        <StatMini label="Faturamento" value={brl(revenue)} />
      </div>


      {filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum pedido recebido ainda.</CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {filtered.map((o) => {
            const r = restMap[o.restaurant_id];
            const action = nextAction(o.status);
            const active = stepIndex(o.status);
            const isFinished = o.status === "delivered";
            return (
              <Card key={o.id} className="overflow-hidden flex flex-col shadow-soft">
                <CardContent className="p-4 space-y-3 flex-1">
                  <div className="flex justify-between items-start gap-2 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-accent grid place-items-center shrink-0">
                        <Store className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{r?.name ?? "Restaurante removido"}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r && `/${r.slug} · `}{new Date(o.created_at).toLocaleString("pt-BR")}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge className={statusColor[o.status]}>{statusLabel[o.status]}</Badge>
                      <span className="font-bold">{brl(Number(o.total))}</span>
                    </div>
                  </div>
                  <div className="text-sm space-y-2 border-l-2 pl-3">
                    {o.supply_order_items?.map(it => (
                      <div key={it.id}>
                        <div className="flex justify-between">
                          <span>{it.quantity}× {it.product_name}{it.unit ? ` (${it.unit})` : ""}</span>
                          <span className="text-muted-foreground">{brl(Number(it.unit_price) * it.quantity)}</span>
                        </div>
                        {it.supply_order_item_options && it.supply_order_item_options.length > 0 && (
                          <div className="ml-4 text-xs text-muted-foreground">
                            {it.supply_order_item_options.map(op => (
                              <div key={op.id}>↳ {op.quantity}× {op.option_name}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  {o.notes && <div className="text-xs italic text-muted-foreground">"{o.notes}"</div>}
                </CardContent>
                <div className="border-t bg-muted/20 px-4 py-3">
                  <div className="text-xs font-semibold text-foreground mb-2">Acompanhamento</div>
                  <div className="flex items-center justify-between gap-2">
                    {STEPS.map((step, idx) => {
                      const reached = idx <= active;
                      const isCurrent = idx === active && !isFinished;
                      const isDone = reached && !isCurrent;
                      return (
                        <div key={step.key} className="flex items-center flex-1 last:flex-none">
                          <div className="flex items-center gap-2">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                              isDone
                                ? "bg-green-500 text-white"
                                : isCurrent
                                  ? "bg-orange-500 text-white"
                                  : "bg-muted text-muted-foreground"
                            }`}>
                              {isDone ? <CheckCircle2 className="w-4 h-4" /> : idx + 1}
                            </div>
                            <span className={`text-xs whitespace-nowrap ${reached ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                              {step.label}
                            </span>
                          </div>
                          {idx < STEPS.length - 1 && (
                            <div className={`h-0.5 flex-1 mx-2 ${idx < active ? "bg-green-500" : "bg-border"}`} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {action && (
                  <button
                    onClick={() => setStatus(o, action.next)}
                    className={`w-full text-white font-semibold py-3 flex items-center justify-center gap-2 transition-colors ${action.cls}`}
                  >
                    <action.icon className="w-5 h-5" />
                    {action.label}
                  </button>
                )}
                {o.status === "delivered" && (
                  <div className="w-full bg-green-600/10 text-green-700 dark:text-green-400 font-semibold py-3 text-center flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-5 h-5" /> Pedido finalizado
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
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
  const [hasVariants, setHasVariants] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [totalQty, setTotalQty] = useState<number | "">("");
  const [step, setStep] = useState<number>(50);
  const [options, setOptions] = useState<{ id?: string; name: string }[]>([]);
  const [newOpt, setNewOpt] = useState("");

  const { data: products = [] } = useQuery({
    queryKey: ["admin_supply_products"],
    queryFn: async () => {
      const { data } = await supabase.from("supply_products")
        .select("*").order("sort_order").order("name");
      return (data ?? []) as SupplyProduct[];
    },
  });

  const { data: allOptions = [] } = useQuery({
    queryKey: ["admin_supply_options"],
    queryFn: async () => {
      const { data } = await supabase.from("supply_product_options").select("*").order("sort_order");
      return (data ?? []) as SupplyOption[];
    },
  });
  const optsByProduct: Record<string, SupplyOption[]> = {};
  allOptions.forEach(o => { (optsByProduct[o.product_id] ??= []).push(o); });

  const openNew = () => {
    setEditing(null);
    setHasVariants(false); setGroupName(""); setTotalQty(""); setStep(50); setOptions([]); setNewOpt("");
    setOpen(true);
  };
  const openEdit = (p: SupplyProduct) => {
    setEditing(p);
    const has = !!p.variant_group_name;
    setHasVariants(has);
    setGroupName(p.variant_group_name ?? "");
    setTotalQty(p.total_quantity ?? "");
    setStep(p.quantity_step ?? 50);
    setOptions((optsByProduct[p.id] ?? []).map(o => ({ id: o.id, name: o.name })));
    setNewOpt("");
    setOpen(true);
  };

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
      variant_group_name: hasVariants ? (groupName.trim() || null) : null,
      total_quantity: hasVariants && totalQty !== "" ? Number(totalQty) : null,
      quantity_step: hasVariants ? Math.max(1, Number(step) || 50) : 50,
    };
    if (!payload.name) return toast.error("Nome obrigatório");
    if (hasVariants) {
      if (!payload.variant_group_name) return toast.error("Nome do subgrupo obrigatório");
      if (!payload.total_quantity || payload.total_quantity <= 0) return toast.error("Quantidade total obrigatória");
      if (options.filter(o => o.name.trim()).length === 0) return toast.error("Cadastre ao menos uma opção");
    }

    let productId = editing?.id;
    if (editing) {
      const { error } = await supabase.from("supply_products").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
    } else {
      const { data, error } = await supabase.from("supply_products").insert(payload).select().single();
      if (error || !data) return toast.error(error?.message ?? "Erro");
      productId = data.id;
    }

    if (productId) {
      // Replace options
      await supabase.from("supply_product_options").delete().eq("product_id", productId);
      if (hasVariants && options.length) {
        const rows = options.filter(o => o.name.trim()).map((o, i) => ({
          product_id: productId!, name: o.name.trim(), sort_order: i, is_active: true,
        }));
        if (rows.length) {
          const { error } = await supabase.from("supply_product_options").insert(rows);
          if (error) return toast.error(error.message);
        }
      }
    }

    toast.success("Salvo");
    setOpen(false); setEditing(null);
    qc.invalidateQueries({ queryKey: ["admin_supply_products"] });
    qc.invalidateQueries({ queryKey: ["admin_supply_options"] });
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

  const addOption = () => {
    const v = newOpt.trim();
    if (!v) return;
    setOptions(o => [...o, { name: v }]);
    setNewOpt("");
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild><Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Novo insumo</Button></DialogTrigger>
          <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"} insumo</DialogTitle></DialogHeader>
            <form onSubmit={save} className="space-y-3">
              <div><Label>Nome</Label><Input name="name" defaultValue={editing?.name} required maxLength={120} /></div>
              <div><Label>Descrição</Label><Textarea name="description" defaultValue={editing?.description ?? ""} maxLength={500} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Preço</Label><Input name="price" type="number" step="0.01" min="0" defaultValue={editing?.price ?? 0} required /></div>
                <div><Label>Unidade</Label><Input name="unit" defaultValue={editing?.unit ?? "un"} placeholder="un, kg, cx..." /></div>
              </div>
              <div><Label>URL da imagem (opcional)</Label><Input name="image_url" defaultValue={editing?.image_url ?? ""} /></div>

              <div className="rounded-lg border p-3 space-y-3 bg-muted/30">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base">Quantidade limitadora?</Label>
                    <p className="text-xs text-muted-foreground">Ex.: pacote de 1000 coxinhas dividido em sabores</p>
                  </div>
                  <Switch checked={hasVariants} onCheckedChange={setHasVariants} />
                </div>

                {hasVariants && (
                  <div className="space-y-3 pt-2 border-t">
                    <div>
                      <Label>Nome do subgrupo</Label>
                      <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Ex.: Sabores" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Quantidade total</Label>
                        <Input type="number" min="1" value={totalQty} onChange={(e) => setTotalQty(e.target.value === "" ? "" : Number(e.target.value))} placeholder="1000" />
                      </div>
                      <div>
                        <Label>Passo (incremento)</Label>
                        <Input type="number" min="1" value={step} onChange={(e) => setStep(Number(e.target.value) || 50)} placeholder="50" />
                      </div>
                    </div>
                    <div>
                      <Label>Opções (ex.: sabores)</Label>
                      <div className="flex gap-2">
                        <Input value={newOpt} onChange={(e) => setNewOpt(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addOption(); } }}
                          placeholder="Frango, Carne, Queijo..." />
                        <Button type="button" variant="outline" onClick={addOption}>Adicionar</Button>
                      </div>
                      {options.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {options.map((o, i) => (
                            <Badge key={i} variant="secondary" className="gap-1 pr-1">
                              {o.name}
                              <button type="button" onClick={() => setOptions(arr => arr.filter((_, idx) => idx !== i))}
                                className="hover:bg-destructive/20 rounded p-0.5"><X className="w-3 h-3" /></button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

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
                  {p.variant_group_name && (
                    <div className="text-xs text-muted-foreground mt-1">
                      {p.variant_group_name} · total {p.total_quantity} (passo {p.quantity_step})
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-2">
                    <Switch checked={p.is_active} onCheckedChange={() => toggleActive(p)} />
                    <span className="text-xs text-muted-foreground">{p.is_active ? "Ativo" : "Inativo"}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(p)}><Pencil className="w-4 h-4" /></Button>
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
