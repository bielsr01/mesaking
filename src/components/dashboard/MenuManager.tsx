import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Image as ImageIcon, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { OptionGroupsManager, fetchGroups, optionKeys, OptionGroup } from "./OptionGroupsManager";
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface Category { id: string; name: string; sort_order: number; is_active: boolean; }
interface Product { id: string; category_id: string | null; name: string; description: string | null; price: number; image_url: string | null; is_active: boolean; sort_order: number; }

export const menuKeys = {
  categories: (rid: string) => ["menu", rid, "categories"] as const,
  products: (rid: string) => ["menu", rid, "products"] as const,
  productGroups: (pid: string) => ["menu", "product-groups", pid] as const,
};

export async function fetchCategories(restaurantId: string): Promise<Category[]> {
  const { data } = await supabase.from("categories").select("*").eq("restaurant_id", restaurantId).order("sort_order");
  return (data ?? []) as Category[];
}
export async function fetchProducts(restaurantId: string): Promise<Product[]> {
  const { data } = await supabase.from("products").select("*").eq("restaurant_id", restaurantId).order("sort_order").order("created_at");
  return (data ?? []) as Product[];
}
async function fetchProductGroupIds(productId: string): Promise<string[]> {
  const { data } = await supabase.from("product_option_groups").select("group_id").eq("product_id", productId);
  return (data ?? []).map((r: any) => r.group_id);
}

export function MenuManager({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const { data: categories = [], isLoading: loadingCats } = useQuery({
    queryKey: menuKeys.categories(restaurantId),
    queryFn: () => fetchCategories(restaurantId),
    staleTime: 30_000,
  });
  const { data: products = [], isLoading: loadingProds } = useQuery({
    queryKey: menuKeys.products(restaurantId),
    queryFn: () => fetchProducts(restaurantId),
    staleTime: 30_000,
  });
  const { data: groups = [] } = useQuery({
    queryKey: optionKeys.groups(restaurantId),
    queryFn: () => fetchGroups(restaurantId),
    staleTime: 30_000,
  });

  const reload = () => {
    qc.invalidateQueries({ queryKey: menuKeys.categories(restaurantId) });
    qc.invalidateQueries({ queryKey: menuKeys.products(restaurantId) });
  };

  useEffect(() => {
    const ch = supabase.channel(`menu-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "categories", filter: `restaurant_id=eq.${restaurantId}` }, () => {
        qc.invalidateQueries({ queryKey: menuKeys.categories(restaurantId) });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `restaurant_id=eq.${restaurantId}` }, () => {
        qc.invalidateQueries({ queryKey: menuKeys.products(restaurantId) });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [restaurantId, qc]);

  const [catOpen, setCatOpen] = useState(false);
  const [prodOpen, setProdOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [editingProd, setEditingProd] = useState<Product | null>(null);
  const [defaultCat, setDefaultCat] = useState<string | null>(null);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);

  // Load product->groups when editing
  useEffect(() => {
    if (prodOpen && editingProd) {
      fetchProductGroupIds(editingProd.id).then(setSelectedGroupIds);
    } else if (prodOpen && !editingProd) {
      setSelectedGroupIds([]);
    }
  }, [prodOpen, editingProd]);

  const saveCategory = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    const sort_order = Number(fd.get("sort_order") || 0);
    if (!name) return toast.error("Informe o nome");
    if (editingCat) {
      const { error } = await supabase.from("categories").update({ name, sort_order }).eq("id", editingCat.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("categories").insert({ name, sort_order, restaurant_id: restaurantId });
      if (error) return toast.error(error.message);
    }
    toast.success("Categoria salva");
    setCatOpen(false); setEditingCat(null); reload();
  };

  const toggleCat = async (c: Category) => {
    qc.setQueryData<Category[]>(menuKeys.categories(restaurantId), (prev) =>
      (prev ?? []).map((x) => (x.id === c.id ? { ...x, is_active: !c.is_active } : x))
    );
    const { error } = await supabase.from("categories").update({ is_active: !c.is_active }).eq("id", c.id);
    if (error) { toast.error(error.message); reload(); }
  };
  const removeCat = async (c: Category) => {
    if (!confirm(`Remover categoria "${c.name}"?`)) return;
    qc.setQueryData<Category[]>(menuKeys.categories(restaurantId), (prev) => (prev ?? []).filter((x) => x.id !== c.id));
    const { error } = await supabase.from("categories").delete().eq("id", c.id);
    if (error) { toast.error(error.message); reload(); }
  };

  const saveProduct = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    const description = String(fd.get("description") || "").trim() || null;
    const price = Number(fd.get("price") || 0);
    const category_id = String(fd.get("category_id") || "") || null;
    const file = fd.get("image") as File | null;

    if (!name || price < 0) return toast.error("Verifique nome e preço");

    let image_url = editingProd?.image_url ?? null;
    if (file && file.size > 0) {
      const path = `${restaurantId}/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("menu-images").upload(path, file, { upsert: true });
      if (upErr) return toast.error(upErr.message);
      image_url = supabase.storage.from("menu-images").getPublicUrl(path).data.publicUrl;
    }

    let productId: string;
    if (editingProd) {
      const { error } = await supabase.from("products").update({ name, description, price, category_id, image_url }).eq("id", editingProd.id);
      if (error) return toast.error(error.message);
      productId = editingProd.id;
    } else {
      const { data, error } = await supabase.from("products").insert({ name, description, price, category_id, image_url, restaurant_id: restaurantId }).select("id").single();
      if (error || !data) return toast.error(error?.message || "Erro");
      productId = data.id;
    }

    // Sync product_option_groups
    const { data: existing } = await supabase.from("product_option_groups").select("group_id").eq("product_id", productId);
    const existingIds = (existing ?? []).map((r: any) => r.group_id);
    const toAdd = selectedGroupIds.filter((id) => !existingIds.includes(id));
    const toRemove = existingIds.filter((id) => !selectedGroupIds.includes(id));
    if (toRemove.length) {
      await supabase.from("product_option_groups").delete().eq("product_id", productId).in("group_id", toRemove);
    }
    if (toAdd.length) {
      await supabase.from("product_option_groups").insert(toAdd.map((gid, idx) => ({ product_id: productId, group_id: gid, sort_order: idx })));
    }

    toast.success("Produto salvo");
    setProdOpen(false); setEditingProd(null); setSelectedGroupIds([]); reload();
  };

  const toggleProd = async (p: Product) => {
    qc.setQueryData<Product[]>(menuKeys.products(restaurantId), (prev) =>
      (prev ?? []).map((x) => (x.id === p.id ? { ...x, is_active: !p.is_active } : x))
    );
    const { error } = await supabase.from("products").update({ is_active: !p.is_active }).eq("id", p.id);
    if (error) { toast.error(error.message); reload(); }
  };
  const removeProd = async (p: Product) => {
    if (!confirm(`Remover "${p.name}"?`)) return;
    qc.setQueryData<Product[]>(menuKeys.products(restaurantId), (prev) => (prev ?? []).filter((x) => x.id !== p.id));
    const { error } = await supabase.from("products").delete().eq("id", p.id);
    if (error) { toast.error(error.message); reload(); }
  };

  const isLoading = (loadingCats || loadingProds) && categories.length === 0 && products.length === 0;

  // Quick-create option group from product dialog
  const [quickGroupOpen, setQuickGroupOpen] = useState(false);
  const quickCreateGroup = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    const min_select = Number(fd.get("min_select") || 0);
    const max_select = Number(fd.get("max_select") || 1);
    if (!name) return toast.error("Informe o nome");
    const { data, error } = await supabase.from("option_groups").insert({
      restaurant_id: restaurantId, name, min_select, max_select,
    }).select("id").single();
    if (error || !data) return toast.error(error?.message || "Erro");
    qc.invalidateQueries({ queryKey: optionKeys.groups(restaurantId) });
    setSelectedGroupIds((prev) => [...prev, data.id]);
    setQuickGroupOpen(false);
    toast.success("Grupo criado. Adicione itens depois em 'Grupos de opções'.");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Cardápio</h2>
        <div className="flex gap-2">
          <Dialog open={catOpen} onOpenChange={(o) => { setCatOpen(o); if (!o) setEditingCat(null); }}>
            <DialogTrigger asChild><Button variant="outline"><Plus className="w-4 h-4 mr-1" />Categoria</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingCat ? "Editar" : "Nova"} categoria</DialogTitle></DialogHeader>
              <form onSubmit={saveCategory} className="space-y-4">
                <div className="space-y-2"><Label>Nome</Label><Input name="name" defaultValue={editingCat?.name} required /></div>
                <div className="space-y-2"><Label>Ordem</Label><Input name="sort_order" type="number" defaultValue={editingCat?.sort_order ?? 0} /></div>
                <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          <Dialog open={prodOpen} onOpenChange={(o) => { setProdOpen(o); if (!o) { setEditingProd(null); setSelectedGroupIds([]); } }}>
            <DialogTrigger asChild><Button onClick={() => setDefaultCat(categories[0]?.id ?? null)} disabled={categories.length === 0}><Plus className="w-4 h-4 mr-1" />Produto</Button></DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingProd ? "Editar" : "Novo"} produto</DialogTitle></DialogHeader>
              <form onSubmit={saveProduct} className="space-y-4">
                <div className="space-y-2"><Label>Nome</Label><Input name="name" defaultValue={editingProd?.name} required /></div>
                <div className="space-y-2"><Label>Descrição</Label><Textarea name="description" defaultValue={editingProd?.description ?? ""} rows={2} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Preço (R$)</Label><Input name="price" type="number" step="0.01" min="0" defaultValue={editingProd?.price} required /></div>
                  <div className="space-y-2">
                    <Label>Categoria</Label>
                    <select name="category_id" defaultValue={editingProd?.category_id ?? defaultCat ?? ""} className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm">
                      <option value="">Sem categoria</option>
                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="space-y-2"><Label>Foto</Label><Input name="image" type="file" accept="image/*" /></div>

                <div className="space-y-2 border-t pt-3">
                  <div className="flex items-center justify-between">
                    <Label>Grupos de opções</Label>
                    <Button type="button" size="sm" variant="outline" onClick={() => setQuickGroupOpen(true)}>
                      <Plus className="w-3.5 h-3.5 mr-1" />Novo grupo
                    </Button>
                  </div>
                  {groups.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nenhum grupo criado. Crie um para oferecer sabores, adicionais, etc.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-48 overflow-y-auto border rounded-md p-2">
                      {groups.map((g) => (
                        <label key={g.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted px-2 py-1 rounded">
                          <input
                            type="checkbox"
                            checked={selectedGroupIds.includes(g.id)}
                            onChange={(e) => setSelectedGroupIds((prev) => e.target.checked ? [...prev, g.id] : prev.filter((x) => x !== g.id))}
                          />
                          <span className="flex-1">{g.name}</span>
                          <span className="text-xs text-muted-foreground">mín {g.min_select} · máx {g.max_select}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          {/* Quick group create from product dialog */}
          <Dialog open={quickGroupOpen} onOpenChange={setQuickGroupOpen}>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo grupo de opções</DialogTitle></DialogHeader>
              <form onSubmit={quickCreateGroup} className="space-y-4">
                <div className="space-y-2"><Label>Nome</Label><Input name="name" placeholder="Ex: Sabores" required /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Mín</Label><Input name="min_select" type="number" min="0" defaultValue={0} /></div>
                  <div className="space-y-2"><Label>Máx</Label><Input name="max_select" type="number" min="1" defaultValue={1} /></div>
                </div>
                <p className="text-xs text-muted-foreground">Os itens (ex: "Catupiry +R$2,00") são cadastrados depois na aba "Grupos de opções".</p>
                <DialogFooter><Button type="submit">Criar grupo</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid md:grid-cols-[260px_1fr] gap-6">
        <Card>
          <CardContent className="p-3 space-y-1">
            <div className="text-xs uppercase font-semibold text-muted-foreground px-2 py-1.5">Categorias</div>
            {isLoading ? (
              <>
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-3/4" />
              </>
            ) : categories.length === 0 ? (
              <div className="text-sm text-muted-foreground p-2">Crie sua primeira categoria.</div>
            ) : categories.map((c) => (
              <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted">
                <span className={`flex-1 text-sm ${!c.is_active && "text-muted-foreground line-through"}`}>{c.name}</span>
                <Switch checked={c.is_active} onCheckedChange={() => toggleCat(c)} />
                <Button size="icon" variant="ghost" onClick={() => { setEditingCat(c); setCatOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button size="icon" variant="ghost" onClick={() => removeCat(c)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {isLoading ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          ) : products.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum produto cadastrado.</CardContent></Card>
          ) : (
            <>
              {categories.map((cat) => {
                const list = products.filter((p) => p.category_id === cat.id);
                if (list.length === 0) return null;
                return (
                  <CategoryGroup
                    key={cat.id}
                    title={cat.name}
                    products={list}
                    restaurantId={restaurantId}
                    qc={qc}
                    onEdit={(p) => { setEditingProd(p); setProdOpen(true); }}
                    onToggle={toggleProd}
                    onRemove={removeProd}
                  />
                );
              })}
              {(() => {
                const orphans = products.filter((p) => !p.category_id || !categories.find((c) => c.id === p.category_id));
                if (orphans.length === 0) return null;
                return (
                  <CategoryGroup
                    title="Sem categoria"
                    products={orphans}
                    restaurantId={restaurantId}
                    qc={qc}
                    onEdit={(p) => { setEditingProd(p); setProdOpen(true); }}
                    onToggle={toggleProd}
                    onRemove={removeProd}
                  />
                );
              })()}
            </>
          )}
        </div>
      </div>

      <div className="border-t pt-6">
        <OptionGroupsManager restaurantId={restaurantId} />
      </div>
    </div>
  );
}
