import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Pencil, Trash2, ChevronDown, ChevronRight, Minus, Equal } from "lucide-react";
import { toast } from "sonner";

type Group = { id: string; name: string; sort_order: number; is_active: boolean };
type Subgroup = { id: string; group_id: string; name: string; sort_order: number; is_active: boolean; quantity: number };

export function AdminStockAdmin() {
  const qc = useQueryClient();
  const [groupOpen, setGroupOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [subOpen, setSubOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subgroup | null>(null);
  const [subGroupId, setSubGroupId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const [adjust, setAdjust] = useState<{ sub: Subgroup; mode: "add" | "subtract" | "set" } | null>(null);
  const [adjustQty, setAdjustQty] = useState<string>("");

  const { data: groups = [] } = useQuery({
    queryKey: ["admin_stock_groups"],
    queryFn: async () => {
      const { data } = await supabase.from("admin_stock_groups").select("*").order("sort_order").order("name");
      return (data ?? []) as Group[];
    },
  });
  const { data: subgroups = [] } = useQuery({
    queryKey: ["admin_stock_subgroups"],
    queryFn: async () => {
      const { data } = await supabase.from("admin_stock_subgroups").select("*").order("sort_order").order("name");
      return (data ?? []) as Subgroup[];
    },
  });

  useEffect(() => {
    const ch = supabase.channel("admin_stock_admin")
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_stock_subgroups" },
        () => qc.invalidateQueries({ queryKey: ["admin_stock_subgroups"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "admin_stock_groups" },
        () => qc.invalidateQueries({ queryKey: ["admin_stock_groups"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const subsByGroup: Record<string, Subgroup[]> = {};
  subgroups.forEach(s => { (subsByGroup[s.group_id] ??= []).push(s); });

  const saveGroup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = { name: String(fd.get("name") || "").trim(), sort_order: Number(fd.get("sort_order") || 0) };
    if (!payload.name) return toast.error("Informe o nome");
    const { error } = editingGroup
      ? await supabase.from("admin_stock_groups").update(payload).eq("id", editingGroup.id)
      : await supabase.from("admin_stock_groups").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Salvo");
    setGroupOpen(false); setEditingGroup(null);
    qc.invalidateQueries({ queryKey: ["admin_stock_groups"] });
  };

  const saveSub = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const gid = editingSub?.group_id ?? subGroupId;
    if (!gid) return toast.error("Grupo inválido");
    const payload = {
      name: String(fd.get("name") || "").trim(),
      sort_order: Number(fd.get("sort_order") || 0),
      group_id: gid,
    };
    if (!payload.name) return toast.error("Informe o nome");
    const { error } = editingSub
      ? await supabase.from("admin_stock_subgroups").update({ name: payload.name, sort_order: payload.sort_order }).eq("id", editingSub.id)
      : await supabase.from("admin_stock_subgroups").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Salvo");
    setSubOpen(false); setEditingSub(null); setSubGroupId(null);
    qc.invalidateQueries({ queryKey: ["admin_stock_subgroups"] });
  };

  const removeGroup = async (g: Group) => {
    if (!confirm(`Excluir o grupo "${g.name}" e todos os subgrupos?`)) return;
    const { error } = await supabase.from("admin_stock_groups").delete().eq("id", g.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin_stock_groups"] });
    qc.invalidateQueries({ queryKey: ["admin_stock_subgroups"] });
  };
  const removeSub = async (s: Subgroup) => {
    if (!confirm(`Excluir o subgrupo "${s.name}"?`)) return;
    const { error } = await supabase.from("admin_stock_subgroups").delete().eq("id", s.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["admin_stock_subgroups"] });
  };
  const toggleGroupActive = async (g: Group) => {
    await supabase.from("admin_stock_groups").update({ is_active: !g.is_active }).eq("id", g.id);
    qc.invalidateQueries({ queryKey: ["admin_stock_groups"] });
  };
  const toggleSubActive = async (s: Subgroup) => {
    await supabase.from("admin_stock_subgroups").update({ is_active: !s.is_active }).eq("id", s.id);
    qc.invalidateQueries({ queryKey: ["admin_stock_subgroups"] });
  };

  const confirmAdjust = async () => {
    if (!adjust) return;
    const qty = Number(adjustQty);
    if (!Number.isFinite(qty) || qty < 0) return toast.error("Quantidade inválida");
    const { sub, mode } = adjust;
    let delta = 0;
    let type: "manual_add" | "manual_subtract" | "manual_set" = "manual_add";
    if (mode === "add") { delta = qty; type = "manual_add"; }
    else if (mode === "subtract") { delta = -qty; type = "manual_subtract"; }
    else { delta = qty - sub.quantity; type = "manual_set"; }
    if (delta === 0) { setAdjust(null); return; }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("admin_stock_movements").insert({
      subgroup_id: sub.id, quantity: delta, type, notes: `Ajuste manual (${mode})`, created_by: u.user?.id ?? null,
    });
    if (error) return toast.error(error.message);
    const { error: e2 } = await supabase.from("admin_stock_subgroups").update({ quantity: sub.quantity + delta }).eq("id", sub.id);
    if (e2) return toast.error(e2.message);
    toast.success("Estoque atualizado");
    setAdjust(null); setAdjustQty("");
    qc.invalidateQueries({ queryKey: ["admin_stock_subgroups"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground">Estoque da fábrica organizado em grupos (ex.: Coxinhas) e subgrupos (ex.: sabores). Pedidos entregues debitam automaticamente.</p>
        <Dialog open={groupOpen} onOpenChange={(v) => { setGroupOpen(v); if (!v) setEditingGroup(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingGroup(null)}><Plus className="w-4 h-4 mr-2" />Novo grupo</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editingGroup ? "Editar" : "Novo"} grupo</DialogTitle></DialogHeader>
            <form onSubmit={saveGroup} className="space-y-3">
              <div><Label>Nome</Label><Input name="name" defaultValue={editingGroup?.name} required /></div>
              <div><Label>Ordem</Label><Input name="sort_order" type="number" defaultValue={editingGroup?.sort_order ?? 0} /></div>
              <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {groups.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhum grupo cadastrado.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {groups.map(g => {
            const subs = subsByGroup[g.id] ?? [];
            const total = subs.reduce((s, x) => s + x.quantity, 0);
            const isOpen = expanded[g.id] ?? true;
            return (
              <Card key={g.id} className={!g.is_active ? "opacity-70" : ""}>
                <Collapsible open={isOpen} onOpenChange={(v) => setExpanded(e => ({ ...e, [g.id]: v }))}>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <CollapsibleTrigger asChild>
                        <button className="flex items-center gap-2 font-semibold">
                          {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          {g.name}
                          {!g.is_active && <Badge variant="secondary">Inativo</Badge>}
                          <span className="text-sm text-muted-foreground font-normal ml-2">total: <strong className="text-foreground">{total}</strong></span>
                        </button>
                      </CollapsibleTrigger>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <Switch checked={g.is_active} onCheckedChange={() => toggleGroupActive(g)} />
                          <span className="text-xs text-muted-foreground">{g.is_active ? "Ativo" : "Inativo"}</span>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => { setEditingSub(null); setSubGroupId(g.id); setSubOpen(true); }}>
                          <Plus className="w-4 h-4 mr-1" />Subgrupo
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => { setEditingGroup(g); setGroupOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => removeGroup(g)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </div>
                    <CollapsibleContent>
                      <div className="mt-3 divide-y border rounded-md">
                        {subs.length === 0 ? (
                          <div className="p-4 text-sm text-muted-foreground text-center">Nenhum subgrupo cadastrado.</div>
                        ) : subs.map(s => (
                          <div key={s.id} className={`p-3 flex items-center justify-between gap-3 flex-wrap ${!s.is_active ? "opacity-60" : ""}`}>
                            <div className="flex items-center gap-3">
                              <span className="font-medium">{s.name}</span>
                              {!s.is_active && <Badge variant="secondary" className="text-xs">Inativo</Badge>}
                              <span className={`font-bold tabular-nums text-lg ${s.quantity <= 0 ? "text-destructive" : ""}`}>{s.quantity}</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button size="sm" variant="outline" onClick={() => { setAdjust({ sub: s, mode: "add" }); setAdjustQty(""); }}>
                                <Plus className="w-3 h-3 mr-1" />Somar
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => { setAdjust({ sub: s, mode: "subtract" }); setAdjustQty(""); }}>
                                <Minus className="w-3 h-3 mr-1" />Subtrair
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => { setAdjust({ sub: s, mode: "set" }); setAdjustQty(String(s.quantity)); }}>
                                <Equal className="w-3 h-3 mr-1" />Definir
                              </Button>
                              <div className="flex items-center gap-1 ml-1">
                                <Switch checked={s.is_active} onCheckedChange={() => toggleSubActive(s)} />
                              </div>
                              <Button size="icon" variant="ghost" onClick={() => { setEditingSub(s); setSubOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => removeSub(s)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </CardContent>
                </Collapsible>
              </Card>
            );
          })}
        </div>
      )}

      {/* Subgroup dialog */}
      <Dialog open={subOpen} onOpenChange={(v) => { setSubOpen(v); if (!v) { setEditingSub(null); setSubGroupId(null); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingSub ? "Editar" : "Novo"} subgrupo</DialogTitle></DialogHeader>
          <form onSubmit={saveSub} className="space-y-3">
            <div><Label>Nome</Label><Input name="name" defaultValue={editingSub?.name} required /></div>
            <div><Label>Ordem</Label><Input name="sort_order" type="number" defaultValue={editingSub?.sort_order ?? 0} /></div>
            <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Adjust dialog */}
      <Dialog open={!!adjust} onOpenChange={(v) => { if (!v) setAdjust(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {adjust?.mode === "add" && "Somar ao estoque"}
              {adjust?.mode === "subtract" && "Subtrair do estoque"}
              {adjust?.mode === "set" && "Definir quantidade"}
            </DialogTitle>
          </DialogHeader>
          {adjust && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">{adjust.sub.name} — atual: <strong className="text-foreground">{adjust.sub.quantity}</strong></div>
              <div>
                <Label>{adjust.mode === "set" ? "Nova quantidade total" : "Quantidade"}</Label>
                <Input type="number" min={0} value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} autoFocus />
              </div>
              <DialogFooter><Button onClick={confirmAdjust}>Confirmar</Button></DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
