import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertTriangle, Package, History, Settings2 } from "lucide-react";
import { toast } from "sonner";

type StockGroup = { id: string; name: string; is_active: boolean; allow_add: boolean; allow_subtract: boolean; allow_set: boolean };
type StockRow = { id: string; group_id: string; quantity: number; updated_at: string };
type Movement = {
  id: string; group_id: string; quantity: number; type: string;
  notes: string | null; created_at: string; reference_id: string | null;
};

const movementLabel: Record<string, string> = {
  supply_delivery: "Entrega de insumo",
  order_consumption: "Pedido aceito",
  order_revert: "Pedido revertido",
  manual_adjust: "Ajuste manual",
};

export function StockPanel({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();

  const { data: groups = [] } = useQuery({
    queryKey: ["stock_groups"],
    queryFn: async () => {
      const { data } = await supabase.from("stock_groups").select("*").eq("is_active", true).order("sort_order");
      return (data ?? []) as StockGroup[];
    },
  });

  const { data: stock = [] } = useQuery({
    queryKey: ["restaurant_stock", restaurantId],
    queryFn: async () => {
      const { data } = await supabase.from("restaurant_stock").select("*").eq("restaurant_id", restaurantId);
      return (data ?? []) as StockRow[];
    },
  });

  const { data: movements = [] } = useQuery({
    queryKey: ["stock_movements", restaurantId],
    queryFn: async () => {
      const { data } = await supabase.from("stock_movements").select("*")
        .eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(200);
      return (data ?? []) as Movement[];
    },
  });

  const orderRefIds = Array.from(new Set(
    movements.filter(m => (m.type === "order_consumption" || m.type === "order_revert") && m.reference_id).map(m => m.reference_id as string)
  ));

  const { data: orderInfo = {} } = useQuery({
    queryKey: ["stock_movement_orders", restaurantId, orderRefIds.join(",")],
    enabled: orderRefIds.length > 0,
    queryFn: async () => {
      const { data: orders } = await supabase
        .from("orders")
        .select("id,order_number,customer_name,customer_phone")
        .in("id", orderRefIds);
      const { data: items } = await supabase
        .from("order_items")
        .select("order_id,product_name,quantity")
        .in("order_id", orderRefIds);
      const map: Record<string, { number: number; name: string; phone: string; items: { name: string; qty: number }[] }> = {};
      (orders ?? []).forEach((o: any) => {
        map[o.id] = { number: o.order_number, name: o.customer_name, phone: o.customer_phone, items: [] };
      });
      (items ?? []).forEach((it: any) => {
        if (map[it.order_id]) map[it.order_id].items.push({ name: it.product_name, qty: it.quantity });
      });
      return map;
    },
  });

  useEffect(() => {
    const ch = supabase.channel(`stock-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_stock", filter: `restaurant_id=eq.${restaurantId}` },
        () => qc.invalidateQueries({ queryKey: ["restaurant_stock", restaurantId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "stock_movements", filter: `restaurant_id=eq.${restaurantId}` },
        () => qc.invalidateQueries({ queryKey: ["stock_movements", restaurantId] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [restaurantId, qc]);

  const stockMap = Object.fromEntries(stock.map(s => [s.group_id, s]));
  const groupMap = Object.fromEntries(groups.map(g => [g.id, g]));

  const describeMovement = (m: Movement): { title: string; subtitle?: string } => {
    if ((m.type === "order_consumption" || m.type === "order_revert") && m.reference_id) {
      const info = (orderInfo as any)[m.reference_id];
      if (info) {
        const itemsTxt = info.items.map((i: any) => `${i.qty}x ${i.name}`).join(", ");
        const head = m.type === "order_consumption" ? "Pedido aceito" : "Pedido revertido";
        const customer = [info.name, info.phone].filter(Boolean).join(" ");
        return {
          title: `${head} #${info.number}${customer ? ` — ${customer}` : ""}`,
          subtitle: itemsTxt || undefined,
        };
      }
    }
    return { title: movementLabel[m.type] ?? m.type, subtitle: m.notes ?? undefined };
  };

  const incoming = movements.filter(m => m.quantity > 0);
  const outgoing = movements.filter(m => m.quantity < 0);

  return (
    <Tabs defaultValue="balance" className="space-y-4">
      <TabsList>
        <TabsTrigger value="balance"><Package className="w-4 h-4 mr-2" />Saldo atual</TabsTrigger>
        <TabsTrigger value="history"><History className="w-4 h-4 mr-2" />Histórico</TabsTrigger>
      </TabsList>

      <TabsContent value="balance" className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map(g => {
            const qty = stockMap[g.id]?.quantity ?? 0;
            const negative = qty <= 0;
            return (
              <Card key={g.id} className={negative ? "border-destructive/50" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center justify-between">
                    {g.name}
                    {negative && <Badge variant="destructive"><AlertTriangle className="w-3 h-3 mr-1" />Sem estoque</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-end justify-between">
                  <div className={`text-3xl font-bold ${negative ? "text-destructive" : ""}`}>{qty}</div>
                  <ManualAdjustDialog
                    restaurantId={restaurantId}
                    group={g}
                    currentQty={qty}
                    onSaved={() => {
                      qc.invalidateQueries({ queryKey: ["restaurant_stock", restaurantId] });
                      qc.invalidateQueries({ queryKey: ["stock_movements", restaurantId] });
                    }}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
        {groups.length === 0 && (
          <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhum grupo de estoque cadastrado pelo administrador.</CardContent></Card>
        )}
      </TabsContent>

      <TabsContent value="history">
        <Card>
          <CardContent className="p-0">
            {movements.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground">Sem movimentações ainda.</div>
            ) : (
              <div className="divide-y">
                {movements.map(m => (
                  <div key={m.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{groupMap[m.group_id]?.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {movementLabel[m.type] ?? m.type} · {new Date(m.created_at).toLocaleString("pt-BR")}
                      </div>
                      {m.notes && <div className="text-xs italic text-muted-foreground truncate">{m.notes}</div>}
                    </div>
                    <div className={`font-bold tabular-nums ${m.quantity >= 0 ? "text-success" : "text-destructive"}`}>
                      {m.quantity >= 0 ? "+" : ""}{m.quantity}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

function ManualAdjustDialog({
  restaurantId, group, currentQty, onSaved,
}: {
  restaurantId: string; group: StockGroup; currentQty: number; onSaved: () => void;
}) {
  const allowed = {
    add: group.allow_add ?? true,
    subtract: group.allow_subtract ?? true,
    set: group.allow_set ?? true,
  };
  const onlySubtract = allowed.subtract && !allowed.add && !allowed.set;
  const initialMode: "add" | "subtract" | "set" =
    allowed.add ? "add" : allowed.subtract ? "subtract" : "set";

  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"add" | "subtract" | "set">(initialMode);
  const [value, setValue] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (open) setMode(initialMode); }, [open]);

  const num = Math.trunc(Number(value) || 0);
  const delta =
    mode === "add" ? num :
    mode === "subtract" ? -num :
    num - currentQty;
  const resultQty = currentQty + delta;
  const notesRequired = true;
  const wouldGoNegative = mode === "subtract" && resultQty < 0;

  const submit = async () => {
    if (!Number.isFinite(Number(value)) || value === "") return toast.error("Informe um número");
    if (mode !== "set" && num <= 0) return toast.error("Informe uma quantidade positiva");
    if (delta === 0) return toast.error("Sem alteração");
    if (notesRequired && !notes.trim()) return toast.error("Preencha as observações");
    if (wouldGoNegative) return toast.error("Este grupo não pode ficar negativo");

    setSaving(true);
    try {
      const { data: existing } = await supabase.from("restaurant_stock")
        .select("id,quantity").eq("restaurant_id", restaurantId).eq("group_id", group.id).maybeSingle();
      if (existing) {
        const { error } = await supabase.from("restaurant_stock")
          .update({ quantity: existing.quantity + delta, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("restaurant_stock")
          .insert({ restaurant_id: restaurantId, group_id: group.id, quantity: delta });
        if (error) throw error;
      }
      const { error: mvErr } = await supabase.from("stock_movements").insert({
        restaurant_id: restaurantId, group_id: group.id, quantity: delta,
        type: "manual_adjust",
        notes: notes.trim() || (mode === "set" ? `Ajuste para ${num}` : null),
      });
      if (mvErr) throw mvErr;
      toast.success("Estoque ajustado");
      setOpen(false); setValue(""); setNotes("");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao ajustar");
    } finally {
      setSaving(false);
    }
  };

  const valueLabel =
    mode === "add" ? "Quantidade a somar" :
    mode === "subtract" ? "Digite a quantidade a ser subtraída" :
    "Novo total";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Settings2 className="w-4 h-4 mr-1" />Ajustar</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Ajuste manual — {group.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="text-sm text-muted-foreground">Saldo atual: <span className="font-bold text-foreground">{currentQty}</span></div>
          {!onlySubtract && (
            <div className="flex flex-wrap gap-2">
              {allowed.add && (
                <Button type="button" size="sm" variant={mode === "add" ? "default" : "outline"} onClick={() => setMode("add")}>Somar</Button>
              )}
              {allowed.subtract && (
                <Button type="button" size="sm" variant={mode === "subtract" ? "default" : "outline"} onClick={() => setMode("subtract")}>Subtrair</Button>
              )}
              {allowed.set && (
                <Button type="button" size="sm" variant={mode === "set" ? "default" : "outline"} onClick={() => setMode("set")}>Definir total</Button>
              )}
            </div>
          )}
          <div>
            <Label>{valueLabel}</Label>
            <Input
              type="number"
              step="1"
              min={mode === "set" ? undefined : 0}
              value={value}
              onChange={(e) => {
                const v = e.target.value;
                setValue(mode === "set" ? v : v.replace(/^-/, ""));
              }}
              placeholder="0"
            />
            {value !== "" && (
              <p className={`text-xs mt-1 ${wouldGoNegative ? "text-destructive" : "text-muted-foreground"}`}>
                Resultado: {resultQty}
                {wouldGoNegative && " — não permitido para este grupo"}
              </p>
            )}
          </div>
          <div>
            <Label>Motivo do ajuste <span className="text-destructive">*</span></Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder={notesRequired ? "Obrigatório: descreva o motivo" : "Ex.: contagem física"}
              required={notesRequired}
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving || value === "" || wouldGoNegative}>
            {saving ? "Salvando..." : "Salvar ajuste"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
