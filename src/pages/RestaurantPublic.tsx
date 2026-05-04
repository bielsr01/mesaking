import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ShoppingCart, Plus, Minus, Image as ImageIcon, Trash2, Info, MapPin, Clock, Bike, Store, Share2, MessageCircle, Instagram, Facebook } from "lucide-react";
import { useCart, CartItemOption } from "@/hooks/useCart";
import { brl } from "@/lib/format";
import { Checkout } from "@/components/Checkout";
import { ActiveOrderBanner } from "@/components/ActiveOrderBanner";
import { CouponsBanner } from "@/components/CouponsBanner";
import { Skeleton } from "@/components/ui/skeleton";
import { isOpenNow, ManualOverride, DAY_LABELS } from "@/lib/hours";
import { toast } from "sonner";

interface Restaurant { id: string; name: string; slug: string; description: string | null; logo_url: string | null; cover_url: string | null; is_open: boolean; phone: string | null; opening_hours: any; latitude: number | null; longitude: number | null; delivery_zones: any; manual_override: ManualOverride; address_cep: string | null; address_street: string | null; address_number: string | null; address_complement: string | null; address_neighborhood: string | null; address_city: string | null; address_state: string | null; delivery_time_min: number | null; delivery_time_max: number | null; whatsapp_url: string | null; instagram_url: string | null; facebook_url: string | null; service_delivery: boolean | null; service_pickup: boolean | null; }
interface Category { id: string; name: string; sort_order: number; }
interface Product { id: string; name: string; description: string | null; price: number; image_url: string | null; category_id: string | null; }
interface OptionGroup { id: string; name: string; min_select: number; max_select: number; sort_order: number; items: { id: string; name: string; extra_price: number }[]; }

export default function RestaurantPublic() {
  const { slug } = useParams<{ slug: string }>();
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [groupsByProduct, setGroupsByProduct] = useState<Record<string, OptionGroup[]>>({});
  const [selected, setSelected] = useState<Product | null>(null);
  const [qty, setQty] = useState(1);
  const [notes, setNotes] = useState("");
  const [selectedOpts, setSelectedOpts] = useState<Record<string, string[]>>({}); // groupId -> itemIds
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const cart = useCart();

  const [loading, setLoading] = useState(true);

  const productGroups = selected ? (groupsByProduct[selected.id] ?? []) : [];

  // Loads categories + products + option groups/items/links and indexes by product
  const loadMenu = async (rid: string) => {
    const [catsRes, prodsRes, linksRes, groupsRes, itemsRes] = await Promise.all([
      supabase.from("categories").select("*").eq("restaurant_id", rid).eq("is_active", true).order("sort_order"),
      supabase.from("products").select("*").eq("restaurant_id", rid).eq("is_active", true).order("sort_order").order("created_at"),
      supabase.from("product_option_groups").select("product_id, group_id, sort_order"),
      supabase.from("option_groups").select("id, name, min_select, max_select, sort_order, is_active, restaurant_id").eq("restaurant_id", rid).eq("is_active", true),
      supabase.from("option_items").select("id, group_id, name, extra_price, sort_order, is_active, option_groups!inner(restaurant_id)").eq("option_groups.restaurant_id", rid).eq("is_active", true).order("sort_order"),
    ]);
    const cats = catsRes.data ?? [];
    const prods = (prodsRes.data ?? []) as Product[];
    const groups = (groupsRes.data ?? []) as any[];
    const groupById = new Map<string, any>(groups.map((g) => [g.id, g]));
    const itemsByGroup = new Map<string, any[]>();
    ((itemsRes.data ?? []) as any[]).forEach((it) => {
      const arr = itemsByGroup.get(it.group_id) ?? [];
      arr.push(it);
      itemsByGroup.set(it.group_id, arr);
    });
    const idx: Record<string, OptionGroup[]> = {};
    const linkOrder: Record<string, Record<string, number>> = {};
    ((linksRes.data ?? []) as any[]).forEach((l) => {
      const g = groupById.get(l.group_id);
      if (!g) return; // group inactive or not in this restaurant
      const og: OptionGroup = {
        id: g.id, name: g.name, min_select: g.min_select, max_select: g.max_select, sort_order: l.sort_order ?? 0,
        items: (itemsByGroup.get(g.id) ?? []).map((it) => ({ id: it.id, name: it.name, extra_price: Number(it.extra_price) })),
      };
      const arr = idx[l.product_id] ?? [];
      arr.push(og);
      idx[l.product_id] = arr;
      (linkOrder[l.product_id] ??= {})[g.id] = l.sort_order ?? 0;
    });
    Object.keys(idx).forEach((pid) => idx[pid].sort((a, b) => (linkOrder[pid]?.[a.id] ?? 0) - (linkOrder[pid]?.[b.id] ?? 0)));
    return { cats, prods, idx };
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: r } = await supabase.from("restaurants").select("*").eq("slug", slug!).maybeSingle();
      if (cancelled) return;
      if (!r) { setLoading(false); return; }
      setRestaurant(r as unknown as Restaurant);
      const { cats, prods, idx } = await loadMenu(r.id);
      if (cancelled) return;
      setCategories(cats);
      setProducts(prods);
      setGroupsByProduct(idx);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (!restaurant?.id) return;
    const rid = restaurant.id;
    const reloadMenu = async () => {
      const { cats, prods, idx } = await loadMenu(rid);
      setCategories(cats);
      setProducts(prods);
      setGroupsByProduct(idx);
    };
    const ch = supabase.channel(`public-${rid}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "restaurants", filter: `id=eq.${rid}` }, (payload) => {
        setRestaurant((prev) => (prev ? { ...prev, ...(payload.new as Restaurant) } : prev));
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "categories", filter: `restaurant_id=eq.${rid}` }, () => reloadMenu())
      .on("postgres_changes", { event: "*", schema: "public", table: "products", filter: `restaurant_id=eq.${rid}` }, () => reloadMenu())
      .on("postgres_changes", { event: "*", schema: "public", table: "option_groups", filter: `restaurant_id=eq.${rid}` }, () => reloadMenu())
      .on("postgres_changes", { event: "*", schema: "public", table: "option_items" }, () => reloadMenu())
      .on("postgres_changes", { event: "*", schema: "public", table: "product_option_groups" }, () => reloadMenu())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [restaurant?.id]);

  // Reset selected options when product changes
  useEffect(() => {
    if (!selected) { setSelectedOpts({}); return; }
    const initial: Record<string, string[]> = {};
    (groupsByProduct[selected.id] ?? []).forEach((g) => { initial[g.id] = []; });
    setSelectedOpts(initial);
  }, [selected, groupsByProduct]);

  const grouped = useMemo(() => {
    const m: { cat: Category | null; products: Product[] }[] = [];
    categories.forEach((c) => m.push({ cat: c, products: products.filter((p) => p.category_id === c.id) }));
    const orphans = products.filter((p) => !p.category_id || !categories.find((c) => c.id === p.category_id));
    if (orphans.length) m.push({ cat: null, products: orphans });
    return m.filter((g) => g.products.length > 0);
  }, [categories, products]);

  const itemCount = cart.items.reduce((s, i) => s + i.quantity, 0);

  // Scroll-spy + nav refs
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const navRef = useRef<HTMLDivElement | null>(null);
  const navItemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [activeCat, setActiveCat] = useState<string>("");
  const isScrollingRef = useRef(false);

  useEffect(() => {
    if (grouped.length && !activeCat) {
      setActiveCat(grouped[0].cat?.id ?? "_orphans");
    }
  }, [grouped, activeCat]);

  useEffect(() => {
    let ticking = false;
    const update = () => {
      ticking = false;
      if (isScrollingRef.current) return;
      const offset = 80; // nav sticky no topo
      let current = "";
      for (const g of grouped) {
        const key = g.cat?.id ?? "_orphans";
        const el = sectionRefs.current[key];
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top - offset <= 0) current = key;
      }
      if (current) setActiveCat((prev) => (prev === current ? prev : current));
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => window.removeEventListener("scroll", onScroll);
  }, [grouped]);

  // Auto-scroll a categoria ativa para dentro da área visível do nav horizontal
  useEffect(() => {
    const btn = navItemRefs.current[activeCat];
    const nav = navRef.current;
    if (!btn || !nav) return;
    const btnRect = btn.getBoundingClientRect();
    const navRect = nav.getBoundingClientRect();
    if (btnRect.left < navRect.left || btnRect.right > navRect.right) {
      nav.scrollTo({ left: btn.offsetLeft - 16, behavior: "auto" });
    }
  }, [activeCat]);

  const goToCategory = (key: string) => {
    const el = sectionRefs.current[key];
    if (!el) return;
    isScrollingRef.current = true;
    setActiveCat(key);
    const y = el.getBoundingClientRect().top + window.scrollY - 60;
    window.scrollTo({ top: y, behavior: "smooth" });
    setTimeout(() => { isScrollingRef.current = false; }, 700);
  };


  const extrasTotal = useMemo(() => {
    let sum = 0;
    productGroups.forEach((g) => {
      (selectedOpts[g.id] ?? []).forEach((itemId) => {
        const it = g.items.find((x) => x.id === itemId);
        if (it) sum += it.extra_price;
      });
    });
    return sum;
  }, [productGroups, selectedOpts]);

  const groupRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [shakeGroupId, setShakeGroupId] = useState<string | null>(null);

  const toggleOpt = (g: OptionGroup, itemId: string) => {
    setSelectedOpts((prev) => {
      const cur = prev[g.id] ?? [];
      if (g.max_select === 1) {
        return { ...prev, [g.id]: cur[0] === itemId ? [] : [itemId] };
      }
      if (cur.includes(itemId)) return { ...prev, [g.id]: cur.filter((x) => x !== itemId) };
      if (cur.length >= g.max_select) {
        // Sinaliza limite com shake no próprio grupo
        setShakeGroupId(g.id);
        setTimeout(() => setShakeGroupId(null), 600);
        return prev;
      }
      return { ...prev, [g.id]: [...cur, itemId] };
    });
  };

  const validateAndAdd = () => {
    if (!selected || !restaurant) return;
    for (const g of productGroups) {
      const cnt = (selectedOpts[g.id] ?? []).length;
      if (cnt < g.min_select) {
        const el = groupRefs.current[g.id];
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
        setShakeGroupId(g.id);
        setTimeout(() => setShakeGroupId(null), 600);
        return;
      }
    }
    const opts: CartItemOption[] = [];
    productGroups.forEach((g) => {
      (selectedOpts[g.id] ?? []).forEach((itemId) => {
        const it = g.items.find((x) => x.id === itemId);
        if (it) opts.push({ groupName: g.name, itemName: it.name, extraPrice: it.extra_price });
      });
    });
    cart.add(restaurant.id, {
      productId: selected.id,
      name: selected.name,
      price: Number(selected.price),
      quantity: qty,
      notes: notes.trim() || undefined,
      options: opts.length ? opts : undefined,
    });
    setSelected(null); setQty(1); setNotes(""); setSelectedOpts({});
  };

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

  const productUnitPrice = selected ? Number(selected.price) + extrasTotal : 0;

  return (
    <div className="min-h-screen pb-24">
      {/* Banner com foto de capa + logo central deslocada para baixo */}
      <header className="relative">
        <div className="relative w-full aspect-[16/7] sm:aspect-auto sm:h-48 md:h-56 lg:h-64 overflow-hidden bg-gradient-warm">
          {restaurant.cover_url && (
            <img
              src={restaurant.cover_url}
              alt={`Capa ${restaurant.name}`}
              className="absolute inset-0 w-full h-full object-cover object-center"
            />
          )}
          {/* Badge aberto/fechado sobre a capa */}
          <div className="absolute top-3 left-3 z-10">
            {isOpenNow(restaurant.opening_hours, restaurant.manual_override)
              ? <Badge className="bg-success text-success-foreground shadow">Aberto agora</Badge>
              : <Badge variant="secondary" className="shadow">Fechado no momento</Badge>}
          </div>
        </div>

        {/* Logo central, deslocada para baixo (sobreposta ao banner) */}
        <div className="container relative">
          <div className="flex justify-center -mt-10 sm:-mt-14">
            {restaurant.logo_url ? (
              <img
                src={restaurant.logo_url}
                alt={restaurant.name}
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-4 border-background shadow-lg bg-background"
              />
            ) : (
              <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-primary text-primary-foreground grid place-items-center text-3xl font-bold border-4 border-background shadow-lg">
                {restaurant.name[0]}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Nome + endereço + tempo */}
      {(() => {
        const addressLine = [
          restaurant.address_street,
          restaurant.address_number,
          restaurant.address_neighborhood,
          restaurant.address_city && restaurant.address_state
            ? `${restaurant.address_city}/${restaurant.address_state}`
            : restaurant.address_city || restaurant.address_state,
        ].filter(Boolean).join(", ");
        const tmin = restaurant.delivery_time_min;
        const tmax = restaurant.delivery_time_max;
        const hasTime = tmin != null || tmax != null;
        const timeLabel = hasTime
          ? (tmin != null && tmax != null ? `${tmin}–${tmax} min` : `${tmin ?? tmax} min`)
          : null;
        return (
          <div className="container pt-3 pb-4 text-center space-y-2">
            <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{restaurant.name}</h1>
            {addressLine && (
              <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="w-4 h-4 shrink-0" />
                <span className="truncate">{addressLine}</span>
              </div>
            )}
            {timeLabel && (
              <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="w-4 h-4 shrink-0" />
                <span>Entrega <strong className="font-bold text-foreground">{timeLabel}</strong></span>
              </div>
            )}
            <div className="pt-2">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline" className="w-full sm:w-auto sm:min-w-[280px] gap-2">
                    <Info className="w-4 h-4" /> Informação
                  </Button>
                </SheetTrigger>
                <InfoSheetContent restaurant={restaurant} addressLine={addressLine} timeLabel={timeLabel} />
              </Sheet>
            </div>
          </div>
        );
      })()}

      {/* Banner de pedido ativo — acima das categorias (rola normalmente) */}
      <ActiveOrderBanner restaurantId={restaurant.id} />

      {/* Cupons disponíveis */}
      <CouponsBanner restaurantId={restaurant.id} />

      {/* Nav horizontal de categorias — sticky no topo da viewport */}
      {grouped.length > 0 && (
        <nav className="sticky top-0 z-30 bg-background/95 backdrop-blur border-y shadow-sm">
          <div
            ref={navRef}
            className="container flex gap-2 overflow-x-auto py-2 scrollbar-none"
            style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}
          >
            {grouped.map((g) => {
              const key = g.cat?.id ?? "_orphans";
              const label = g.cat?.name ?? "Outros";
              const isActive = activeCat === key;
              return (
                <button
                  key={key}
                  ref={(el) => { navItemRefs.current[key] = el; }}
                  onClick={() => goToCategory(key)}
                  className={`shrink-0 px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors border ${isActive ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-foreground border-transparent hover:bg-muted/70"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </nav>
      )}



      <main className="container py-6 space-y-8">
        {grouped.length === 0 && <p className="text-center text-muted-foreground py-12">Cardápio sendo montado...</p>}
        {grouped.map((g) => {
          const key = g.cat?.id ?? "_orphans";
          return (
            <section
              key={key}
              ref={(el) => { sectionRefs.current[key] = el; }}
              style={{ scrollMarginTop: 70 }}
            >
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
          );
        })}
      </main>

      {/* Bottom cart bar — só aparece quando há itens */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        {itemCount > 0 && (
          <div className="fixed bottom-0 inset-x-0 z-30 bg-background border-t shadow-elegant">
            <div className="container py-3">
              <SheetTrigger asChild>
                <Button
                  className="w-full h-14 rounded-xl gap-3 justify-between px-5 text-base"
                  size="lg"
                >
                  <span className="flex items-center gap-3">
                    <ShoppingCart className="w-5 h-5" />
                    <span>{itemCount} {itemCount === 1 ? "item" : "itens"}</span>
                  </span>
                  <span className="font-bold">{brl(cart.total)}</span>
                </Button>
              </SheetTrigger>
            </div>
          </div>
        )}
        <SheetContent side="right" className="flex flex-col w-full sm:max-w-md p-6">
          <SheetHeader><SheetTitle>Seu pedido</SheetTitle></SheetHeader>
          <div className="flex-1 overflow-auto py-4 space-y-3">
            {cart.items.length === 0 && <p className="text-center text-muted-foreground py-8">Carrinho vazio</p>}
            {cart.items.map((i) => (
              <div key={i.productId + (i.optionsKey ?? "") + (i.notes ?? "")} className="flex gap-3 items-start">
                <div className="flex-1">
                  <div className="font-medium">{i.name}</div>
                  {i.options && i.options.length > 0 && (
                    <div className="text-xs text-muted-foreground">
                      {i.options.map((o, idx) => (
                        <div key={idx}>+ {o.itemName}{o.extraPrice > 0 ? ` (${brl(o.extraPrice)})` : ""}</div>
                      ))}
                    </div>
                  )}
                  {i.notes && <div className="text-xs text-muted-foreground italic">"{i.notes}"</div>}
                  <div className="text-sm text-muted-foreground">{brl(cart.unitPrice(i))}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => cart.updateQty(i.productId, i.quantity - 1, i.optionsKey)}><Minus className="w-3 h-3" /></Button>
                  <span className="w-6 text-center font-medium">{i.quantity}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => cart.updateQty(i.productId, i.quantity + 1, i.optionsKey)}><Plus className="w-3 h-3" /></Button>
                </div>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => cart.remove(i.productId, i.optionsKey)}><Trash2 className="w-3 h-3" /></Button>
              </div>
            ))}
          </div>
          <div className="border-t pt-4 space-y-3">
            <div className="flex justify-between font-bold text-lg"><span>Total</span><span>{brl(cart.total)}</span></div>
            {!isOpenNow(restaurant.opening_hours, restaurant.manual_override) && <p className="text-sm text-destructive text-center">Loja fechada — não é possível finalizar.</p>}
            <Button className="w-full" size="lg" disabled={cart.items.length === 0 || !isOpenNow(restaurant.opening_hours, restaurant.manual_override)} onClick={() => { setCartOpen(false); setCheckoutOpen(true); }}>
              Finalizar pedido
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Product modal */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent
          className="p-0 gap-0 max-w-lg w-full max-h-[100dvh] sm:max-h-[90vh] h-[100dvh] sm:h-auto sm:rounded-lg flex flex-col overflow-hidden"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {selected && (
            <>
              <div className="flex-1 overflow-y-auto p-6 space-y-3">
                <DialogHeader><DialogTitle>{selected.name}</DialogTitle></DialogHeader>
                {selected.image_url && <img src={selected.image_url} alt={selected.name} className="w-full h-48 object-cover rounded-lg" />}
                {selected.description && <p className="text-sm text-muted-foreground">{selected.description}</p>}


                {productGroups.map((g) => {
                  const cur = selectedOpts[g.id] ?? [];
                  const shaking = shakeGroupId === g.id;
                  return (
                    <div
                      key={g.id}
                      ref={(el) => { groupRefs.current[g.id] = el; }}
                      style={{ scrollMarginTop: 80 }}
                      className="space-y-2 border-t pt-3"
                    >
                      <div className={`flex items-center justify-between ${shaking ? "animate-shake" : ""}`}>
                        <Label className={`font-semibold ${shaking ? "text-destructive" : ""}`}>{g.name}</Label>
                        <span className={`text-xs ${shaking ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                          {g.min_select > 0 ? `Obrigatório · ` : "Opcional · "}
                          {g.max_select === 1 ? "escolha 1" : `até ${g.max_select}`}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {g.items.length === 0 && <p className="text-xs text-muted-foreground">Sem itens disponíveis.</p>}
                        {g.items.map((it) => {
                          const checked = cur.includes(it.id);
                          return (
                            <label key={it.id} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer hover:bg-muted ${checked ? "border-primary bg-accent/30" : ""}`}>
                              <input
                                type={g.max_select === 1 ? "radio" : "checkbox"}
                                name={`grp-${g.id}`}
                                checked={checked}
                                onChange={() => toggleOpt(g, it.id)}
                              />
                              <span className="flex-1 text-sm">{it.name}</span>
                              {it.extra_price > 0 && (
                                <span className="text-sm font-semibold text-primary">+ {brl(it.extra_price)}</span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                <div className="space-y-2 border-t pt-3">
                  <Label>Observação (opcional)</Label>
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex: sem cebola" rows={2} />
                </div>
              </div>
              <div className="border-t bg-background p-4 flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Button size="icon" variant="outline" onClick={() => setQty(Math.max(1, qty - 1))}><Minus className="w-4 h-4" /></Button>
                  <span className="w-8 text-center font-bold">{qty}</span>
                  <Button size="icon" variant="outline" onClick={() => setQty(qty + 1)}><Plus className="w-4 h-4" /></Button>
                </div>
                <Button onClick={validateAndAdd} className="flex-1">
                  Adicionar • {brl(productUnitPrice * qty)}
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

/* ===========================
   Sheet "Informação" da loja
   =========================== */
function InfoSheetContent({
  restaurant,
  addressLine,
  timeLabel,
}: {
  restaurant: Restaurant;
  addressLine: string;
  timeLabel: string | null;
}) {
  const zones = Array.isArray(restaurant.delivery_zones) ? (restaurant.delivery_zones as { radius_km: number; fee: number }[]) : [];
  const validZones = zones.filter((z) => z && z.radius_km > 0).sort((a, b) => Number(a.fee) - Number(b.fee));
  const minFee = validZones.length ? Number(validZones[0].fee) : null;
  const feeMessage = minFee == null
    ? null
    : validZones.length === 1
      ? `Taxa de entrega por apenas ${brl(minFee)}`
      : `Taxa de entrega a partir de ${brl(minFee)}`;

  const normalizeWhats = (v?: string | null) => {
    if (!v) return null;
    const t = v.trim();
    if (!t) return null;
    if (t.startsWith("http")) return t;
    const digits = t.replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}` : null;
  };
  const wa = normalizeWhats(restaurant.whatsapp_url);
  const ig = restaurant.instagram_url?.trim() || null;
  const fb = restaurant.facebook_url?.trim() || null;

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: restaurant.name, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado!");
      }
    } catch {
      /* user cancel */
    }
  };

  return (
    <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
      <SheetHeader>
        <SheetTitle>Informações</SheetTitle>
      </SheetHeader>

      <div className="space-y-5 mt-4">
        <div>
          <div className="text-lg font-bold">{restaurant.name}</div>
          {restaurant.description && (
            <p className="text-sm text-muted-foreground mt-1">{restaurant.description}</p>
          )}
        </div>

        {/* Botões sociais */}
        <div className="flex flex-wrap gap-2">
          {wa && (
            <a href={wa} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <MessageCircle className="w-4 h-4" /> WhatsApp
              </Button>
            </a>
          )}
          {ig && (
            <a href={ig} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Instagram className="w-4 h-4" /> Instagram
              </Button>
            </a>
          )}
          {fb && (
            <a href={fb} target="_blank" rel="noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Facebook className="w-4 h-4" /> Facebook
              </Button>
            </a>
          )}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={handleShare}>
            <Share2 className="w-4 h-4" /> Compartilhar
          </Button>
        </div>

        {/* Endereço */}
        {addressLine && (
          <section className="space-y-1">
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <MapPin className="w-4 h-4" /> Endereço
            </div>
            <p className="text-sm text-muted-foreground">{addressLine}</p>
            {restaurant.address_complement && (
              <p className="text-xs text-muted-foreground">Complemento: {restaurant.address_complement}</p>
            )}
            {restaurant.address_cep && (
              <p className="text-xs text-muted-foreground">CEP: {restaurant.address_cep}</p>
            )}
          </section>
        )}

        {/* Tipos de serviço */}
        <section className="space-y-2">
          <div className="text-sm font-semibold">Tipos de serviço</div>
          <div className="space-y-2">
            {(restaurant.service_delivery ?? true) && (
              <div className="p-3 rounded-lg border space-y-1">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <Bike className="w-4 h-4" /> Delivery
                </div>
                {timeLabel && (
                  <div className="text-xs text-muted-foreground">Tempo estimado: <strong className="text-foreground">{timeLabel}</strong></div>
                )}
                {feeMessage && (
                  <div className="text-xs text-muted-foreground">{feeMessage}</div>
                )}
              </div>
            )}
            {restaurant.service_pickup && (
              <div className="p-3 rounded-lg border space-y-1">
                <div className="flex items-center gap-2 font-medium text-sm">
                  <Store className="w-4 h-4" /> Retirada na loja
                </div>
                <div className="text-xs text-muted-foreground">Retire o pedido diretamente no balcão.</div>
              </div>
            )}
          </div>
        </section>

        {/* Horário de funcionamento detalhado */}
        <section className="space-y-2">
          <div className="text-sm font-semibold flex items-center gap-1.5">
            <Clock className="w-4 h-4" /> Horário de funcionamento
          </div>
          <div className="rounded-lg border divide-y">
            {DAY_LABELS.map((label, i) => {
              const cfg = restaurant.opening_hours?.[String(i)];
              const today = new Date().getDay() === i;
              return (
                <div
                  key={i}
                  className={`flex items-center justify-between px-3 py-2 text-sm ${today ? "bg-muted/50 font-semibold" : ""}`}
                >
                  <span>{label}{today ? " (hoje)" : ""}</span>
                  <span className="text-muted-foreground">
                    {cfg?.enabled ? `${cfg.open} – ${cfg.close}` : "Fechado"}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </SheetContent>
  );
}
