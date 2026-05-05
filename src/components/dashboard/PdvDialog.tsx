import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { brl, formatPhone, unmaskPhone } from "@/lib/format";
import { Plus, Minus, Search, Trash2, ShoppingCart, X, UserPlus, UserCheck, Tag, Percent, Printer, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { fetchCategories, fetchProducts, menuKeys } from "./MenuManager";
import { ordersKey } from "./OrdersPanel";
import { buildTicketHtml, TicketOptionCatalog, TicketRestaurant } from "@/lib/ticket";

type PaymentMethod = "cash" | "pix" | "card_on_delivery";

interface OptionItem { id: string; name: string; extra_price: number; }
interface OptGroup { id: string; name: string; min_select: number; max_select: number; items: OptionItem[]; }

interface CartLine {
  key: string; // unique cart line id
  product_id: string;
  name: string;
  unit_price: number; // base + extras
  base_price: number;
  quantity: number;
  options?: { groupName: string; itemName: string; extraPrice: number }[];
  notes?: string;
}

const STORAGE_KEY = (rid: string) => `pdv_draft_v2_${rid}`;

async function fetchPdvOptions(restaurantId: string): Promise<Record<string, OptGroup[]>> {
  const [linksRes, groupsRes, itemsRes] = await Promise.all([
    supabase.from("product_option_groups").select("product_id, group_id, sort_order"),
    supabase.from("option_groups").select("id, name, min_select, max_select, sort_order, is_active, restaurant_id").eq("restaurant_id", restaurantId).eq("is_active", true),
    supabase.from("option_items").select("id, group_id, name, extra_price, sort_order, is_active, option_groups!inner(restaurant_id)").eq("option_groups.restaurant_id", restaurantId).eq("is_active", true).order("sort_order"),
  ]);
  const groupById = new Map<string, any>(((groupsRes.data ?? []) as any[]).map((g) => [g.id, g]));
  const itemsByGroup = new Map<string, OptionItem[]>();
  ((itemsRes.data ?? []) as any[]).forEach((it) => {
    const arr = itemsByGroup.get(it.group_id) ?? [];
    arr.push({ id: it.id, name: it.name, extra_price: Number(it.extra_price) });
    itemsByGroup.set(it.group_id, arr);
  });
  const idx: Record<string, OptGroup[]> = {};
  const linkOrder: Record<string, Record<string, number>> = {};
  ((linksRes.data ?? []) as any[]).forEach((l) => {
    const g = groupById.get(l.group_id);
    if (!g) return;
    const og: OptGroup = {
      id: g.id, name: g.name, min_select: g.min_select, max_select: g.max_select,
      items: itemsByGroup.get(g.id) ?? [],
    };
    (idx[l.product_id] ??= []).push(og);
    (linkOrder[l.product_id] ??= {})[g.id] = l.sort_order ?? 0;
  });
  Object.keys(idx).forEach((pid) => idx[pid].sort((a, b) => (linkOrder[pid]?.[a.id] ?? 0) - (linkOrder[pid]?.[b.id] ?? 0)));
  return idx;
}

export function PdvDialog({
  open, onOpenChange, restaurantId,
}: { open: boolean; onOpenChange: (v: boolean) => void; restaurantId: string }) {
  const qc = useQueryClient();

  const { data: categories = [] } = useQuery({
    queryKey: menuKeys.categories(restaurantId),
    queryFn: () => fetchCategories(restaurantId),
    enabled: open, staleTime: 30_000,
  });
  const { data: products = [] } = useQuery({
    queryKey: menuKeys.products(restaurantId),
    queryFn: () => fetchProducts(restaurantId),
    enabled: open, staleTime: 30_000,
  });
  const { data: groupsByProduct = {} } = useQuery({
    queryKey: ["pdv-options", restaurantId],
    queryFn: () => fetchPdvOptions(restaurantId),
    enabled: open, staleTime: 30_000,
  });
  const { data: restaurantInfo } = useQuery({
    queryKey: ["restaurant-print-info", restaurantId],
    queryFn: async () => {
      const { data } = await supabase.from("restaurants")
        .select("name,logo_url,address_street,address_number,address_neighborhood,address_city,address_state,address_cep,print_settings,kitchen_print_settings")
        .eq("id", restaurantId).maybeSingle();
      return data;
    },
    enabled: open, staleTime: 60_000,
  });
  const { data: loyaltySettings } = useQuery({
    queryKey: ["loyalty-settings", restaurantId],
    queryFn: async () => {
      const { data } = await (supabase as any).from("loyalty_settings").select("enabled, points_per_real").eq("restaurant_id", restaurantId).maybeSingle();
      return { enabled: !!data?.enabled, points_per_real: Number(data?.points_per_real ?? 1) };
    },
    enabled: open, staleTime: 60_000,
  });

  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);

  // Customer
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [loyaltyOptIn, setLoyaltyOptIn] = useState(false);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [tmpName, setTmpName] = useState("");
  const [tmpPhone, setTmpPhone] = useState("");
  const [tmpLoyalty, setTmpLoyalty] = useState(false);

  // Discount / service fee
  const [discountType, setDiscountType] = useState<"value" | "percent">("value");
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [serviceFeeType, setServiceFeeType] = useState<"value" | "percent">("percent");
  const [serviceFeeValue, setServiceFeeValue] = useState<number>(0);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [feeOpen, setFeeOpen] = useState(false);
  const [tmpDiscType, setTmpDiscType] = useState<"value" | "percent">("value");
  const [tmpDiscInput, setTmpDiscInput] = useState("");
  const [tmpFeeType, setTmpFeeType] = useState<"value" | "percent">("percent");
  const [tmpFeeInput, setTmpFeeInput] = useState("10");

  const [payment, setPayment] = useState<PaymentMethod | null>(null);
  const [paymentShake, setPaymentShake] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const productsScrollRef = useRef<HTMLDivElement | null>(null);

  // Product → option picker
  const [pickProduct, setPickProduct] = useState<typeof products[number] | null>(null);
  const [pickSelected, setPickSelected] = useState<Record<string, string[]>>({});
  const [pickQty, setPickQty] = useState(1);
  const [pickNotes, setPickNotes] = useState("");

  // Restore draft
  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY(restaurantId));
      if (raw) {
        const d = JSON.parse(raw);
        setCart(d.cart ?? []);
        setCustomerName(d.customerName ?? "");
        setCustomerPhone(d.customerPhone ?? "");
        setLoyaltyOptIn(!!d.loyaltyOptIn);
        setDiscountType(d.discountType ?? "value");
        setDiscountValue(Number(d.discountValue) || 0);
        setServiceFeeType(d.serviceFeeType ?? "percent");
        setServiceFeeValue(Number(d.serviceFeeValue) || 0);
        setPayment(d.payment ?? null);
      }
    } catch { /* noop */ }
  }, [open, restaurantId]);

  useEffect(() => {
    if (!open) return;
    try { localStorage.setItem(STORAGE_KEY(restaurantId), JSON.stringify({
      cart, customerName, customerPhone, loyaltyOptIn, discountType, discountValue, serviceFeeType, serviceFeeValue, payment,
    })); } catch { /* noop */ }
  }, [open, restaurantId, cart, customerName, customerPhone, loyaltyOptIn, discountType, discountValue, serviceFeeType, serviceFeeValue, payment]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => p.is_active)
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true));
  }, [products, search]);

  // Group filtered products by category for unified scrolling list
  const groupedByCategory = useMemo(() => {
    const byCat = new Map<string, typeof products>();
    filteredProducts.forEach((p) => {
      const key = p.category_id ?? "__none__";
      const arr = byCat.get(key) ?? [];
      arr.push(p);
      byCat.set(key, arr);
    });
    const ordered = categories
      .filter((c) => c.is_active)
      .map((c) => ({ id: c.id, name: c.name, products: byCat.get(c.id) ?? [] }))
      .filter((g) => g.products.length > 0);
    const orphan = byCat.get("__none__") ?? [];
    if (orphan.length) ordered.push({ id: "__none__", name: "Sem categoria", products: orphan });
    return ordered;
  }, [filteredProducts, categories]);

  // Scroll spy: highlight category in sidebar based on scroll position
  useEffect(() => {
    if (!open || groupedByCategory.length === 0) return;
    const root = productsScrollRef.current?.querySelector<HTMLElement>("[data-radix-scroll-area-viewport]");
    if (!root) return;
    const sections = groupedByCategory
      .map((g) => document.getElementById(`pdv-cat-${g.id}`))
      .filter((el): el is HTMLElement => !!el);
    if (sections.length === 0) return;
    const onScroll = () => {
      const top = root.getBoundingClientRect().top;
      let current = sections[0].id.replace("pdv-cat-", "");
      for (const s of sections) {
        if (s.getBoundingClientRect().top - top <= 40) current = s.id.replace("pdv-cat-", "");
        else break;
      }
      setActiveCat((prev) => (prev === current ? prev : current));
    };
    onScroll();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, [open, groupedByCategory]);

  const startAdd = (p: typeof products[number]) => {
    const grs = groupsByProduct[p.id] ?? [];
    if (grs.length === 0) {
      // direct add
      addLine(p, [], 1, "");
      return;
    }
    setPickProduct(p);
    setPickSelected({});
    setPickQty(1);
    setPickNotes("");
  };

  const addLine = (
    p: typeof products[number],
    options: { groupName: string; itemName: string; extraPrice: number }[],
    qty: number,
    notes: string,
  ) => {
    const optKey = options.map((o) => `${o.groupName}:${o.itemName}`).sort().join("|");
    const key = `${p.id}__${optKey}__${notes}`;
    const extras = options.reduce((s, o) => s + o.extraPrice, 0);
    setCart((prev) => {
      const ix = prev.findIndex((l) => l.key === key);
      if (ix >= 0) {
        const next = [...prev];
        next[ix] = { ...next[ix], quantity: next[ix].quantity + qty };
        return next;
      }
      return [...prev, {
        key, product_id: p.id, name: p.name,
        base_price: Number(p.price), unit_price: Number(p.price) + extras,
        quantity: qty, options: options.length ? options : undefined,
        notes: notes || undefined,
      }];
    });
  };

  const updateQty = (k: string, qty: number) => {
    setCart((prev) => qty <= 0 ? prev.filter((l) => l.key !== k) : prev.map((l) => l.key === k ? { ...l, quantity: qty } : l));
  };

  const subtotal = cart.reduce((s, l) => s + l.unit_price * l.quantity, 0);
  const discountApplied = (() => {
    if (discountType === "percent") return Math.min(subtotal, subtotal * (discountValue / 100));
    return Math.min(subtotal, discountValue);
  })();
  const baseAfterDiscount = Math.max(0, subtotal - discountApplied);
  const serviceFeeApplied = serviceFeeType === "percent"
    ? baseAfterDiscount * (serviceFeeValue / 100)
    : serviceFeeValue;
  const total = baseAfterDiscount + serviceFeeApplied;

  const reset = () => {
    setCart([]); setCustomerName(""); setCustomerPhone(""); setLoyaltyOptIn(false);
    setDiscountValue(0); setServiceFeeValue(0); setServiceFeeType("percent"); setPayment(null);
    setSearch("");
    try { localStorage.removeItem(STORAGE_KEY(restaurantId)); } catch { /* noop */ }
  };

  const printTicket = (orderRow: any, items: any[]) => {
    const ticketOrder = {
      id: orderRow.id,
      order_number: orderRow.order_number,
      order_type: "pdv" as const,
      customer_name: orderRow.customer_name,
      customer_phone: orderRow.customer_phone,
      payment_method: orderRow.payment_method,
      subtotal: Number(orderRow.subtotal),
      delivery_fee: 0,
      total: Number(orderRow.total),
      created_at: orderRow.created_at ?? new Date().toISOString(),
    };
    const optionCatalog: TicketOptionCatalog = {};
    cart.forEach((l) => {
      if (!l.options?.length) return;
      optionCatalog[l.product_id] = [
        ...(optionCatalog[l.product_id] ?? []),
        ...l.options.map((o) => ({ groupName: o.groupName, itemName: o.itemName })),
      ];
    });
    const ticketItems = items.map((it: any, ix) => ({
      id: it.id ?? String(ix),
      product_id: it.product_id,
      product_name: it.product_name,
      unit_price: Number(it.unit_price),
      quantity: Number(it.quantity),
      notes: it.notes ?? null,
    }));
    const html = buildTicketHtml(ticketOrder, ticketItems, (restaurantInfo as unknown as TicketRestaurant) ?? null, optionCatalog, "customer");
    const w = window.open("", "_blank", "width=420,height=720");
    if (!w) return;
    w.document.open(); w.document.write(html); w.document.close();
  };

  const confirmOrder = async (alsoPrint: boolean) => {
    if (cart.length === 0) { toast.error("Adicione produtos ao pedido"); return; }
    if (!payment) {
      setPaymentShake(true);
      setTimeout(() => setPaymentShake(false), 600);
      toast.error("Selecione uma forma de pagamento");
      return;
    }
    setSubmitting(true);
    const phoneDigits = unmaskPhone(customerPhone);
    const trimmedName = customerName.trim() || "Cliente Balcão";
    const orderPayload: any = {
      restaurant_id: restaurantId,
      order_type: "pdv",
      status: "preparing",
      customer_name: trimmedName,
      customer_phone: phoneDigits || "0000000000",
      payment_method: payment,
      subtotal,
      discount: discountApplied,
      service_fee: serviceFeeApplied,
      delivery_fee: 0,
      total,
      loyalty_opt_in: loyaltyOptIn,
    };
    try {
      const { data: order, error } = await supabase
        .from("orders").insert(orderPayload)
        .select("id, order_number, customer_name, customer_phone, payment_method, subtotal, total, created_at, status, order_type")
        .single();
      if (error || !order) throw error || new Error("Falha ao criar pedido");

      const itemsPayload = cart.map((l) => ({
        order_id: order.id,
        product_id: l.product_id,
        product_name: l.name,
        unit_price: l.unit_price,
        quantity: l.quantity,
        notes: [
          ...(l.options?.map((o) => `+ ${o.itemName}`) ?? []),
          ...(l.notes ? [`Obs: ${l.notes}`] : []),
        ].join("\n") || null,
      }));

      // Optimistic cache update — UI shows the order instantly
      const optimisticItems = itemsPayload.map((it, ix) => ({
        ...it,
        id: `tmp-${order.id}-${ix}`,
        created_at: new Date().toISOString(),
      }));
      qc.setQueryData<any>(ordersKey(restaurantId), (prev: any) => {
        if (!prev) return prev;
        return {
          orders: [{ ...orderPayload, ...order }, ...prev.orders.filter((o: any) => o.id !== order.id)],
          items: { ...prev.items, [order.id]: optimisticItems },
        };
      });

      // Close immediately — feedback rápido
      toast.success(`Pedido #${order.order_number} finalizado`);
      if (alsoPrint) printTicket(order, itemsPayload);
      reset();
      onOpenChange(false);
      setSubmitting(false);

      // Background: persist items + loyalty + customer; sem bloquear o usuário
      (async () => {
        const { error: itErr } = await supabase.from("order_items").insert(itemsPayload);
        if (itErr) {
          toast.error("Erro ao salvar itens do pedido");
          qc.invalidateQueries({ queryKey: ordersKey(restaurantId) });
          return;
        }

        if (loyaltyOptIn && loyaltySettings?.enabled && phoneDigits.length >= 10) {
          try {
            const sb = supabase as any;
            const phoneFmt = formatPhone(customerPhone);
            const { data: existing } = await sb.from("loyalty_members").select("id")
              .eq("restaurant_id", restaurantId).eq("phone", phoneFmt).maybeSingle();
            let memberId = existing?.id as string | undefined;
            if (!memberId) {
              const { data: created } = await sb.from("loyalty_members")
                .insert({ restaurant_id: restaurantId, name: trimmedName, phone: phoneFmt, points: 0 })
                .select("id").single();
              memberId = created?.id;
            }
            const earned = Math.floor(subtotal * Number(loyaltySettings.points_per_real || 0));
            if (memberId && earned > 0) {
              await sb.from("loyalty_transactions").insert({
                restaurant_id: restaurantId, member_id: memberId, order_id: order.id,
                points: earned, type: "earn", status: "pending",
              });
            }
          } catch { /* noop */ }
        }

        if (phoneDigits.length >= 10) {
          try {
            await supabase.rpc("upsert_customer_on_order" as any, {
              _restaurant_id: restaurantId,
              _name: trimmedName,
              _phone: formatPhone(customerPhone),
            });
          } catch { /* noop */ }
        }
      })();
    } catch (e: any) {
      toast.error(e.message || "Erro ao finalizar venda");
      setSubmitting(false);
    }
  };

  const customerIdentified = !!(customerName.trim() || customerPhone.trim());

  // Picker helpers
  const togglePick = (g: OptGroup, itemId: string) => {
    setPickSelected((prev) => {
      const cur = prev[g.id] ?? [];
      if (g.max_select === 1) return { ...prev, [g.id]: cur[0] === itemId ? [] : [itemId] };
      if (cur.includes(itemId)) return { ...prev, [g.id]: cur.filter((x) => x !== itemId) };
      if (cur.length >= g.max_select) return prev;
      return { ...prev, [g.id]: [...cur, itemId] };
    });
  };
  const confirmPick = () => {
    if (!pickProduct) return;
    const grs = groupsByProduct[pickProduct.id] ?? [];
    for (const g of grs) {
      const cnt = (pickSelected[g.id] ?? []).length;
      if (cnt < g.min_select) { toast.error(`Selecione ao menos ${g.min_select} em "${g.name}"`); return; }
    }
    const opts: { groupName: string; itemName: string; extraPrice: number }[] = [];
    grs.forEach((g) => {
      (pickSelected[g.id] ?? []).forEach((iid) => {
        const it = g.items.find((x) => x.id === iid);
        if (it) opts.push({ groupName: g.name, itemName: it.name, extraPrice: it.extra_price });
      });
    });
    addLine(pickProduct, opts, pickQty, pickNotes.trim());
    setPickProduct(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-[1280px] w-[97vw] h-[92vh] p-0 flex flex-col gap-0">
          <DialogHeader className="px-4 py-3 border-b shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="w-5 h-5" /> Novo pedido — PDV (Balcão)
            </DialogTitle>
          </DialogHeader>

          {/* Top bar: customer + discount + fee */}
          <div className="px-4 py-2 border-b flex flex-wrap gap-2 items-center shrink-0 bg-muted/30">
            <Button
              variant={customerIdentified ? "secondary" : "default"}
              size="sm"
              onClick={() => {
                setTmpName(customerName); setTmpPhone(customerPhone); setTmpLoyalty(loyaltyOptIn);
                setCustomerOpen(true);
              }}
              className="gap-2"
            >
              {customerIdentified ? <UserCheck className="w-4 h-4" /> : <UserPlus className="w-4 h-4" />}
              {customerIdentified
                ? `${customerName || "Cliente"}${customerPhone ? " • " + formatPhone(customerPhone) : ""}`
                : "Identificar cliente"}
              {loyaltyOptIn && <Badge variant="outline" className="ml-1">Fidelidade</Badge>}
            </Button>
            {customerIdentified && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setCustomerName(""); setCustomerPhone(""); setLoyaltyOptIn(false); }}>
                <X className="w-4 h-4" />
              </Button>
            )}
            <div className="flex-1" />
            <Button variant={discountValue > 0 ? "secondary" : "outline"} size="sm" className="gap-2"
              onClick={() => { setTmpDiscType(discountType); setTmpDiscInput(discountValue ? String(discountValue) : ""); setDiscountOpen(true); }}>
              <Percent className="w-4 h-4" />
              Desconto{discountValue > 0 ? `: ${discountType === "percent" ? `${discountValue}%` : brl(discountValue)}` : ""}
            </Button>
            <Button variant={serviceFeeValue > 0 ? "secondary" : "outline"} size="sm" className="gap-2"
              onClick={() => { setTmpFeeType(serviceFeeType); setTmpFeeInput(serviceFeeValue ? String(serviceFeeValue) : "10"); setFeeOpen(true); }}>
              <Tag className="w-4 h-4" />
              Taxa de serviço{serviceFeeValue > 0 ? `: ${serviceFeeType === "percent" ? `${serviceFeeValue}%` : brl(serviceFeeValue)}` : ""}
            </Button>
          </div>

          <div className="flex-1 grid grid-cols-[200px_1fr_380px] min-h-0">
            {/* Left: categories sidebar (anchors) */}
            <div className="border-r bg-muted/20 flex flex-col min-h-0">
              <div className="p-2 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">Categorias</div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {groupedByCategory.length === 0 ? (
                    <div className="text-xs text-muted-foreground px-2 py-3">Nenhuma categoria</div>
                  ) : groupedByCategory.map((g) => {
                    const isActive = activeCat ? activeCat === g.id : groupedByCategory[0]?.id === g.id;
                    return (
                      <button
                        key={g.id}
                        type="button"
                        onClick={() => {
                          setActiveCat(g.id);
                          const el = document.getElementById(`pdv-cat-${g.id}`);
                          el?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className={`w-full text-left px-3 py-2 rounded-md text-sm transition border-l-2 ${
                          isActive
                            ? "bg-primary/10 text-primary border-primary font-semibold"
                            : "border-transparent hover:bg-muted"
                        }`}
                      >
                        {g.name}
                        <span className="ml-2 text-[10px] text-muted-foreground">({g.products.length})</span>
                      </button>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            {/* Middle: products — single scroll grouped by category */}
            <div className="flex flex-col min-h-0 border-r">
              <div className="p-3 border-b shrink-0">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input autoFocus placeholder="Buscar produto por nome..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
                </div>
              </div>
              <ScrollArea className="flex-1" ref={productsScrollRef as any}>
                <div className="p-3 space-y-6">
                  {groupedByCategory.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-12">Nenhum produto encontrado.</div>
                  ) : groupedByCategory.map((g) => (
                    <section key={g.id} id={`pdv-cat-${g.id}`} className="scroll-mt-2">
                      <h3 className="text-sm font-bold uppercase tracking-wide text-foreground/80 mb-2 sticky top-0 bg-background/95 backdrop-blur py-1 z-10 border-b">
                        {g.name}
                      </h3>
                      <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {g.products.map((p) => {
                          const hasOpts = (groupsByProduct[p.id]?.length ?? 0) > 0;
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => startAdd(p)}
                              className="text-left rounded-lg border bg-card hover:border-primary hover:shadow-md transition overflow-hidden flex flex-col"
                            >
                              <div className="aspect-square bg-muted flex items-center justify-center overflow-hidden">
                                {p.image_url ? (
                                  <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" loading="lazy" />
                                ) : (
                                  <ImageIcon className="w-10 h-10 text-muted-foreground/40" />
                                )}
                              </div>
                              <div className="p-2 flex flex-col gap-1 flex-1">
                                <div className="font-medium text-sm line-clamp-2">{p.name}</div>
                                <div className="flex items-center justify-between mt-auto">
                                  <div className="text-primary font-bold text-sm">{brl(Number(p.price))}</div>
                                  {hasOpts && <Badge variant="outline" className="text-[10px]">opções</Badge>}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Right: cart */}
            <div className="flex flex-col min-h-0 bg-muted/30">
              <div className="p-3 border-b shrink-0 text-sm font-semibold flex items-center justify-between">
                <span>Itens do pedido</span>
                <Badge variant="secondary">{cart.reduce((s, l) => s + l.quantity, 0)}</Badge>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-3 space-y-2">
                  {cart.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center py-8">Clique nos produtos para adicionar.</div>
                  ) : cart.map((l) => (
                    <div key={l.key} className="bg-background rounded-md border p-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{l.name}</div>
                          <div className="text-xs text-muted-foreground">{brl(l.unit_price)} un.</div>
                          {l.options?.map((o, i) => (
                            <div key={i} className="text-[11px] text-muted-foreground">+ {o.itemName}{o.extraPrice ? ` (${brl(o.extraPrice)})` : ""}</div>
                          ))}
                        </div>
                        <button type="button" onClick={() => updateQty(l.key, 0)} className="text-muted-foreground hover:text-destructive" aria-label="Remover">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-1">
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(l.key, l.quantity - 1)}><Minus className="w-3 h-3" /></Button>
                          <span className="w-8 text-center text-sm tabular-nums">{l.quantity}</span>
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(l.key, l.quantity + 1)}><Plus className="w-3 h-3" /></Button>
                        </div>
                        <div className="font-semibold text-sm">{brl(l.unit_price * l.quantity)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="border-t p-3 space-y-3 shrink-0 bg-background">
                <div className={paymentShake ? "animate-shake" : ""}>
                  <Label className="text-xs">Pagamento</Label>
                  <div className={`grid grid-cols-3 gap-2 mt-1 rounded-md ${paymentShake ? "ring-2 ring-destructive" : ""}`}>
                    {([
                      { v: "cash", label: "Dinheiro" },
                      { v: "pix", label: "Pix" },
                      { v: "card_on_delivery", label: "Cartão" },
                    ] as { v: PaymentMethod; label: string }[]).map((opt) => (
                      <Button
                        key={opt.v}
                        type="button"
                        size="sm"
                        variant={payment === opt.v ? "default" : "outline"}
                        onClick={() => setPayment(opt.v)}
                      >
                        {opt.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <Separator />
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{brl(subtotal)}</span></div>
                  {discountApplied > 0 && (<div className="flex justify-between text-destructive"><span>Desconto</span><span>- {brl(discountApplied)}</span></div>)}
                  {serviceFeeApplied > 0 && (<div className="flex justify-between"><span className="text-muted-foreground">Taxa de serviço{serviceFeeType === "percent" ? ` (${serviceFeeValue}%)` : ""}</span><span>+ {brl(serviceFeeApplied)}</span></div>)}
                  <div className="flex justify-between text-lg font-bold pt-1 border-t"><span>Total</span><span>{brl(total)}</span></div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button variant="outline" onClick={reset} className="gap-1"><X className="w-4 h-4" /> Limpar</Button>
                  <Button variant="secondary" onClick={() => confirmOrder(true)} disabled={submitting || cart.length === 0} className="gap-1">
                    <Printer className="w-4 h-4" /> Confirmar e imprimir
                  </Button>
                </div>
                <Button className="w-full" onClick={() => confirmOrder(false)} disabled={submitting || cart.length === 0}>
                  {submitting ? "Finalizando..." : "Confirmar venda"}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Customer dialog */}
      <Dialog open={customerOpen} onOpenChange={setCustomerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Identificar cliente</DialogTitle>
            <DialogDescription>Preencha os dados do cliente para esta venda.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Nome</Label>
              <Input value={tmpName} onChange={(e) => setTmpName(e.target.value)} placeholder="Nome do cliente" autoFocus />
            </div>
            <div>
              <Label className="text-xs">Telefone</Label>
              <Input value={formatPhone(tmpPhone)} onChange={(e) => setTmpPhone(e.target.value)} placeholder="(11) 99999-9999" inputMode="numeric" />
            </div>
            {loyaltySettings?.enabled && (
              <div className="flex items-center justify-between rounded-md border p-3">
                <div>
                  <div className="text-sm font-medium">Cadastrar no programa de fidelidade</div>
                  <div className="text-xs text-muted-foreground">Pontuará {Number(loyaltySettings.points_per_real)} ponto(s) por real desta venda.</div>
                </div>
                <Switch checked={tmpLoyalty} onCheckedChange={setTmpLoyalty} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustomerOpen(false)}>Cancelar</Button>
            <Button onClick={() => {
              if (tmpLoyalty && unmaskPhone(tmpPhone).length < 10) { toast.error("Informe um telefone válido para fidelidade"); return; }
              setCustomerName(tmpName);
              setCustomerPhone(tmpPhone);
              setLoyaltyOptIn(tmpLoyalty);
              setCustomerOpen(false);
              toast.success("Cliente identificado");
            }}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Discount dialog */}
      <Dialog open={discountOpen} onOpenChange={setDiscountOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Aplicar desconto</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button type="button" variant={tmpDiscType === "value" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setTmpDiscType("value")}>R$</Button>
              <Button type="button" variant={tmpDiscType === "percent" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setTmpDiscType("percent")}>%</Button>
            </div>
            <Input value={tmpDiscInput} onChange={(e) => setTmpDiscInput(e.target.value)} placeholder="0" inputMode="decimal" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDiscountValue(0); setDiscountOpen(false); }}>Remover</Button>
            <Button onClick={() => {
              const n = Number(String(tmpDiscInput).replace(",", ".")) || 0;
              setDiscountType(tmpDiscType); setDiscountValue(n); setDiscountOpen(false);
            }}>Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Service fee dialog */}
      <Dialog open={feeOpen} onOpenChange={setFeeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Taxa de serviço</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button type="button" variant={tmpFeeType === "percent" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setTmpFeeType("percent")}>%</Button>
              <Button type="button" variant={tmpFeeType === "value" ? "default" : "outline"} size="sm" className="flex-1" onClick={() => setTmpFeeType("value")}>R$</Button>
            </div>
            <Input value={tmpFeeInput} onChange={(e) => setTmpFeeInput(e.target.value)} placeholder={tmpFeeType === "percent" ? "10" : "0,00"} inputMode="decimal" autoFocus />
            {tmpFeeType === "percent" && (
              <p className="text-xs text-muted-foreground">Sugerido: 10% sobre o subtotal (já preenchido). Clique em Aplicar para confirmar.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setServiceFeeValue(0); setFeeOpen(false); }}>Remover</Button>
            <Button onClick={() => {
              const n = Number(String(tmpFeeInput).replace(",", ".")) || 0;
              setServiceFeeType(tmpFeeType); setServiceFeeValue(n); setFeeOpen(false);
            }}>Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Product option picker */}
      <Dialog open={!!pickProduct} onOpenChange={(o) => !o && setPickProduct(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{pickProduct?.name}</DialogTitle>
            <DialogDescription>Selecione as opções para adicionar ao pedido.</DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="space-y-4">
              {pickProduct && (groupsByProduct[pickProduct.id] ?? []).map((g) => {
                const sel = pickSelected[g.id] ?? [];
                const rule = g.min_select === 0 && g.max_select === 1 ? "Opcional"
                  : g.min_select === g.max_select ? `Escolha ${g.min_select}`
                  : `Mín ${g.min_select} • Máx ${g.max_select}`;
                return (
                  <div key={g.id} className="border rounded-md">
                    <div className="px-3 py-2 bg-muted/50 flex items-center justify-between">
                      <div className="font-medium text-sm">{g.name}</div>
                      <Badge variant={g.min_select > 0 ? "default" : "outline"} className="text-[10px]">{rule}</Badge>
                    </div>
                    <div className="p-2 space-y-1">
                      {g.items.map((it) => {
                        const checked = sel.includes(it.id);
                        return (
                          <label key={it.id} className={`flex items-center gap-2 px-2 py-2 rounded cursor-pointer hover:bg-muted ${checked ? "bg-muted" : ""}`}>
                            <input
                              type={g.max_select === 1 ? "radio" : "checkbox"}
                              name={`grp-${g.id}`}
                              checked={checked}
                              onChange={() => togglePick(g, it.id)}
                            />
                            <span className="flex-1 text-sm">{it.name}</span>
                            {it.extra_price > 0 && <span className="text-xs text-primary font-semibold">+ {brl(it.extra_price)}</span>}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div>
                <Label className="text-xs">Observações</Label>
                <Input value={pickNotes} onChange={(e) => setPickNotes(e.target.value)} placeholder="Ex: sem cebola" />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter className="flex-row items-center sm:justify-between gap-2">
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setPickQty((q) => Math.max(1, q - 1))}><Minus className="w-3 h-3" /></Button>
              <span className="w-8 text-center text-sm tabular-nums">{pickQty}</span>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setPickQty((q) => q + 1)}><Plus className="w-3 h-3" /></Button>
            </div>
            <Button onClick={confirmPick}>Adicionar ao pedido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
