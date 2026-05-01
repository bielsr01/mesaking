import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, X, Link2 } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { fetchProducts, menuKeys } from "./MenuManager";

export interface OptionGroup {
  id: string;
  restaurant_id: string;
  name: string;
  min_select: number;
  max_select: number;
  sort_order: number;
  is_active: boolean;
}
export interface OptionItem {
  id: string;
  group_id: string;
  name: string;
  extra_price: number;
  sort_order: number;
  is_active: boolean;
}

export const optionKeys = {
  groups: (rid: string) => ["options", rid, "groups"] as const,
  items: (rid: string) => ["options", rid, "items"] as const,
};

export async function fetchGroups(restaurantId: string): Promise<OptionGroup[]> {
  const { data } = await supabase.from("option_groups").select("*").eq("restaurant_id", restaurantId).order("sort_order");
  return (data ?? []) as OptionGroup[];
}
export async function fetchItems(restaurantId: string): Promise<OptionItem[]> {
  const { data } = await supabase
    .from("option_items")
    .select("*, option_groups!inner(restaurant_id)")
    .eq("option_groups.restaurant_id", restaurantId)
    .order("sort_order");
  return ((data ?? []) as any[]).map(({ option_groups, ...r }) => r) as OptionItem[];
}

export function OptionGroupsManager({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const { data: groups = [], isLoading: lg } = useQuery({
    queryKey: optionKeys.groups(restaurantId),
    queryFn: () => fetchGroups(restaurantId),
    staleTime: 30_000,
  });
  const { data: items = [], isLoading: li } = useQuery({
    queryKey: optionKeys.items(restaurantId),
    queryFn: () => fetchItems(restaurantId),
    staleTime: 30_000,
  });

  const reload = () => {
    qc.invalidateQueries({ queryKey: optionKeys.groups(restaurantId) });
    qc.invalidateQueries({ queryKey: optionKeys.items(restaurantId) });
  };

  useEffect(() => {
    const ch = supabase.channel(`opts-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "option_groups", filter: `restaurant_id=eq.${restaurantId}` }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "option_items" }, reload)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId]);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OptionGroup | null>(null);

  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (g: OptionGroup) => { setEditing(g); setOpen(true); };

  const removeGroup = async (g: OptionGroup) => {
    if (!confirm(`Remover grupo "${g.name}"? Será desvinculado dos produtos.`)) return;
    const { error } = await supabase.from("option_groups").delete().eq("id", g.id);
    if (error) toast.error(error.message);
    else { toast.success("Grupo removido"); reload(); }
  };

  const toggleGroup = async (g: OptionGroup) => {
    const { error } = await supabase.from("option_groups").update({ is_active: !g.is_active }).eq("id", g.id);
    if (error) toast.error(error.message);
    reload();
  };

  const isLoading = (lg || li) && groups.length === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Grupos de opções</h3>
          <p className="text-xs text-muted-foreground">Ex: Sabores, Acompanhamentos, Adicionais. Vincule a um ou mais produtos.</p>
        </div>
        <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 mr-1" />Novo grupo</Button>
      </div>

      {isLoading ? (
        <><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></>
      ) : groups.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhum grupo criado ainda.</CardContent></Card>
      ) : groups.map((g) => {
        const groupItems = items.filter((i) => i.group_id === g.id);
        return (
          <Card key={g.id} className={!g.is_active ? "opacity-60" : ""}>
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{g.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Mín {g.min_select} · Máx {g.max_select} · {groupItems.length} {groupItems.length === 1 ? "item" : "itens"}
                  </div>
                </div>
                <Switch checked={g.is_active} onCheckedChange={() => toggleGroup(g)} />
                <Button size="icon" variant="ghost" onClick={() => openEdit(g)}><Pencil className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => removeGroup(g)}><Trash2 className="w-4 h-4" /></Button>
              </div>
              {groupItems.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {groupItems.map((i) => (
                    <span key={i.id} className="text-xs px-2 py-1 bg-muted rounded">
                      {i.name}{Number(i.extra_price) > 0 ? ` +${brl(Number(i.extra_price))}` : ""}
                    </span>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      <GroupDialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}
        restaurantId={restaurantId}
        editing={editing}
        existingItems={editing ? items.filter((i) => i.group_id === editing.id) : []}
        onSaved={reload}
      />
    </div>
  );
}

function GroupDialog({
  open, onOpenChange, restaurantId, editing, existingItems, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  restaurantId: string;
  editing: OptionGroup | null;
  existingItems: OptionItem[];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [minS, setMinS] = useState(0);
  const [maxS, setMaxS] = useState(1);
  const [rows, setRows] = useState<{ id?: string; name: string; extra_price: string; toDelete?: boolean }[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setMinS(editing?.min_select ?? 0);
      setMaxS(editing?.max_select ?? 1);
      setRows(
        existingItems.length > 0
          ? existingItems.map((i) => ({ id: i.id, name: i.name, extra_price: String(Number(i.extra_price) || 0) }))
          : [{ name: "", extra_price: "0" }]
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id]);

  const addRow = () => setRows((r) => [...r, { name: "", extra_price: "0" }]);
  const updateRow = (idx: number, patch: Partial<{ name: string; extra_price: string }>) =>
    setRows((r) => r.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  const removeRow = (idx: number) =>
    setRows((r) => r.map((x, i) => (i === idx ? { ...x, toDelete: true } : x)));

  const save = async () => {
    if (!name.trim()) return toast.error("Informe o nome do grupo");
    if (minS < 0 || maxS < 1 || minS > maxS) return toast.error("Mín/Máx inválidos");
    const validRows = rows.filter((r) => !r.toDelete && r.name.trim());
    if (validRows.length === 0) return toast.error("Adicione ao menos 1 item");

    setBusy(true);
    try {
      let groupId = editing?.id;
      if (editing) {
        const { error } = await supabase.from("option_groups").update({
          name: name.trim(), min_select: minS, max_select: maxS,
        }).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("option_groups").insert({
          restaurant_id: restaurantId, name: name.trim(), min_select: minS, max_select: maxS,
        }).select("id").single();
        if (error) throw error;
        groupId = data.id;
      }

      // Delete marked
      const toDelete = rows.filter((r) => r.toDelete && r.id).map((r) => r.id!);
      if (toDelete.length) {
        const { error } = await supabase.from("option_items").delete().in("id", toDelete);
        if (error) throw error;
      }
      // Update existing
      for (const r of rows.filter((r) => !r.toDelete && r.id)) {
        const { error } = await supabase.from("option_items").update({
          name: r.name.trim(), extra_price: Number(r.extra_price) || 0,
        }).eq("id", r.id!);
        if (error) throw error;
      }
      // Insert new
      const newOnes = rows.filter((r) => !r.toDelete && !r.id && r.name.trim()).map((r, idx) => ({
        group_id: groupId!, name: r.name.trim(), extra_price: Number(r.extra_price) || 0, sort_order: idx,
      }));
      if (newOnes.length) {
        const { error } = await supabase.from("option_items").insert(newOnes);
        if (error) throw error;
      }
      toast.success("Grupo salvo");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"} grupo de opções</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Nome do grupo</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Sabores" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Mínimo a escolher</Label>
              <Input type="number" min={0} value={minS} onChange={(e) => setMinS(Number(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Máximo a escolher</Label>
              <Input type="number" min={1} value={maxS} onChange={(e) => setMaxS(Number(e.target.value))} />
            </div>
          </div>
          <div className="text-xs text-muted-foreground">
            Dica: mín 1 / máx 1 = obrigatório escolher 1. Mín 0 / máx 3 = opcional, até 3.
          </div>

          <div className="space-y-2">
            <Label>Itens</Label>
            {rows.map((r, idx) => r.toDelete ? null : (
              <div key={idx} className="flex gap-2 items-center">
                <Input className="flex-1" placeholder="Nome (ex: Catupiry)" value={r.name} onChange={(e) => updateRow(idx, { name: e.target.value })} />
                <Input className="w-28" type="number" step="0.01" min="0" placeholder="0,00" value={r.extra_price} onChange={(e) => updateRow(idx, { extra_price: e.target.value })} />
                <Button size="icon" variant="ghost" onClick={() => removeRow(idx)}><X className="w-4 h-4" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={addRow}><Plus className="w-3.5 h-3.5 mr-1" />Adicionar item</Button>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
