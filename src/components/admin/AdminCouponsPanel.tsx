import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Pencil, Trash2, Plus, Ticket } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { RestaurantMultiSelect, useRestaurants } from "./RestaurantMultiSelect";

const sb = supabase as any;

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

const emptyForm = () => ({
  code: "",
  name: "",
  apply_to: "order" as "order" | "items",
  discount_type: "percent" as "percent" | "value",
  discount_value: 10,
  starts_at: null as string | null,
  ends_at: null as string | null,
  usage_limit_total: null as number | null,
  usage_limit_per_customer: 0,
  min_order_value: 0,
  customer_type: "all" as "all" | "new",
  service_delivery: true,
  service_pickup: true,
  show_on_menu: true,
  is_active: true,
  scope: "all" as "all" | "specific", // applies to all restaurants or selected
  target_ids: [] as string[],
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

export function AdminCouponsPanel() {
  const qc = useQueryClient();
  const restaurantsQ = useRestaurants();
  const all = restaurantsQ.data ?? [];
  const [selected, setSelected] = useState<string[]>([]);
  const idsKey = selected.slice().sort().join(",");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<(ReturnType<typeof emptyForm> & { id?: string; restaurant_id?: string }) | null>(null);
  const [toDelete, setToDelete] = useState<Coupon | null>(null);

  const { data: coupons, isLoading } = useQuery({
    queryKey: ["admin-coupons", idsKey],
    enabled: selected.length > 0,
    queryFn: async () => {
      const { data, error } = await sb
        .from("coupons")
        .select("*")
        .in("restaurant_id", selected)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Coupon[];
    },
  });

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    all.forEach((r) => m.set(r.id, r.name));
    return m;
  }, [all]);

  const openNew = () => {
    setEditing({ ...emptyForm(), target_ids: selected.slice() });
    setOpen(true);
  };
  const openEdit = (c: Coupon) => {
    setEditing({
      id: c.id,
      restaurant_id: c.restaurant_id,
      code: c.code,
      name: c.name,
      apply_to: c.apply_to,
      discount_type: c.discount_type,
      discount_value: Number(c.discount_value),
      starts_at: c.starts_at,
      ends_at: c.ends_at,
      usage_limit_total: c.usage_limit_total,
      usage_limit_per_customer: c.usage_limit_per_customer,
      min_order_value: Number(c.min_order_value),
      customer_type: c.customer_type,
      service_delivery: c.service_delivery,
      service_pickup: c.service_pickup,
      show_on_menu: c.show_on_menu,
      is_active: c.is_active,
      scope: "specific",
      target_ids: [c.restaurant_id],
    });
    setOpen(true);
  };

  const save = async () => {
    if (!editing) return;
    const e = editing;
    if (!e.code.trim()) return toast.error("Informe o código");
    if (!e.name.trim()) return toast.error("Informe o nome");
    if (!e.discount_value || Number(e.discount_value) <= 0) return toast.error("Valor inválido");
    if (e.discount_type === "percent" && Number(e.discount_value) > 100) return toast.error("Máx 100%");
    if (!e.service_delivery && !e.service_pickup) return toast.error("Selecione ao menos um serviço");

    const basePayload = {
      code: e.code.trim().toUpperCase(),
      name: e.name.trim(),
      apply_to: e.apply_to,
      product_ids: [],
      discount_type: e.discount_type,
      discount_value: Number(e.discount_value),
      starts_at: e.starts_at,
      ends_at: e.ends_at,
      usage_limit_total: e.usage_limit_total,
      usage_limit_per_customer: Number(e.usage_limit_per_customer),
      min_order_value: Number(e.min_order_value),
      customer_type: e.customer_type,
      service_delivery: e.service_delivery,
      service_pickup: e.service_pickup,
      show_on_menu: e.show_on_menu,
      is_active: e.is_active,
    };

    if (e.id) {
      const { error } = await sb.from("coupons").update(basePayload).eq("id", e.id);
      if (error) return toast.error(error.message);
      toast.success("Cupom atualizado");
    } else {
      const targets = e.scope === "all" ? all.map((r) => r.id) : e.target_ids;
      if (targets.length === 0) return toast.error("Selecione ao menos uma loja");
      const rows = targets.map((rid) => ({ ...basePayload, restaurant_id: rid }));
      const { error } = await sb.from("coupons").insert(rows);
      if (error) {
        if (/duplicate/i.test(error.message)) return toast.error("Já existe cupom com este código em alguma loja");
        return toast.error(error.message);
      }
      toast.success(`Cupom criado em ${targets.length} loja(s)`);
    }
    setOpen(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["admin-coupons"] });
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    const { error } = await sb.from("coupons").delete().eq("id", toDelete.id);
    if (error) return toast.error(error.message);
    toast.success("Cupom excluído");
    setToDelete(null);
    qc.invalidateQueries({ queryKey: ["admin-coupons"] });
  };

  const formatDiscount = (c: Coupon) => c.discount_type === "percent" ? `${Number(c.discount_value)}%` : brl(Number(c.discount_value));

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4"><RestaurantMultiSelect all={all} selected={selected} onChange={setSelected} /></CardContent></Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2"><Ticket className="w-5 h-5" /> Cupons de desconto</CardTitle>
            <CardDescription>Gerencie cupons de todas as lojas selecionadas.</CardDescription>
          </div>
          <Button onClick={openNew} disabled={all.length === 0} className="gap-2"><Plus className="w-4 h-4" /> Novo cupom</Button>
        </CardHeader>
        <CardContent>
          {selected.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">Selecione ao menos um restaurante.</div>
          ) : isLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !coupons || coupons.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">Nenhum cupom cadastrado.</div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Restaurante</TableHead>
                    <TableHead>Desconto</TableHead>
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
                      <TableCell><Badge variant="outline">{nameById.get(c.restaurant_id) ?? "—"}</Badge></TableCell>
                      <TableCell>{formatDiscount(c)}</TableCell>
                      <TableCell className="text-xs">{c.ends_at ? new Date(c.ends_at).toLocaleDateString() : "Sem fim"}</TableCell>
                      <TableCell>{c.is_active ? <Badge className="bg-success text-success-foreground">Ativo</Badge> : <Badge variant="secondary">Inativo</Badge>}</TableCell>
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
              {!editing.id && (
                <div className="space-y-2">
                  <Label className="font-semibold">Aplicar este cupom em</Label>
                  <RadioGroup value={editing.scope} onValueChange={(v: any) => setEditing({ ...editing, scope: v })} className="grid grid-cols-2 gap-2">
                    <label className={`flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer text-sm ${editing.scope === "all" ? "border-primary bg-primary/5" : "border-border"}`}>
                      <RadioGroupItem value="all" /> Todas as lojas ({all.length})
                    </label>
                    <label className={`flex items-center gap-2 p-3 rounded-lg border-2 cursor-pointer text-sm ${editing.scope === "specific" ? "border-primary bg-primary/5" : "border-border"}`}>
                      <RadioGroupItem value="specific" /> Lojas específicas
                    </label>
                  </RadioGroup>
                  {editing.scope === "specific" && (
                    <div className="border rounded-md p-3 max-h-48 overflow-y-auto space-y-1.5">
                      {all.map((r) => {
                        const checked = editing.target_ids.includes(r.id);
                        return (
                          <label key={r.id} className="flex items-center gap-2 cursor-pointer text-sm">
                            <Checkbox checked={checked} onCheckedChange={(v) => {
                              setEditing({ ...editing, target_ids: v ? [...editing.target_ids, r.id] : editing.target_ids.filter((x) => x !== r.id) });
                            }} />
                            {r.name}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {editing.id && (
                <div className="text-sm text-muted-foreground">Loja: <strong>{nameById.get(editing.restaurant_id!) ?? "—"}</strong></div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Código</Label><Input value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} placeholder="PROMO10" /></div>
                <div className="space-y-2"><Label>Nome</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Promoção" /></div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Tipo de desconto</Label>
                  <RadioGroup value={editing.discount_type} onValueChange={(v: any) => setEditing({ ...editing, discount_type: v })} className="grid grid-cols-2 gap-2">
                    <label className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer text-sm ${editing.discount_type === "percent" ? "border-primary bg-primary/5" : ""}`}><RadioGroupItem value="percent" /> %</label>
                    <label className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer text-sm ${editing.discount_type === "value" ? "border-primary bg-primary/5" : ""}`}><RadioGroupItem value="value" /> R$</label>
                  </RadioGroup>
                </div>
                <div className="space-y-2"><Label>Valor</Label><Input type="number" min="0" step="0.01" value={editing.discount_value} onChange={(e) => setEditing({ ...editing, discount_value: Number(e.target.value) })} /></div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Início</Label><Input type="datetime-local" value={toLocalInput(editing.starts_at)} onChange={(e) => setEditing({ ...editing, starts_at: fromLocalInput(e.target.value) })} /></div>
                <div className="space-y-2"><Label>Fim</Label><Input type="datetime-local" value={toLocalInput(editing.ends_at)} onChange={(e) => setEditing({ ...editing, ends_at: fromLocalInput(e.target.value) })} /></div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Limite total de usos</Label><Input type="number" min="0" value={editing.usage_limit_total ?? ""} onChange={(e) => setEditing({ ...editing, usage_limit_total: e.target.value === "" ? null : Number(e.target.value) })} placeholder="Ilimitado" /></div>
                <div className="space-y-2"><Label>Valor mínimo do pedido</Label><Input type="number" min="0" step="0.01" value={editing.min_order_value} onChange={(e) => setEditing({ ...editing, min_order_value: Number(e.target.value) })} /></div>
              </div>

              <div className="space-y-2">
                <Label className="font-semibold">Tipo de cliente</Label>
                <RadioGroup value={editing.customer_type} onValueChange={(v: any) => setEditing({ ...editing, customer_type: v })} className="grid grid-cols-2 gap-2">
                  <label className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer text-sm ${editing.customer_type === "all" ? "border-primary bg-primary/5" : ""}`}><RadioGroupItem value="all" /> Todos</label>
                  <label className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer text-sm ${editing.customer_type === "new" ? "border-primary bg-primary/5" : ""}`}><RadioGroupItem value="new" /> Apenas novos</label>
                </RadioGroup>
              </div>

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

              <div className="space-y-3 border-t pt-3">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">Mostrar no menu digital</Label>
                  <Switch checked={editing.show_on_menu} onCheckedChange={(v) => setEditing({ ...editing, show_on_menu: v })} />
                </div>
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">Cupom ativo</Label>
                  <Switch checked={editing.is_active} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
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
    </div>
  );
}
