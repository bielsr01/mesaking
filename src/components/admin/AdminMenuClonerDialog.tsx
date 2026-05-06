import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRestaurants } from "./RestaurantMultiSelect";
import { useQueryClient } from "@tanstack/react-query";
import { menuKeys } from "@/components/dashboard/MenuManager";
import { optionKeys } from "@/components/dashboard/OptionGroupsManager";

const sb = supabase as any;

type Mode = "all" | "items";

interface Cat { id: string; name: string; sort_order: number; is_active: boolean }
interface Prod { id: string; category_id: string | null; name: string; description: string | null; price: number; image_url: string | null; is_active: boolean; sort_order: number }
interface Grp { id: string; name: string; min_select: number; max_select: number; sort_order: number; is_active: boolean }
interface Item { id: string; group_id: string; name: string; extra_price: number; sort_order: number; is_active: boolean }
interface POG { product_id: string; group_id: string; sort_order: number }

export function AdminMenuClonerDialog({ destRestaurantId, open, onOpenChange }: { destRestaurantId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data: restaurants = [] } = useRestaurants();
  const sources = useMemo(() => restaurants.filter((r) => r.id !== destRestaurantId), [restaurants, destRestaurantId]);

  const [sourceId, setSourceId] = useState<string>("");
  const [mode, setMode] = useState<Mode>("all");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const [cats, setCats] = useState<Cat[]>([]);
  const [prods, setProds] = useState<Prod[]>([]);
  const [grps, setGrps] = useState<Grp[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [pogs, setPogs] = useState<POG[]>([]);

  const [selCats, setSelCats] = useState<Set<string>>(new Set());
  const [selProds, setSelProds] = useState<Set<string>>(new Set());
  const [selGrps, setSelGrps] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    setSourceId("");
    setCats([]); setProds([]); setGrps([]); setItems([]); setPogs([]);
    setSelCats(new Set()); setSelProds(new Set()); setSelGrps(new Set());
    setMode("all");
  }, [open]);

  useEffect(() => {
    if (!sourceId) return;
    (async () => {
      setLoading(true);
      const [cR, pR, gR] = await Promise.all([
        sb.from("categories").select("*").eq("restaurant_id", sourceId).order("sort_order"),
        sb.from("products").select("*").eq("restaurant_id", sourceId).order("sort_order"),
        sb.from("option_groups").select("*").eq("restaurant_id", sourceId).order("sort_order"),
      ]);
      const groups = (gR.data ?? []) as Grp[];
      const groupIds = groups.map((g) => g.id);
      const productIds = ((pR.data ?? []) as Prod[]).map((p) => p.id);
      const [iR, poR] = await Promise.all([
        groupIds.length
          ? sb.from("option_items").select("*").in("group_id", groupIds).order("sort_order")
          : Promise.resolve({ data: [] }),
        productIds.length
          ? sb.from("product_option_groups").select("*").in("product_id", productIds)
          : Promise.resolve({ data: [] }),
      ]);
      setCats((cR.data ?? []) as Cat[]);
      setProds((pR.data ?? []) as Prod[]);
      setGrps(groups);
      setItems((iR.data ?? []) as Item[]);
      setPogs((poR.data ?? []) as POG[]);
      setLoading(false);
    })();
  }, [sourceId]);

  const toggle = (s: Set<string>, set: (v: Set<string>) => void, id: string) => {
    const n = new Set(s);
    n.has(id) ? n.delete(id) : n.add(id);
    set(n);
  };
  const toggleAll = (ids: string[], cur: Set<string>, set: (v: Set<string>) => void) => {
    set(cur.size === ids.length ? new Set() : new Set(ids));
  };

  const handleClone = async () => {
    if (!sourceId || !destRestaurantId) return;
    const cloneAll = mode === "all";
    const catIds = cloneAll ? new Set(cats.map((c) => c.id)) : selCats;
    const prodIds = cloneAll ? new Set(prods.map((p) => p.id)) : selProds;
    const grpIds = cloneAll ? new Set(grps.map((g) => g.id)) : selGrps;

    if (catIds.size + prodIds.size + grpIds.size === 0) {
      toast.error("Selecione pelo menos um item para clonar");
      return;
    }

    setBusy(true);
    try {
      const { data: destCatsData } = await sb.from("categories").select("id,name").eq("restaurant_id", destRestaurantId);
      const destCatByName = new Map<string, string>();
      (destCatsData ?? []).forEach((c: any) => destCatByName.set(c.name.toLowerCase(), c.id));

      const catMap = new Map<string, string>();

      const neededCatIds = new Set(catIds);
      if (!cloneAll) {
        prods.filter((p) => prodIds.has(p.id) && p.category_id).forEach((p) => neededCatIds.add(p.category_id!));
      }

      const catsToInsert = cats.filter((c) => neededCatIds.has(c.id));
      for (const c of catsToInsert) {
        const existing = destCatByName.get(c.name.toLowerCase());
        if (existing) {
          catMap.set(c.id, existing);
        } else {
          const { data, error } = await sb.from("categories").insert({
            restaurant_id: destRestaurantId,
            name: c.name,
            sort_order: c.sort_order,
            is_active: c.is_active,
          }).select("id").single();
          if (error) throw error;
          catMap.set(c.id, data.id);
          destCatByName.set(c.name.toLowerCase(), data.id);
        }
      }

      const neededGrpIds = new Set(grpIds);
      if (!cloneAll) {
        pogs.filter((po) => prodIds.has(po.product_id)).forEach((po) => neededGrpIds.add(po.group_id));
      }

      const { data: destGrpsData } = await sb.from("option_groups").select("id,name").eq("restaurant_id", destRestaurantId);
      const destGrpByName = new Map<string, string>();
      (destGrpsData ?? []).forEach((g: any) => destGrpByName.set(g.name.toLowerCase(), g.id));

      const grpMap = new Map<string, string>();
      const grpsToInsert = grps.filter((g) => neededGrpIds.has(g.id));
      for (const g of grpsToInsert) {
        const existing = destGrpByName.get(g.name.toLowerCase());
        if (existing) {
          grpMap.set(g.id, existing);
          continue;
        }
        const { data, error } = await sb.from("option_groups").insert({
          restaurant_id: destRestaurantId,
          name: g.name,
          min_select: g.min_select,
          max_select: g.max_select,
          sort_order: g.sort_order,
          is_active: g.is_active,
        }).select("id").single();
        if (error) throw error;
        grpMap.set(g.id, data.id);

        const groupItems = items.filter((i) => i.group_id === g.id);
        if (groupItems.length) {
          const { error: ie } = await sb.from("option_items").insert(
            groupItems.map((i) => ({
              group_id: data.id,
              name: i.name,
              extra_price: i.extra_price,
              sort_order: i.sort_order,
              is_active: i.is_active,
            }))
          );
          if (ie) throw ie;
        }
      }

      const prodsToInsert = prods.filter((p) => prodIds.has(p.id));
      for (const p of prodsToInsert) {
        const newCatId = p.category_id ? catMap.get(p.category_id) ?? null : null;
        const { data, error } = await sb.from("products").insert({
          restaurant_id: destRestaurantId,
          category_id: newCatId,
          name: p.name,
          description: p.description,
          price: p.price,
          image_url: p.image_url,
          is_active: p.is_active,
          sort_order: p.sort_order,
        }).select("id").single();
        if (error) throw error;

        const links = pogs.filter((po) => po.product_id === p.id);
        const linkRows = links
          .map((l) => ({ product_id: data.id, group_id: grpMap.get(l.group_id), sort_order: l.sort_order }))
          .filter((l) => !!l.group_id);
        if (linkRows.length) {
          const { error: pe } = await sb.from("product_option_groups").insert(linkRows);
          if (pe) throw pe;
        }
      }

      toast.success("Cardápio clonado com sucesso!");
      qc.invalidateQueries({ queryKey: menuKeys.categories(destRestaurantId) });
      qc.invalidateQueries({ queryKey: menuKeys.products(destRestaurantId) });
      qc.invalidateQueries({ queryKey: optionKeys.groups(destRestaurantId) });
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Erro ao clonar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Copy className="w-5 h-5" /> Clonar cardápio</DialogTitle>
          <DialogDescription>
            Selecione um restaurante de origem e clone o cardápio inteiro ou apenas itens específicos para o restaurante atual.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium mb-2 block">Restaurante de origem</label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger><SelectValue placeholder="Selecione o restaurante de origem" /></SelectTrigger>
              <SelectContent>
                {sources.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {sourceId && (
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="all">Cardápio todo</TabsTrigger>
                <TabsTrigger value="items">Itens individuais</TabsTrigger>
              </TabsList>

              <TabsContent value="all">
                <Card><CardContent className="pt-6 space-y-2 text-sm">
                  {loading ? <div className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div> : (
                    <>
                      <p>Serão clonados:</p>
                      <ul className="list-disc list-inside text-muted-foreground">
                        <li>{cats.length} categoria(s)</li>
                        <li>{prods.length} produto(s)</li>
                        <li>{grps.length} grupo(s) de opções com {items.length} item(ns)</li>
                        <li>Vínculos produto ↔ grupos de opção preservados</li>
                      </ul>
                      <p className="text-xs text-muted-foreground pt-2">Categorias/grupos com mesmo nome no destino serão reaproveitados.</p>
                    </>
                  )}
                </CardContent></Card>
              </TabsContent>

              <TabsContent value="items" className="space-y-4">
                {loading ? <div className="flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</div> : (
                  <>
                    <SectionList
                      title="Categorias" count={cats.length} selected={selCats}
                      onToggleAll={() => toggleAll(cats.map((c) => c.id), selCats, setSelCats)}
                      items={cats.map((c) => ({ id: c.id, label: c.name, hint: c.is_active ? null : "inativa" }))}
                      onToggle={(id) => toggle(selCats, setSelCats, id)}
                    />
                    <SectionList
                      title="Produtos" count={prods.length} selected={selProds}
                      onToggleAll={() => toggleAll(prods.map((p) => p.id), selProds, setSelProds)}
                      items={prods.map((p) => ({ id: p.id, label: p.name, hint: `R$ ${Number(p.price).toFixed(2)}` }))}
                      onToggle={(id) => toggle(selProds, setSelProds, id)}
                    />
                    <SectionList
                      title="Grupos de opções" count={grps.length} selected={selGrps}
                      onToggleAll={() => toggleAll(grps.map((g) => g.id), selGrps, setSelGrps)}
                      items={grps.map((g) => ({ id: g.id, label: g.name, hint: `${items.filter((i) => i.group_id === g.id).length} itens` }))}
                      onToggle={(id) => toggle(selGrps, setSelGrps, id)}
                    />
                    <p className="text-xs text-muted-foreground">Categorias e grupos vinculados a produtos selecionados serão clonados automaticamente.</p>
                  </>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button onClick={handleClone} disabled={!sourceId || busy || loading}>
            {busy ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Clonando...</> : <><Copy className="w-4 h-4 mr-2" /> Clonar</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionList({
  title, count, items, selected, onToggle, onToggleAll, hint,
}: {
  title: string; count: number; selected: Set<string>;
  items: { id: string; label: string; hint?: string | null }[];
  onToggle: (id: string) => void; onToggleAll: () => void; hint?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-center justify-between mb-2">
          <div className="font-medium flex items-center gap-2">{title} <Badge variant="secondary">{selected.size}/{count}</Badge></div>
          <Button size="sm" variant="outline" onClick={onToggleAll} disabled={!count}>
            {selected.size === count && count > 0 ? "Desmarcar todos" : "Marcar todos"}
          </Button>
        </div>
        <div className="max-h-48 overflow-auto divide-y border rounded">
          {items.length === 0 ? (
            <div className="p-3 text-sm text-muted-foreground text-center">Nenhum item</div>
          ) : items.map((it) => (
            <button key={it.id} type="button" onClick={() => onToggle(it.id)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-left text-sm">
              <Checkbox checked={selected.has(it.id)} onCheckedChange={() => onToggle(it.id)} />
              <span className="flex-1 truncate">{it.label}</span>
              {it.hint && <span className="text-xs text-muted-foreground">{it.hint}</span>}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
