import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Tag, Receipt, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";

type Cat = { id: string; name: string; requires_description: boolean; is_active: boolean };
type AdminExpense = { id: string; description: string; category: string | null; category_id: string | null; amount: number; expense_date: string; notes: string | null };

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthStartISO = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
const monthEndISO = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);

export function AdminOwnExpensesPanel() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminExpense | null>(null);
  const [catOpen, setCatOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Cat | null>(null);
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  // Form state
  const [selectedCatId, setSelectedCatId] = useState<string>("__free__");
  const [freeCatName, setFreeCatName] = useState("");
  const [descValue, setDescValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingCat, setSavingCat] = useState(false);

  const { data: cats = [] } = useQuery({
    queryKey: ["expense_categories", "admin"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_categories").select("*").eq("scope", "admin").order("name");
      if (error) throw error;
      return (data ?? []) as Cat[];
    },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["admin_expenses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("admin_expenses").select("*").order("expense_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminExpense[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel("admin_own_expenses")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_expenses" }, () => qc.invalidateQueries({ queryKey: ["admin_expenses"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_categories" }, () => qc.invalidateQueries({ queryKey: ["expense_categories"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const catsById = useMemo(() => Object.fromEntries(cats.map(c => [c.id, c])), [cats]);

  const openNew = () => {
    setEditing(null);
    setSelectedCatId("__free__"); setFreeCatName(""); setDescValue("");
    setOpen(true);
  };
  const openEdit = (e: AdminExpense) => {
    setEditing(e);
    setSelectedCatId(e.category_id ?? "__free__");
    setFreeCatName(e.category_id ? "" : (e.category ?? ""));
    setDescValue(e.description ?? "");
    setOpen(true);
  };

  const filtered = useMemo(() => expenses.filter(e => {
    if (from && e.expense_date < from) return false;
    if (to && e.expense_date > to) return false;
    if (categoryFilter !== "all" && (e.category_id ?? "") !== categoryFilter) return false;
    return true;
  }), [expenses, from, to, categoryFilter]);

  const total = filtered.reduce((s, e) => s + Number(e.amount), 0);

  const save = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    if (saving) return;
    const fd = new FormData(ev.currentTarget);
    const cat = selectedCatId !== "__free__" ? catsById[selectedCatId] : null;
    const categoryName = cat ? cat.name : freeCatName.trim();
    if (!categoryName) return toast.error("Selecione ou digite uma categoria");
    const description = descValue.trim();
    if (!description) return toast.error("Descrição obrigatória");
    const payload = {
      description,
      category: categoryName,
      category_id: cat?.id ?? null,
      amount: Number(fd.get("amount") || 0),
      expense_date: String(fd.get("expense_date") || todayISO()),
      notes: String(fd.get("notes") || "").trim() || null,
      created_by: user?.id ?? null,
    };
    if (payload.amount <= 0) return toast.error("Valor deve ser maior que zero");
    setSaving(true);
    try {
      const op = editing ? supabase.from("admin_expenses").update(payload).eq("id", editing.id) : supabase.from("admin_expenses").insert(payload);
      const { error } = await op;
      if (error) { toast.error(error.message); return; }
      toast.success("Salvo");
      setOpen(false); setEditing(null);
      qc.invalidateQueries({ queryKey: ["admin_expenses"] });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta despesa?")) return;
    const { error } = await supabase.from("admin_expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin_expenses"] });
  };

  const saveCat = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    if (savingCat) return;
    const fd = new FormData(ev.currentTarget);
    const payload = {
      name: String(fd.get("name") || "").trim(),
      is_active: fd.get("is_active") === "on",
      scope: "admin" as const,
      requires_description: false,
    };
    if (!payload.name) return toast.error("Nome obrigatório");
    setSavingCat(true);
    try {
      const op = editingCat ? supabase.from("expense_categories").update(payload).eq("id", editingCat.id) : supabase.from("expense_categories").insert(payload);
      const { error } = await op;
      if (error) { toast.error(error.message); return; }
      toast.success("Salvo"); setCatOpen(false); setEditingCat(null);
      qc.invalidateQueries({ queryKey: ["expense_categories"] });
    } finally {
      setSavingCat(false);
    }
  };

  const removeCat = async (id: string) => {
    if (!confirm("Excluir categoria?")) return;
    const { error } = await supabase.from("expense_categories").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["expense_categories"] });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2"><Tag className="w-4 h-4" /> Categorias (admin)</span>
            <Dialog open={catOpen} onOpenChange={(v) => { setCatOpen(v); if (!v) setEditingCat(null); }}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" onClick={() => { setEditingCat(null); setCatOpen(true); }}><Plus className="w-4 h-4 mr-1" /> Nova categoria</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editingCat ? "Editar" : "Nova"} categoria</DialogTitle></DialogHeader>
                <form onSubmit={saveCat} className="space-y-3">
                  <div><Label>Nome</Label><Input name="name" defaultValue={editingCat?.name} required /></div>
                  <div className="flex items-center gap-2">
                    <Switch name="is_active" defaultChecked={editingCat?.is_active ?? true} id="cat-active" />
                    <Label htmlFor="cat-active" className="cursor-pointer">Ativa</Label>
                  </div>
                  <DialogFooter><Button type="submit" disabled={savingCat}>{savingCat && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{editingCat ? "Salvar" : "Adicionar"}</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {cats.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma categoria. Você pode digitar livremente ao cadastrar uma despesa.</div>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Status</TableHead><TableHead className="w-24" /></TableRow></TableHeader>
              <TableBody>
                {cats.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
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
          <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2"><Receipt className="w-4 h-4" /> Despesas Admin</span>
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" /> Nova despesa</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editing ? "Editar" : "Nova"} despesa</DialogTitle></DialogHeader>
                <form onSubmit={save} className="space-y-3">
                  <div>
                    <Label>Categoria</Label>
                    <Select value={selectedCatId === "__free__" ? "" : selectedCatId} onValueChange={setSelectedCatId}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {cats.filter(c => c.is_active).map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Descrição</Label><Input value={descValue} onChange={(e) => setDescValue(e.target.value)} required maxLength={200} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Valor (R$)</Label><Input name="amount" type="number" step="0.01" min="0" defaultValue={editing?.amount ?? ""} required /></div>
                    <div><Label>Data</Label><Input name="expense_date" type="date" defaultValue={editing?.expense_date ?? todayISO()} required /></div>
                  </div>
                  <div><Label>Observações</Label><Textarea name="notes" defaultValue={editing?.notes ?? ""} rows={2} maxLength={500} /></div>
                  <DialogFooter><Button type="submit" disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{editing ? "Salvar" : "Adicionar"}</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
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
            <span className="text-muted-foreground">Total filtrado ({filtered.length})</span>
            <span className="font-bold">{brl(total)}</span>
          </div>
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">Nenhuma despesa.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap">{new Date(e.expense_date + "T00:00:00").toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell>{e.category_id ? catsById[e.category_id]?.name ?? e.category : e.category ?? "—"}</TableCell>
                    <TableCell>
                      <div>{e.description}</div>
                      {e.notes && <div className="text-xs text-muted-foreground">{e.notes}</div>}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{brl(Number(e.amount))}</TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(e)}><Pencil className="w-4 h-4" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => remove(e.id)}><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
