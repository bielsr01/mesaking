import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Tag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { brl, todayISOBR, monthStartISOBR, monthEndISOBR } from "@/lib/format";

type Cat = { id: string; name: string; requires_description: boolean; is_active: boolean; sort_order: number };
type Expense = { id: string; restaurant_id: string; description: string; category: string | null; category_id: string | null; amount: number; expense_date: string; notes: string | null };
type Restaurant = { id: string; name: string };

const todayISO = () => todayISOBR();
const monthStartISO = (d = new Date()) => monthStartISOBR(d);
const monthEndISO = (d = new Date()) => monthEndISOBR(d);

export function AdminExpenseStoresPanel() {
  const qc = useQueryClient();
  const [catOpen, setCatOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Cat | null>(null);
  const [savingCat, setSavingCat] = useState(false);
  const [restaurantFilter, setRestaurantFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());

  const { data: cats = [] } = useQuery({
    queryKey: ["expense_categories", "restaurant"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_categories").select("*").eq("scope", "restaurant").order("sort_order").order("name");
      if (error) throw error;
      return (data ?? []) as Cat[];
    },
  });

  const { data: restaurants = [] } = useQuery({
    queryKey: ["admin_restaurants_lite"],
    queryFn: async () => {
      const { data, error } = await supabase.from("restaurants").select("id,name").order("name");
      if (error) throw error;
      return (data ?? []) as Restaurant[];
    },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["admin_all_expenses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses").select("*").order("expense_date", { ascending: false }).limit(2000);
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel("admin_expense_stores")
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_categories" }, () => qc.invalidateQueries({ queryKey: ["expense_categories"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, () => qc.invalidateQueries({ queryKey: ["admin_all_expenses"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const restaurantsById = useMemo(() => Object.fromEntries(restaurants.map(r => [r.id, r.name])), [restaurants]);
  const catsById = useMemo(() => Object.fromEntries(cats.map(c => [c.id, c])), [cats]);

  const filtered = useMemo(() => expenses.filter(e => {
    if (restaurantFilter !== "all" && e.restaurant_id !== restaurantFilter) return false;
    if (categoryFilter !== "all" && (e.category_id ?? "") !== categoryFilter) return false;
    if (from && e.expense_date < from) return false;
    if (to && e.expense_date > to) return false;
    return true;
  }), [expenses, restaurantFilter, categoryFilter, from, to]);

  const total = filtered.reduce((s, e) => s + Number(e.amount), 0);

  const saveCat = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    if (savingCat) return;
    const fd = new FormData(ev.currentTarget);
    const payload = {
      name: String(fd.get("name") || "").trim(),
      requires_description: fd.get("requires_description") === "on",
      is_active: fd.get("is_active") === "on",
      sort_order: Number(fd.get("sort_order") || 0),
      scope: "restaurant" as const,
    };
    if (!payload.name) return toast.error("Nome obrigatório");
    setSavingCat(true);
    try {
      const op = editingCat
        ? supabase.from("expense_categories").update(payload).eq("id", editingCat.id)
        : supabase.from("expense_categories").insert(payload);
      const { error } = await op;
      if (error) { toast.error(error.message); return; }
      toast.success("Salvo");
      setCatOpen(false); setEditingCat(null);
      qc.invalidateQueries({ queryKey: ["expense_categories"] });
    } finally {
      setSavingCat(false);
    }
  };

  const removeCat = async (id: string) => {
    if (!confirm("Excluir esta categoria? Despesas existentes manterão o nome anterior.")) return;
    const { error } = await supabase.from("expense_categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["expense_categories"] });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2"><Tag className="w-4 h-4" /> Categorias de despesas das lojas</span>
            <Dialog open={catOpen} onOpenChange={(v) => { setCatOpen(v); if (!v) setEditingCat(null); }}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={() => { setEditingCat(null); setCatOpen(true); }}><Plus className="w-4 h-4 mr-1" /> Nova categoria</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingCat ? "Editar" : "Nova"} categoria</DialogTitle></DialogHeader>
                <form onSubmit={saveCat} className="space-y-3">
                  <div><Label>Nome</Label><Input name="name" defaultValue={editingCat?.name} required /></div>
                  <div><Label>Ordem</Label><Input name="sort_order" type="number" defaultValue={editingCat?.sort_order ?? 0} /></div>
                  <div className="flex items-center gap-2">
                    <Switch name="requires_description" defaultChecked={editingCat?.requires_description ?? false} id="req-desc" />
                    <Label htmlFor="req-desc" className="cursor-pointer">Solicitar nome/descrição da despesa ao restaurante</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch name="is_active" defaultChecked={editingCat?.is_active ?? true} id="is-active" />
                    <Label htmlFor="is-active" className="cursor-pointer">Ativa</Label>
                  </div>
                  <DialogFooter><Button type="submit" disabled={savingCat}>{savingCat && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{editingCat ? "Salvar" : "Adicionar"}</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {cats.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhuma categoria cadastrada.</div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Solicita descrição</TableHead><TableHead>Status</TableHead><TableHead className="w-24" /></TableRow></TableHeader>
              <TableBody>
                {cats.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.requires_description ? "Sim" : "Não"}</TableCell>
                    <TableCell>{c.is_active ? "Ativa" : "Inativa"}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditingCat(c); setCatOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => removeCat(c.id)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Despesas das lojas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-4">
            <div>
              <Label className="text-xs">Restaurante</Label>
              <Select value={restaurantFilter} onValueChange={setRestaurantFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {restaurants.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Categoria</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs">De</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div><Label className="text-xs">Até</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>

          <div className="rounded-lg border bg-muted/30 p-3 text-sm flex justify-between">
            <span className="text-muted-foreground">Total filtrado ({filtered.length} despesas)</span>
            <span className="font-bold">{brl(total)}</span>
          </div>

          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">Nenhuma despesa no filtro.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Restaurante</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(e => {
                  const cat = e.category_id ? catsById[e.category_id]?.name : e.category;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">{new Date(e.expense_date + "T00:00:00").toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell>{restaurantsById[e.restaurant_id] ?? "—"}</TableCell>
                      <TableCell>{cat ?? "—"}</TableCell>
                      <TableCell>
                        <div>{e.description || "—"}</div>
                        {e.notes && <div className="text-xs text-muted-foreground">{e.notes}</div>}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{brl(Number(e.amount))}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
