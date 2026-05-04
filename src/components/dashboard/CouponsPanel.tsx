import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Pencil, Trash2, Plus, Ticket, BarChart3 } from "lucide-react";
import { CouponMetrics } from "./CouponMetrics";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { brl } from "@/lib/format";

type Coupon = {
  id: string;
  restaurant_id: string;
  code: string;
  name: string;
  apply_to: "order" | "items";
  product_ids: string[];
  discount_type: "percent" | "value";
  discount_value: number;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit_total: number | null;
  usage_limit_per_customer: number;
  min_order_value: number;
  customer_type: "all" | "new";
  service_delivery: boolean;
  service_pickup: boolean;
  show_on_menu: boolean;
  is_active: boolean;
  uses_count: number;
};

const empty = (rid: string): Partial<Coupon> => ({
  restaurant_id: rid,
  code: "",
  name: "",
  apply_to: "order",
  product_ids: [],
  discount_type: "percent",
  discount_value: 10,
  starts_at: null,
  ends_at: null,
  usage_limit_total: null,
  usage_limit_per_customer: 0,
  min_order_value: 0,
  customer_type: "all",
  service_delivery: true,
  service_pickup: true,
  show_on_menu: true,
  is_active: true,
});

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => {
  if (!v) return null;
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).toISOString();
};

export function CouponsPanel({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Coupon> | null>(null);
  const [toDelete, setToDelete] = useState<Coupon | null>(null);
  const [showMetrics, setShowMetrics] = useState(false);

  const { data: coupons, isLoading } = useQuery({
    queryKey: ["coupons", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("coupons" as any).select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Coupon[];
    },
  });

  const { data: products } = useQuery({
    queryKey: ["coupons-products", restaurantId],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id,name").eq("restaurant_id", restaurantId).eq("is_active", true).order("name");
      return data ?? [];
    },
  });

  const openNew = () => { setEditing(empty(restaurantId)); setOpen(true); };
  const openEdit = (c: Coupon) => { setEditing({ ...c }); setOpen(true); };

  const save = async () => {
    if (!editing) return;
    const e = editing;
    if (!e.code?.trim()) return toast.error("Informe o código do cupom");
    if (!e.name?.trim()) return toast.error("Informe o nome da oferta");
    if (!e.discount_value || Number(e.discount_value) <= 0) return toast.error("Valor do desconto inválido");
    if (e.discount_type === "percent" && Number(e.discount_value) > 100) return toast.error("Percentual máximo 100");
    if (e.apply_to === "items" && (!e.product_ids || e.product_ids.length === 0)) return toast.error("Selecione ao menos 1 produto");
    if (!e.service_delivery && !e.service_pickup) return toast.error("Selecione ao menos um serviço");

    const payload: any = {
      restaurant_id: restaurantId,
      code: e.code!.trim().toUpperCase(),
      name: e.name!.trim(),
      apply_to: e.apply_to,
      product_ids: e.apply_to === "items" ? (e.product_ids ?? []) : [],
      discount_type: e.discount_type,
      discount_value: Number(e.discount_value),
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      usage_limit_total: e.usage_limit_total ?? null,
      usage_limit_per_customer: Number(e.usage_limit_per_customer ?? 0),
      min_order_value: Number(e.min_order_value ?? 0),
      customer_type: e.customer_type,
      service_delivery: !!e.service_delivery,
      service_pickup: !!e.service_pickup,
      show_on_menu: !!e.show_on_menu,
      is_active: !!e.is_active,
    };

    const { error } = e.id
      ? await supabase.from("coupons" as any).update(payload).eq("id", e.id)
      : await supabase.from("coupons" as any).insert(payload);
    if (error) {
      if (/duplicate/i.test(error.message)) return toast.error("Já existe um cupom com este código");
      return toast.error(error.message);
    }
    toast.success(e.id ? "Cupom atualizado" : "Cupom criado");
    setOpen(false); setEditing(null);
    qc.invalidateQueries({ queryKey: ["coupons", restaurantId] });
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const { error } = await supabase.from("coupons" as any).delete().eq("id", toDelete.id);
    if (error) return toast.error(error.message);
    toast.success("Cupom excluído");
    setToDelete(null);
    qc.invalidateQueries({ queryKey: ["coupons", restaurantId] });
  };

  const formatDiscount = (c: Coupon) => c.discount_type === "percent" ? `${Number(c.discount_value)}%` : brl(Number(c.discount_value));

  if (showMetrics) {
    return <CouponMetrics restaurantId={restaurantId} onBack={() => setShowMetrics(false)} />;
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><Ticket className="w-5 h-5" /> Cupons de desconto</CardTitle>
            <CardDescription>Crie cupons para o pedido todo ou para itens específicos.</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowMetrics(true)} className="gap-2"><BarChart3 className="w-4 h-4" /> Métricas</Button>
            <Button onClick={openNew} className="gap-2"><Plus className="w-4 h-4" /> Novo cupom</Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !coupons || coupons.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">Nenhum cupom cadastrado.</div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Desconto</TableHead>
                    <TableHead>Aplicação</TableHead>
                    <TableHead>Validade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coupons.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono font-semibold">{c.code}</TableCell>
                      <TableCell>{c.name}</TableCell>
                      <TableCell>{formatDiscount(c)}</TableCell>
                      <TableCell>{c.apply_to === "order" ? "Pedido todo" : `Itens (${c.product_ids?.length ?? 0})`}</TableCell>
                      <TableCell className="text-xs">
                        {c.ends_at ? new Date(c.ends_at).toLocaleDateString() : "Sem fim"}
                      </TableCell>
                      <TableCell>
                        {c.is_active ? <Badge className="bg-success text-success-foreground">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setToDelete(c)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing?.id ? "Editar cupom" : "Novo cupom"}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-5">
              {/* Aplicação */}
              <div className="space-y-2">
                <Label className="font-semibold">Aplicar desconto a</Label>
                <RadioGroup value={editing.apply_to} onValueChange={(v: any) => setEditing({ ...editing, apply_to: v })} className="grid grid-cols-2 gap-2">
                  <label className={`flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer ${editing.apply_to === "order" ? "border-primary bg-primary/5" : "border-border"}`}>
                    <RadioGroupItem value="order" /> <span className="text-sm">Valor total do pedido</span>
                  </label>
                  <label className={`flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer ${editing.apply_to === "items" ? "border-primary bg-primary/5" : "border-border"}`}>
                    <RadioGroupItem value="items" /> <span className="text-sm">Itens específicos</span>
                  </label>
                </RadioGroup>
                {editing.apply_to === "items" && (
                  <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-1.5">
                    {(products ?? []).length === 0 && <div className="text-xs text-muted-foreground">Nenhum produto ativo.</div>}
                    {(products ?? []).map((p: any) => {
                      const checked = (editing.product_ids ?? []).includes(p.id);
                      return (
                        <label key={p.id} className="flex items-center gap-2 cursor-pointer text-sm">
                          <Checkbox checked={checked} onCheckedChange={(v) => {
                            const cur = editing.product_ids ?? [];
                            setEditing({ ...editing, product_ids: v ? [...cur, p.id] : cur.filter((x) => x !== p.id) });
                          }} />
                          {p.name}
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Código + Nome */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Código</Label><Input value={editing.code ?? ""} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} placeholder="PROMO10" /></div>
                <div className="space-y-2"><Label>Nome da oferta</Label><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Promoção de inverno" /></div>
              </div>

              {/* Tipo + Valor */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Tipo de desconto</Label>
                  <RadioGroup value={editing.discount_type} onValueChange={(v: any) => setEditing({ ...editing, discount_type: v })} className="grid grid-cols-2 gap-2">
                    <label className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer text-sm ${editing.discount_type === "percent" ? "border-primary bg-primary/5" : ""}`}>
                      <RadioGroupItem value="percent" /> %
                    </label>
                    <label className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer text-sm ${editing.discount_type === "value" ? "border-primary bg-primary/5" : ""}`}>
                      <RadioGroupItem value="value" /> R$
                    </label>
                  </RadioGroup>
                </div>
                <div className="space-y-2"><Label>Valor do desconto</Label><Input type="number" min="0" step="0.01" value={editing.discount_value ?? 0} onChange={(e) => setEditing({ ...editing, discount_value: Number(e.target.value) })} /></div>
              </div>

              {/* Validade */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Início</Label><Input type="datetime-local" value={toLocalInput(editing.starts_at ?? null)} onChange={(e) => setEditing({ ...editing, starts_at: fromLocalInput(e.target.value) })} /></div>
                <div className="space-y-2"><Label>Fim</Label><Input type="datetime-local" value={toLocalInput(editing.ends_at ?? null)} onChange={(e) => setEditing({ ...editing, ends_at: fromLocalInput(e.target.value) })} /></div>
              </div>

              {/* Usos */}
              <div className="space-y-2">
                <Label className="font-semibold">Número de usos do cupom</Label>
                <RadioGroup
                  value={editing.usage_limit_total == null ? "unlimited" : "limited"}
                  onValueChange={(v) => setEditing({ ...editing, usage_limit_total: v === "unlimited" ? null : 100 })}
                  className="grid grid-cols-2 gap-2"
                >
                  <label className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer text-sm ${editing.usage_limit_total == null ? "border-primary bg-primary/5" : ""}`}>
                    <RadioGroupItem value="unlimited" /> Ilimitado
                  </label>
                  <label className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer text-sm ${editing.usage_limit_total != null ? "border-primary bg-primary/5" : ""}`}>
                    <RadioGroupItem value="limited" /> Limite específico
                  </label>
                </RadioGroup>
                {editing.usage_limit_total != null && (
                  <Input type="number" min="1" value={editing.usage_limit_total} onChange={(e) => setEditing({ ...editing, usage_limit_total: Number(e.target.value) })} placeholder="Ex: 100" />
                )}
              </div>

              {/* Requisito */}
              <div className="space-y-2">
                <Label className="font-semibold">Requisito de compra</Label>
                <RadioGroup
                  value={Number(editing.min_order_value ?? 0) > 0 ? "min" : "none"}
                  onValueChange={(v) => setEditing({ ...editing, min_order_value: v === "none" ? 0 : 50 })}
                  className="grid grid-cols-2 gap-2"
                >
                  <label className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer text-sm ${Number(editing.min_order_value ?? 0) === 0 ? "border-primary bg-primary/5" : ""}`}>
                    <RadioGroupItem value="none" /> Sem requisito
                  </label>
                  <label className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer text-sm ${Number(editing.min_order_value ?? 0) > 0 ? "border-primary bg-primary/5" : ""}`}>
                    <RadioGroupItem value="min" /> Valor mínimo
                  </label>
                </RadioGroup>
                {Number(editing.min_order_value ?? 0) > 0 && (
                  <Input type="number" min="0" step="0.01" value={editing.min_order_value} onChange={(e) => setEditing({ ...editing, min_order_value: Number(e.target.value) })} placeholder="Ex: 50.00" />
                )}
              </div>

              {/* Tipo de cliente */}
              <div className="space-y-2">
                <Label className="font-semibold">Tipo de cliente</Label>
                <RadioGroup value={editing.customer_type} onValueChange={(v: any) => setEditing({ ...editing, customer_type: v })} className="grid grid-cols-2 gap-2">
                  <label className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer text-sm ${editing.customer_type === "all" ? "border-primary bg-primary/5" : ""}`}>
                    <RadioGroupItem value="all" /> Todos
                  </label>
                  <label className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer text-sm ${editing.customer_type === "new" ? "border-primary bg-primary/5" : ""}`}>
                    <RadioGroupItem value="new" /> Apenas novos clientes
                  </label>
                </RadioGroup>
                {editing.customer_type === "new" && (
                  <p className="text-xs text-muted-foreground">Validamos automaticamente pelo telefone se é o primeiro pedido.</p>
                )}
              </div>

              {/* Usos por cliente */}
              <div className="space-y-2">
                <Label className="font-semibold">Usos por cliente</Label>
                <RadioGroup
                  value={Number(editing.usage_limit_per_customer ?? 0) === 1 ? "one" : "unlimited"}
                  onValueChange={(v) => setEditing({ ...editing, usage_limit_per_customer: v === "one" ? 1 : 0 })}
                  className="grid grid-cols-2 gap-2"
                >
                  <label className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer text-sm ${Number(editing.usage_limit_per_customer ?? 0) === 0 ? "border-primary bg-primary/5" : ""}`}>
                    <RadioGroupItem value="unlimited" /> Ilimitado
                  </label>
                  <label className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer text-sm ${Number(editing.usage_limit_per_customer ?? 0) === 1 ? "border-primary bg-primary/5" : ""}`}>
                    <RadioGroupItem value="one" /> Apenas 1 por cliente
                  </label>
                </RadioGroup>
              </div>

              {/* Serviço */}
              <div className="space-y-2">
                <Label className="font-semibold">Tipo de serviço</Label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 p-2 rounded-md border cursor-pointer text-sm">
                    <Checkbox checked={editing.service_delivery} onCheckedChange={(v) => setEditing({ ...editing, service_delivery: !!v })} /> Delivery
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded-md border cursor-pointer text-sm">
                    <Checkbox checked={editing.service_pickup} onCheckedChange={(v) => setEditing({ ...editing, service_pickup: !!v })} /> Retirada
                  </label>
                </div>
              </div>

              {/* Toggles finais */}
              <div className="space-y-3 border-t pt-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="font-semibold">Mostrar este desconto no menu digital</Label>
                    <p className="text-xs text-muted-foreground">Aparece um card "Descontos disponíveis" no cardápio.</p>
                  </div>
                  <Switch checked={!!editing.show_on_menu} onCheckedChange={(v) => setEditing({ ...editing, show_on_menu: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">Cupom ativo</Label>
                  <Switch checked={!!editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cupom?</AlertDialogTitle>
            <AlertDialogDescription>O cupom <strong>{toDelete?.code}</strong> será removido permanentemente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
