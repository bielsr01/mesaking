import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Download, Receipt, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";

type Expense = {
  id: string; restaurant_id: string; description: string; category: string | null; category_id: string | null;
  amount: number; expense_date: string; notes: string | null; created_at: string;
};
type Cat = { id: string; name: string; requires_description: boolean; is_active: boolean };

type Preset = "all" | "today" | "this_month" | "last_month" | "year" | "custom" | `m:${number}`;

const todayISO = () => new Date().toISOString().slice(0, 10);
const monthStartISO = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
const monthEndISO = (d = new Date()) => new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);

const MONTHS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

export function ExpensesPanel({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [preset, setPreset] = useState<Preset>("this_month");
  const [from, setFrom] = useState(monthStartISO());
  const [to, setTo] = useState(todayISO());
  const [year, setYear] = useState(new Date().getFullYear());
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const [selectedCatId, setSelectedCatId] = useState<string>("");
  const [descValue, setDescValue] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: cats = [] } = useQuery({
    queryKey: ["expense_categories", "restaurant"],
    queryFn: async () => {
      const { data, error } = await supabase.from("expense_categories").select("*").eq("scope", "restaurant").eq("is_active", true).order("sort_order").order("name");
      if (error) throw error;
      return (data ?? []) as Cat[];
    },
  });

  const { data: expenses = [] } = useQuery({
    queryKey: ["expenses", restaurantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("expenses")
        .select("*").eq("restaurant_id", restaurantId).order("expense_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Expense[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel(`expenses_${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses", filter: `restaurant_id=eq.${restaurantId}` },
        () => qc.invalidateQueries({ queryKey: ["expenses", restaurantId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "expense_categories" },
        () => qc.invalidateQueries({ queryKey: ["expense_categories"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [restaurantId, qc]);

  const catsById = useMemo(() => Object.fromEntries(cats.map(c => [c.id, c])), [cats]);
  const selectedCat = selectedCatId ? catsById[selectedCatId] : null;
  const requiresDesc = selectedCat?.requires_description ?? false;

  const applyPreset = (p: Preset) => {
    setPreset(p);
    const now = new Date();
    if (p === "all") { setFrom(""); setTo(""); return; }
    if (p === "today") { setFrom(todayISO()); setTo(todayISO()); return; }
    if (p === "this_month") { setFrom(monthStartISO(now)); setTo(monthEndISO(now)); return; }
    if (p === "last_month") {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      setFrom(monthStartISO(d)); setTo(monthEndISO(d)); return;
    }
    if (p === "year") { setFrom(`${year}-01-01`); setTo(`${year}-12-31`); return; }
    if (p.startsWith("m:")) {
      const m = Number(p.slice(2));
      const d = new Date(year, m, 1);
      setFrom(monthStartISO(d)); setTo(monthEndISO(d)); return;
    }
  };

  const filtered = useMemo(() => {
    return expenses.filter(e => {
      if (from && e.expense_date < from) return false;
      if (to && e.expense_date > to) return false;
      if (categoryFilter !== "all" && (e.category_id ?? "") !== categoryFilter) return false;
      return true;
    });
  }, [expenses, from, to, categoryFilter]);

  const total = filtered.reduce((s, e) => s + Number(e.amount), 0);
  const todayTotal = expenses.filter(e => e.expense_date === todayISO()).reduce((s, e) => s + Number(e.amount), 0);
  const monthTotal = expenses.filter(e => e.expense_date >= monthStartISO() && e.expense_date <= monthEndISO()).reduce((s, e) => s + Number(e.amount), 0);
  const grandTotal = expenses.reduce((s, e) => s + Number(e.amount), 0);


  const openNew = () => {
    setEditing(null);
    setSelectedCatId(cats[0]?.id ?? "");
    setDescValue("");
    setOpen(true);
  };
  const openEdit = (e: Expense) => {
    setEditing(e);
    setSelectedCatId(e.category_id ?? "");
    setDescValue(e.description ?? "");
    setOpen(true);
  };

  const save = async (ev: React.FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    if (saving) return;
    const fd = new FormData(ev.currentTarget);
    const cat = selectedCatId ? catsById[selectedCatId] : null;
    if (!cat) return toast.error("Selecione uma categoria");
    const description = cat.requires_description ? descValue.trim() : cat.name;
    if (cat.requires_description && !description) return toast.error("Descrição obrigatória");
    const payload = {
      restaurant_id: restaurantId,
      description,
      category: cat.name,
      category_id: cat.id,
      amount: Number(fd.get("amount") || 0),
      expense_date: String(fd.get("expense_date") || todayISO()),
      notes: String(fd.get("notes") || "").trim() || null,
      created_by: user?.id ?? null,
    };
    if (payload.amount <= 0) return toast.error("Valor deve ser maior que zero");
    setSaving(true);
    try {
      const op = editing
        ? supabase.from("expenses").update(payload).eq("id", editing.id)
        : supabase.from("expenses").insert(payload);
      const { error } = await op;
      if (error) { toast.error(error.message); return; }
      toast.success("Salvo");
      setOpen(false); setEditing(null);
      qc.invalidateQueries({ queryKey: ["expenses", restaurantId] });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta despesa?")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["expenses", restaurantId] });
  };

  const exportCsv = () => {
    const rows = [["Data", "Categoria", "Descrição", "Valor", "Observações"]];
    filtered.forEach(e => {
      const catName = e.category_id ? (catsById[e.category_id]?.name ?? e.category ?? "") : (e.category ?? "");
      rows.push([
        e.expense_date,
        `"${catName.replace(/"/g, '""')}"`,
        `"${(e.description ?? "").replace(/"/g, '""')}"`,
        String(Number(e.amount).toFixed(2)).replace(".", ","),
        `"${(e.notes ?? "").replace(/"/g, '""')}"`,
      ]);
    });
    const csv = rows.map(r => r.join(";")).join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `despesas_${from || "tudo"}_${to || "tudo"}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatMini label="Hoje" value={brl(todayTotal)} />
        <StatMini label="Este mês" value={brl(monthTotal)} />
        <StatMini label="Total geral" value={brl(grandTotal)} />
        <StatMini label="Filtro atual" value={brl(total)} highlight />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2"><Receipt className="w-4 h-4" /> Filtros e relatório</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
                <Download className="w-4 h-4 mr-1" /> Exportar CSV
              </Button>
              <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
                <DialogTrigger asChild>
                  <Button size="sm" onClick={openNew} disabled={cats.length === 0}>
                    <Plus className="w-4 h-4 mr-1" /> Nova despesa
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>{editing ? "Editar" : "Nova"} despesa</DialogTitle></DialogHeader>
                  {cats.length === 0 ? (
                    <div className="text-sm text-muted-foreground py-4">
                      Nenhuma categoria de despesa disponível. Solicite ao administrador o cadastro de categorias.
                    </div>
                  ) : (
                    <form onSubmit={save} className="space-y-3">
                      <div>
                        <Label>Categoria</Label>
                        <Select value={selectedCatId} onValueChange={setSelectedCatId}>
                          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      {requiresDesc && (
                        <div>
                          <Label>Descrição da despesa</Label>
                          <Input value={descValue} onChange={(e) => setDescValue(e.target.value)} required maxLength={200} placeholder="Digite o nome da despesa" />
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-3">
                        <div><Label>Valor (R$)</Label><Input name="amount" type="number" step="0.01" min="0" defaultValue={editing?.amount ?? ""} required /></div>
                        <div><Label>Data</Label><Input name="expense_date" type="date" defaultValue={editing?.expense_date ?? todayISO()} required /></div>
                      </div>
                      <div><Label>Observações</Label><Textarea name="notes" defaultValue={editing?.notes ?? ""} rows={2} maxLength={500} /></div>
                      <DialogFooter><Button type="submit" disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}{editing ? "Salvar" : "Adicionar"}</Button></DialogFooter>
                    </form>
                  )}
                </DialogContent>
              </Dialog>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label className="text-xs">Período</Label>
              <Select value={preset} onValueChange={(v) => applyPreset(v as Preset)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="today">Hoje</SelectItem>
                  <SelectItem value="this_month">Mês atual</SelectItem>
                  <SelectItem value="last_month">Mês passado</SelectItem>
                  <SelectItem value="year">Ano todo ({year})</SelectItem>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={`m:${i}`}>{m} de {year}</SelectItem>)}
                  <SelectItem value="custom">Personalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Ano de referência</Label>
              <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || new Date().getFullYear())} />
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
            <div><Label className="text-xs">De</Label><Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} /></div>
            <div><Label className="text-xs">Até</Label><Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} /></div>
          </div>

        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">Nenhuma despesa no período selecionado.</div>
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
                {filtered.map(e => {
                  const catName = e.category_id ? (catsById[e.category_id]?.name ?? e.category) : e.category;
                  const cat = e.category_id ? catsById[e.category_id] : null;
                  const showDesc = cat ? cat.requires_description : !!e.description;
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="whitespace-nowrap">{new Date(e.expense_date + "T00:00:00").toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="font-medium">{catName ?? "—"}</TableCell>
                      <TableCell>
                        {showDesc && e.description && e.description !== catName ? <div>{e.description}</div> : <span className="text-muted-foreground">—</span>}
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
                  );
                })}
                <TableRow className="bg-muted/40 font-bold">
                  <TableCell colSpan={3} className="text-right">Total filtrado</TableCell>
                  <TableCell className="text-right">{brl(total)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatMini({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary" : ""}>
      <CardContent className="pt-4 pb-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
