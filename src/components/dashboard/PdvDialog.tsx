import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { brl, formatPhone, unmaskPhone } from "@/lib/format";
import { Plus, Minus, Search, Trash2, ShoppingCart, X } from "lucide-react";
import { toast } from "sonner";
import { fetchCategories, fetchProducts, menuKeys } from "./MenuManager";
import { ordersKey } from "./OrdersPanel";

type PaymentMethod = "cash" | "pix" | "card_on_delivery";

interface CartLine {
  product_id: string;
  name: string;
  unit_price: number;
  quantity: number;
}

const STORAGE_KEY = (rid: string) => `pdv_draft_${rid}`;

export function PdvDialog({
  open, onOpenChange, restaurantId,
}: { open: boolean; onOpenChange: (v: boolean) => void; restaurantId: string }) {
  const qc = useQueryClient();

  const { data: categories = [] } = useQuery({
    queryKey: menuKeys.categories(restaurantId),
    queryFn: () => fetchCategories(restaurantId),
    enabled: open,
    staleTime: 30_000,
  });
  const { data: products = [] } = useQuery({
    queryKey: menuKeys.products(restaurantId),
    queryFn: () => fetchProducts(restaurantId),
    enabled: open,
    staleTime: 30_000,
  });

  const [activeCat, setActiveCat] = useState<string | "all">("all");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discountType, setDiscountType] = useState<"value" | "percent">("value");
  const [discountInput, setDiscountInput] = useState<string>("");
  const [serviceFeeInput, setServiceFeeInput] = useState<string>("");
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [submitting, setSubmitting] = useState(false);

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
        setDiscountType(d.discountType ?? "value");
        setDiscountInput(d.discountInput ?? "");
        setServiceFeeInput(d.serviceFeeInput ?? "");
        setPayment(d.payment ?? "cash");
      }
    } catch { /* noop */ }
  }, [open, restaurantId]);

  // Save draft
  useEffect(() => {
    if (!open) return;
    const d = { cart, customerName, customerPhone, discountType, discountInput, serviceFeeInput, payment };
    try { localStorage.setItem(STORAGE_KEY(restaurantId), JSON.stringify(d)); } catch { /* noop */ }
  }, [open, restaurantId, cart, customerName, customerPhone, discountType, discountInput, serviceFeeInput, payment]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => p.is_active)
      .filter((p) => (activeCat === "all" ? true : p.category_id === activeCat))
      .filter((p) => (q ? p.name.toLowerCase().includes(q) : true));
  }, [products, activeCat, search]);

  const addProduct = (p: typeof products[number]) => {
    setCart((prev) => {
      const ix = prev.findIndex((l) => l.product_id === p.id);
      if (ix >= 0) {
        const next = [...prev];
        next[ix] = { ...next[ix], quantity: next[ix].quantity + 1 };
        return next;
      }
      return [...prev, { product_id: p.id, name: p.name, unit_price: Number(p.price), quantity: 1 }];
    });
  };

  const updateQty = (pid: string, qty: number) => {
    setCart((prev) => qty <= 0 ? prev.filter((l) => l.product_id !== pid) : prev.map((l) => l.product_id === pid ? { ...l, quantity: qty } : l));
  };

  const subtotal = cart.reduce((s, l) => s + l.unit_price * l.quantity, 0);
  const discountValue = (() => {
    const n = Number(String(discountInput).replace(",", ".")) || 0;
    if (discountType === "percent") return Math.min(subtotal, subtotal * (n / 100));
    return Math.min(subtotal, n);
  })();
  const serviceFee = Number(String(serviceFeeInput).replace(",", ".")) || 0;
  const total = Math.max(0, subtotal - discountValue + serviceFee);

  const reset = () => {
    setCart([]); setCustomerName(""); setCustomerPhone("");
    setDiscountInput(""); setServiceFeeInput(""); setPayment("cash");
    setActiveCat("all"); setSearch("");
    try { localStorage.removeItem(STORAGE_KEY(restaurantId)); } catch { /* noop */ }
  };

  const confirmOrder = async () => {
    if (cart.length === 0) { toast.error("Adicione produtos ao pedido"); return; }
    setSubmitting(true);
    try {
      const phoneDigits = unmaskPhone(customerPhone);
      const { data: order, error } = await supabase
        .from("orders")
        .insert({
          restaurant_id: restaurantId,
          order_type: "pdv" as const,
          status: "delivered",
          customer_name: customerName.trim() || "Cliente Balcão",
          customer_phone: phoneDigits || "0000000000",
          payment_method: payment,
          subtotal,
          discount: discountValue,
          service_fee: serviceFee,
          delivery_fee: 0,
          total,
        })
        .select("id, order_number")
        .single();
      if (error || !order) throw error || new Error("Falha ao criar pedido");

      const items = cart.map((l) => ({
        order_id: order.id,
        product_id: l.product_id,
        product_name: l.name,
        unit_price: l.unit_price,
        quantity: l.quantity,
      }));
      const { error: itErr } = await supabase.from("order_items").insert(items);
      if (itErr) throw itErr;

      toast.success(`Pedido #${order.order_number} finalizado`);
      qc.invalidateQueries({ queryKey: ordersKey(restaurantId) });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao finalizar venda");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[1200px] w-[95vw] h-[90vh] p-0 flex flex-col gap-0">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="w-5 h-5" /> Novo pedido — PDV (Balcão)
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 grid md:grid-cols-[1fr_380px] min-h-0">
          {/* Products side */}
          <div className="flex flex-col min-h-0 border-r">
            <div className="p-3 border-b space-y-3 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Buscar produto por nome..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <ScrollArea className="w-full">
                <div className="flex gap-2 pb-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={activeCat === "all" ? "default" : "outline"}
                    onClick={() => setActiveCat("all")}
                  >
                    Todos
                  </Button>
                  {categories.filter((c) => c.is_active).map((c) => (
                    <Button
                      key={c.id}
                      type="button"
                      size="sm"
                      variant={activeCat === c.id ? "default" : "outline"}
                      onClick={() => setActiveCat(c.id)}
                      className="whitespace-nowrap"
                    >
                      {c.name}
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-3 grid gap-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                {filteredProducts.length === 0 ? (
                  <div className="col-span-full text-sm text-muted-foreground text-center py-12">
                    Nenhum produto encontrado.
                  </div>
                ) : filteredProducts.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => addProduct(p)}
                    className="text-left rounded-lg border bg-card hover:border-primary hover:shadow-sm transition p-3 flex flex-col gap-1"
                  >
                    <div className="font-medium text-sm line-clamp-2">{p.name}</div>
                    <div className="text-primary font-bold mt-auto">{brl(Number(p.price))}</div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Cart side */}
          <div className="flex flex-col min-h-0 bg-muted/30">
            <div className="p-3 border-b shrink-0 space-y-2">
              <div className="text-sm font-semibold flex items-center justify-between">
                <span>Itens do pedido</span>
                <Badge variant="secondary">{cart.reduce((s, l) => s + l.quantity, 0)}</Badge>
              </div>
            </div>

            <ScrollArea className="flex-1">
              <div className="p-3 space-y-2">
                {cart.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-8">
                    Clique nos produtos para adicionar.
                  </div>
                ) : cart.map((l) => (
                  <div key={l.product_id} className="bg-background rounded-md border p-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{l.name}</div>
                        <div className="text-xs text-muted-foreground">{brl(l.unit_price)} un.</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateQty(l.product_id, 0)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remover"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(l.product_id, l.quantity - 1)}>
                          <Minus className="w-3 h-3" />
                        </Button>
                        <span className="w-8 text-center text-sm tabular-nums">{l.quantity}</span>
                        <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(l.product_id, l.quantity + 1)}>
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      <div className="font-semibold text-sm">{brl(l.unit_price * l.quantity)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="border-t p-3 space-y-3 shrink-0 bg-background">
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Label className="text-xs">Cliente (opcional)</Label>
                  <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nome" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Telefone (opcional)</Label>
                  <Input
                    value={formatPhone(customerPhone)}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="(11) 99999-9999"
                    inputMode="numeric"
                  />
                </div>

                <div>
                  <Label className="text-xs">Desconto</Label>
                  <div className="flex gap-1">
                    <Input
                      value={discountInput}
                      onChange={(e) => setDiscountInput(e.target.value)}
                      placeholder="0"
                      inputMode="decimal"
                    />
                    <Select value={discountType} onValueChange={(v: "value" | "percent") => setDiscountType(v)}>
                      <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="value">R$</SelectItem>
                        <SelectItem value="percent">%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Taxa de serviço (R$)</Label>
                  <Input
                    value={serviceFeeInput}
                    onChange={(e) => setServiceFeeInput(e.target.value)}
                    placeholder="0"
                    inputMode="decimal"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Pagamento</Label>
                  <Select value={payment} onValueChange={(v: PaymentMethod) => setPayment(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Dinheiro</SelectItem>
                      <SelectItem value="pix">Pix</SelectItem>
                      <SelectItem value="card_on_delivery">Cartão</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{brl(subtotal)}</span></div>
                {discountValue > 0 && (
                  <div className="flex justify-between text-destructive"><span>Desconto</span><span>- {brl(discountValue)}</span></div>
                )}
                {serviceFee > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Taxa de serviço</span><span>+ {brl(serviceFee)}</span></div>
                )}
                <div className="flex justify-between text-lg font-bold pt-1 border-t">
                  <span>Total</span><span>{brl(total)}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={reset} className="gap-1">
                  <X className="w-4 h-4" /> Limpar
                </Button>
                <Button className="flex-1" onClick={confirmOrder} disabled={submitting || cart.length === 0}>
                  {submitting ? "Finalizando..." : "Confirmar venda"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
