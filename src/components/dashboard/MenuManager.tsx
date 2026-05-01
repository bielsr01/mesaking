import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";

interface Category { id: string; name: string; sort_order: number; is_active: boolean; }
interface Product { id: string; category_id: string | null; name: string; description: string | null; price: number; image_url: string | null; is_active: boolean; }

export function MenuManager({ restaurantId }: { restaurantId: string }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [catOpen, setCatOpen] = useState(false);
  const [prodOpen, setProdOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [editingProd, setEditingProd] = useState<Product | null>(null);
  const [defaultCat, setDefaultCat] = useState<string | null>(null);

  const load = async () => {
    const { data: cats } = await supabase.from("categories").select("*").eq("restaurant_id", restaurantId).order("sort_order");
    const { data: prods } = await supabase.from("products").select("*").eq("restaurant_id", restaurantId).order("created_at");
    setCategories(cats ?? []);
    setProducts((prods ?? []) as Product[]);
  };
  useEffect(() => { load(); }, [restaurantId]);

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
    setCatOpen(false); setEditingCat(null); load();
  };

  const toggleCat = async (c: Category) => {
    await supabase.from("categories").update({ is_active: !c.is_active }).eq("id", c.id);
    load();
  };
  const removeCat = async (c: Category) => {
    if (!confirm(`Remover categoria "${c.name}"?`)) return;
    await supabase.from("categories").delete().eq("id", c.id);
    load();
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

    if (editingProd) {
      const { error } = await supabase.from("products").update({ name, description, price, category_id, image_url }).eq("id", editingProd.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("products").insert({ name, description, price, category_id, image_url, restaurant_id: restaurantId });
      if (error) return toast.error(error.message);
    }
    toast.success("Produto salvo");
    setProdOpen(false); setEditingProd(null); load();
  };

  const toggleProd = async (p: Product) => {
    await supabase.from("products").update({ is_active: !p.is_active }).eq("id", p.id);
    load();
  };
  const removeProd = async (p: Product) => {
    if (!confirm(`Remover "${p.name}"?`)) return;
    await supabase.from("products").delete().eq("id", p.id);
    load();
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
          <Dialog open={prodOpen} onOpenChange={(o) => { setProdOpen(o); if (!o) setEditingProd(null); }}>
            <DialogTrigger asChild><Button onClick={() => setDefaultCat(categories[0]?.id ?? null)} disabled={categories.length === 0}><Plus className="w-4 h-4 mr-1" />Produto</Button></DialogTrigger>
            <DialogContent>
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
                <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid md:grid-cols-[260px_1fr] gap-6">
        <Card>
          <CardContent className="p-3 space-y-1">
            <div className="text-xs uppercase font-semibold text-muted-foreground px-2 py-1.5">Categorias</div>
            {categories.length === 0 && <div className="text-sm text-muted-foreground p-2">Crie sua primeira categoria.</div>}
            {categories.map((c) => (
              <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted">
                <span className={`flex-1 text-sm ${!c.is_active && "text-muted-foreground line-through"}`}>{c.name}</span>
                <Switch checked={c.is_active} onCheckedChange={() => toggleCat(c)} />
                <Button size="icon" variant="ghost" onClick={() => { setEditingCat(c); setCatOpen(true); }}><Pencil className="w-3.5 h-3.5" /></Button>
                <Button size="icon" variant="ghost" onClick={() => removeCat(c)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-3">
          {products.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">Nenhum produto cadastrado.</CardContent></Card>
          ) : products.map((p) => (
            <Card key={p.id} className={!p.is_active ? "opacity-60" : ""}>
              <CardContent className="p-3 flex gap-3 items-center">
                <div className="w-16 h-16 rounded-lg bg-muted overflow-hidden grid place-items-center shrink-0">
                  {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <ImageIcon className="w-6 h-6 text-muted-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{p.name}</div>
                  {p.description && <div className="text-xs text-muted-foreground line-clamp-1">{p.description}</div>}
                  <div className="text-sm font-semibold text-primary mt-0.5">{brl(p.price)}</div>
                </div>
                <Switch checked={p.is_active} onCheckedChange={() => toggleProd(p)} />
                <Button size="icon" variant="ghost" onClick={() => { setEditingProd(p); setProdOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => removeProd(p)}><Trash2 className="w-4 h-4" /></Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
