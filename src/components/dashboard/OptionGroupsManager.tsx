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
import { Plus, Pencil, Trash2, X, Link2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { fetchProducts, menuKeys } from "./MenuManager";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

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
  const [linkingGroup, setLinkingGroup] = useState<OptionGroup | null>(null);

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
      ) : (
        <SortableGroupsList
          groups={groups}
          items={items}
          restaurantId={restaurantId}
          onEdit={openEdit}
          onRemove={removeGroup}
          onToggle={toggleGroup}
          onLink={setLinkingGroup}
        />
      )}

      <GroupDialog
        open={open}
        onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}
        restaurantId={restaurantId}
        editing={editing}
        existingItems={editing ? items.filter((i) => i.group_id === editing.id) : []}
        onSaved={reload}
      />

      <LinkProductsDialog
        group={linkingGroup}
        restaurantId={restaurantId}
        onClose={() => setLinkingGroup(null)}
      />
    </div>
  );
}

function LinkProductsDialog({
  group, restaurantId, onClose,
}: {
  group: OptionGroup | null;
  restaurantId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const open = !!group;
  const { data: products = [] } = useQuery({
    queryKey: menuKeys.products(restaurantId),
    queryFn: () => fetchProducts(restaurantId),
    enabled: open,
    staleTime: 30_000,
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!group) { setSelected(new Set()); setFilter(""); return; }
    (async () => {
      const { data } = await supabase.from("product_option_groups").select("product_id").eq("group_id", group.id);
      setSelected(new Set((data ?? []).map((r: any) => r.product_id)));
    })();
  }, [group]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filtered = products.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()));
  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selected.has(p.id));
  const toggleAllFiltered = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) filtered.forEach((p) => next.delete(p.id));
      else filtered.forEach((p) => next.add(p.id));
      return next;
    });
  };

  const save = async () => {
    if (!group) return;
    setBusy(true);
    try {
      const { data: existing } = await supabase.from("product_option_groups").select("product_id").eq("group_id", group.id);
      const existingIds = new Set((existing ?? []).map((r: any) => r.product_id));
      const toAdd = [...selected].filter((id) => !existingIds.has(id));
      const toRemove = [...existingIds].filter((id) => !selected.has(id));
      if (toRemove.length) {
        const { error } = await supabase.from("product_option_groups").delete().eq("group_id", group.id).in("product_id", toRemove);
        if (error) throw error;
      }
      if (toAdd.length) {
        const { error } = await supabase.from("product_option_groups").insert(toAdd.map((pid) => ({ group_id: group.id, product_id: pid })));
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: menuKeys.products(restaurantId) });
      toast.success(`Vínculos atualizados (${selected.size} ${selected.size === 1 ? "produto" : "produtos"})`);
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Vincular "{group?.name}" a produtos</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
          <Input placeholder="Buscar produto..." value={filter} onChange={(e) => setFilter(e.target.value)} />
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhum produto cadastrado.</p>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted px-2 py-1.5 rounded border">
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered} />
                <span className="font-medium">Selecionar todos {filter && "(filtrados)"}</span>
                <span className="ml-auto text-xs text-muted-foreground">{selected.size} selecionado(s)</span>
              </label>
              <div className="flex-1 overflow-y-auto space-y-1 border rounded-md p-2">
                {filtered.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted px-2 py-1.5 rounded">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                    <span className="flex-1">{p.name}</span>
                    <span className="text-xs text-muted-foreground">{brl(Number(p.price))}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>{busy ? "Salvando..." : "Salvar vínculos"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

function SortableGroupsList({
  groups, items, restaurantId, onEdit, onRemove, onToggle, onLink,
}: {
  groups: OptionGroup[];
  items: OptionItem[];
  restaurantId: string;
  onEdit: (g: OptionGroup) => void;
  onRemove: (g: OptionGroup) => void;
  onToggle: (g: OptionGroup) => void;
  onLink: (g: OptionGroup) => void;
}) {
  const qc = useQueryClient();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const ids = groups.map((g) => g.id);

  const handleDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = ids.indexOf(String(active.id));
    const newIdx = ids.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(groups, oldIdx, newIdx);
    qc.setQueryData<OptionGroup[]>(optionKeys.groups(restaurantId), reordered.map((g, i) => ({ ...g, sort_order: i })));
    await Promise.all(reordered.map((g, i) => supabase.from("option_groups").update({ sort_order: i }).eq("id", g.id)));
    qc.invalidateQueries({ queryKey: optionKeys.groups(restaurantId) });
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {groups.map((g) => (
            <SortableGroupCard
              key={g.id}
              group={g}
              items={items.filter((i) => i.group_id === g.id)}
              restaurantId={restaurantId}
              onEdit={onEdit}
              onRemove={onRemove}
              onToggle={onToggle}
              onLink={onLink}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableGroupCard({
  group: g, items: groupItems, restaurantId, onEdit, onRemove, onToggle, onLink,
}: {
  group: OptionGroup;
  items: OptionItem[];
  restaurantId: string;
  onEdit: (g: OptionGroup) => void;
  onRemove: (g: OptionGroup) => void;
  onToggle: (g: OptionGroup) => void;
  onLink: (g: OptionGroup) => void;
}) {
  const qc = useQueryClient();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: g.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const itemIds = groupItems.map((i) => i.id);

  const handleItemsDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = itemIds.indexOf(String(active.id));
    const newIdx = itemIds.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(groupItems, oldIdx, newIdx);
    qc.setQueryData<OptionItem[]>(optionKeys.items(restaurantId), (prev) => {
      if (!prev) return prev;
      const others = prev.filter((i) => i.group_id !== g.id);
      const updated = reordered.map((i, idx) => ({ ...i, sort_order: idx }));
      return [...others, ...updated];
    });
    await Promise.all(reordered.map((i, idx) => supabase.from("option_items").update({ sort_order: idx }).eq("id", i.id)));
    qc.invalidateQueries({ queryKey: optionKeys.items(restaurantId) });
  };

  return (
    <Card ref={setNodeRef} style={style} className={!g.is_active ? "opacity-60" : ""}>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground p-1"
            {...attributes}
            {...listeners}
            aria-label="Arrastar grupo"
          >
            <GripVertical className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="font-medium">{g.name}</div>
            <div className="text-xs text-muted-foreground">
              Mín {g.min_select} · Máx {g.max_select} · {groupItems.length} {groupItems.length === 1 ? "item" : "itens"}
            </div>
          </div>
          <Switch checked={g.is_active} onCheckedChange={() => onToggle(g)} />
          <Button size="icon" variant="ghost" title="Vincular produtos" onClick={() => onLink(g)}><Link2 className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" onClick={() => onEdit(g)}><Pencil className="w-4 h-4" /></Button>
          <Button size="icon" variant="ghost" onClick={() => onRemove(g)}><Trash2 className="w-4 h-4" /></Button>
        </div>
        {groupItems.length > 0 && (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleItemsDragEnd}>
            <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-1 pt-1 pl-7">
                {groupItems.map((i) => (
                  <SortableItemRow key={i.id} item={i} />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </CardContent>
    </Card>
  );
}

function SortableItemRow({ item }: { item: OptionItem }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-2 text-xs px-2 py-1 bg-muted rounded">
      <button
        type="button"
        className="touch-none cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
        aria-label="Arrastar item"
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <span className="flex-1">{item.name}</span>
      {Number(item.extra_price) > 0 && <span className="text-muted-foreground">+{brl(Number(item.extra_price))}</span>}
    </div>
  );
}
