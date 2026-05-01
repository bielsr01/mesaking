import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ShoppingCart, Plus, Minus, Image as ImageIcon, Trash2 } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { brl } from "@/lib/format";
import { Checkout } from "@/components/Checkout";
import { ActiveOrderBanner } from "@/components/ActiveOrderBanner";
import { Skeleton } from "@/components/ui/skeleton";
import { isOpenNow, ManualOverride } from "@/lib/hours";

interface Restaurant { id: string; name: string; slug: string; description: string | null; logo_url: string | null; is_open: boolean; phone: string | null; opening_hours: any; latitude: number | null; longitude: number | null; delivery_zones: any; manual_override: ManualOverride; }
interface Category { id: string; name: string; sort_order: number; }
interface Product { id: string; name: string; description: string | null; price: number; image_url: string | null; category_id: string | null; }

export default function RestaurantPublic() {
  const { slug } = useParams<{ slug: string }>();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selected, setSelected] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const cart = useCart();

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: r } = await supabase.from("restaurants").select("*").eq("slug", slug!).maybeSingle();
      if (cancelled) return;
      if (!r) { setLoading(false); return; }
      setRestaurant(r as Restaurant);
      // Parallel fetch categories + products for ~2x faster menu load
      const [catsRes, prodsRes] = await Promise.all([
        supabase.from("categories").select("*").eq("restaurant_id", r.id).eq("is_active", true).order("sort_order"),
        supabase.from("products").select("*").eq("restaurant_id", r.id).eq("is_active", true).order("created_at"),
      ]);
      if (cancelled) return;
      setCategories(catsRes.data ?? []);
      setProducts((prodsRes.data ?? []) as Product[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  // Realtime: react to open/close, menu and product changes instantly
  useEffect(() => {
    if (!restaurant?.id) return;
    const rid = restaurant.id;
    const reloadMenu = async () => {
      const [catsRes, prodsRes] = await Promise.all([
        supabase.from("categories").select("*").eq("restaurant_id", rid).eq("is_active", true).order("sort_order"),
        supabase.from("products").select("*").eq("restaurant_id", rid).eq("is_active", true).order("created_at"),
      ]);
      setCategories(catsRes.data ?? []);
      setProducts((prodsRes.data ?? []) as Product[]);
    };
    const ch = supabase.channel(`public-${rid}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "restaurants", filter: `id=eq.${rid}` }, (payload) => {
        setRestaurant((prev) => (prev ? { ...prev, ...(payload.new as Restaurant) } : prev));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "categories", filter: `restaurant_id=eq.${rid}` }, () => reloadMenu())
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `restaurant_id=eq.${rid}` }, () => reloadMenu())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [restaurant?.id]);

  const grouped = useMemo(() => {
    const m: { cat: Category | null; products: Product[] }[] = [];
    categories.forEach((c) => m.push({ cat: c, products: products.filter((p) => p.category_id === c.id) }));
    const orphans = products.filter((p) => !p.category_id || !categories.find((c) => c.id === p.category_id));
    if (orphans.length) m.push({ cat: null, products: orphans });
    return m.filter((g) => g.products.length > 0);
  }, [categories, products]);

  const itemCount = cart.items.reduce((s, i) => s + i.quantity, 0);

  if (loading && !restaurant) {
    return (
      <div className="min-h-screen pb-24">
        <header className="bg-gradient-warm">
          <div className="container py-8 flex items-center gap-4">
            <Skeleton className="w-20 h-20 rounded-2xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-4 w-80" />
              <Skeleton className="h-5 w-24" />
            </div>
          </div>
        </header>
        <main className="container py-6 space-y-6">
          <Skeleton className="h-7 w-40" />
          <div className="grid gap-3 md:grid-cols-2">
            <Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" />
          </div>
        </main>
      </div>
    );
  }
  if (!restaurant) return <div className="min-h-screen grid place-items-center text-muted-foreground">Restaurante não encontrado.</div>;

  const addToCart = () => {
    if (!selected) return;
    cart.add(restaurant.id, { productId: selected.id, name: selected.name, price: Number(selected.price), quantity: qty, notes: notes.trim() || undefined });
    setSelected(null); setQty(1); setNotes("");
  };

  return (
    <div className="min-h-screen pb-24">
      <ActiveOrderBanner restaurantId={restaurant.id} />

      <header className="bg-gradient-warm text-primary-foreground">
        <div className="container py-8 flex items-center gap-4">
          {restaurant.logo_url ? (
            <img src={restaurant.logo_url} alt={restaurant.name} className="w-20 h-20 rounded-2xl object-cover border-4 border-background/20" />
          ) : (
            <div className="w-20 h-20 rounded-2xl bg-background/20 grid place-items-center text-3xl font-bold">{restaurant.name[0]}</div>
          )}
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{restaurant.name}</h1>
            {restaurant.description && <p className="opacity-90 text-sm mt-1">{restaurant.description}</p>}
            <div className="mt-2">
              {isOpenNow(restaurant.opening_hours)
                ? <Badge className="bg-success text-success-foreground">Aberto agora</Badge>
                : <Badge variant="secondary">Fechado no momento</Badge>}
            </div>
          </div>
        </div>
      </header>

      <main className="container py-6 space-y-8">
        {grouped.length === 0 && <p className="text-center text-muted-foreground py-12">Cardápio sendo montado...</p>}
        {grouped.map((g) => (
          <section key={g.cat?.id ?? "_"}>
            <h2 className="text-xl font-bold mb-3">{g.cat?.name ?? "Outros"}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {g.products.map((p) => (
                <Card key={p.id} className="cursor-pointer hover:shadow-elegant transition-shadow" onClick={() => { setSelected(p); setQty(1); setNotes(""); }}>
                  <CardContent className="p-3 flex gap-3">
                    <div className="w-24 h-24 rounded-lg bg-muted overflow-hidden grid place-items-center shrink-0">
                      {p.image_url ? <img src={p.image_url} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-cover" /> : <ImageIcon className="w-7 h-7 text-muted-foreground" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold">{p.name}</div>
                      {p.description && <div className="text-sm text-muted-foreground line-clamp-2">{p.description}</div>}
                      <div className="font-bold text-primary mt-1">{brl(p.price)}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ))}
      </main>

      {/* Floating cart */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetTrigger asChild>
          <Button
            className="fixed bottom-6 right-6 h-14 px-6 rounded-full shadow-elegant gap-3 z-30"
            size="lg"
            disabled={itemCount === 0}
          >
            <ShoppingCart className="w-5 h-5" />
            <span>{itemCount} {itemCount === 1 ? "item" : "itens"}</span>
            <span className="font-bold">{brl(cart.total)}</span>
          </Button>
        </SheetTrigger>
        <SheetContent className="flex flex-col">
          <SheetHeader><SheetTitle>Seu pedido</SheetTitle></SheetHeader>
          <div className="flex-1 overflow-auto py-4 space-y-3">
            {cart.items.length === 0 && <p className="text-center text-muted-foreground py-8">Carrinho vazio</p>}
            {cart.items.map((i) => (
              <div key={i.productId + (i.notes ?? "")} className="flex gap-3 items-start">
                <div className="flex-1">
                  <div className="font-medium">{i.name}</div>
                  {i.notes && <div className="text-xs text-muted-foreground italic">"{i.notes}"</div>}
                  <div className="text-sm text-muted-foreground">{brl(i.price)}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => cart.updateQty(i.productId, i.quantity - 1)}><Minus className="w-3 h-3" /></Button>
                  <span className="w-6 text-center font-medium">{i.quantity}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => cart.updateQty(i.productId, i.quantity + 1)}><Plus className="w-3 h-3" /></Button>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => cart.remove(i.productId)}><Trash2 className="w-3 h-3" /></Button>
              </div>
            ))}
          </div>
          <div className="border-t pt-4 space-y-3">
            <div className="flex justify-between font-bold text-lg"><span>Total</span><span>{brl(cart.total)}</span></div>
            {!isOpenNow(restaurant.opening_hours) && <p className="text-sm text-destructive text-center">Loja fechada — não é possível finalizar.</p>}
            <Button className="w-full" size="lg" disabled={cart.items.length === 0 || !isOpenNow(restaurant.opening_hours)} onClick={() => { setCartOpen(false); setCheckoutOpen(true); }}>
              Finalizar pedido
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Product modal */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          {selected && (
            <>
              <DialogHeader><DialogTitle>{selected.name}</DialogTitle></DialogHeader>
              {selected.image_url && <img src={selected.image_url} alt={selected.name} className="w-full h-48 object-cover rounded-lg" />}
              {selected.description && <p className="text-sm text-muted-foreground">{selected.description}</p>}
              <div className="space-y-2">
                <Label>Observação (opcional)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: sem cebola" rows={2} />
              </div>
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" onClick={() => setQty(Math.max(1, qty - 1))}><Minus className="w-4 h-4" /></Button>
                  <span className="w-8 text-center font-bold">{qty}</span>
                  <Button size="icon" variant="outline" onClick={() => setQty(qty + 1)}><Plus className="w-4 h-4" /></Button>
                </div>
                <Button onClick={addToCart} className="flex-1 ml-4">
                  Adicionar • {brl(selected.price * qty)}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Checkout
        open={checkoutOpen}
        onOpenChange={setCheckoutOpen}
        restaurant={restaurant}
      />

      <footer className="container py-6 text-center text-xs text-muted-foreground">
        <Link to="/" className="hover:underline">Powered by MesaPro</Link>
      </footer>
    </div>
  );
}
