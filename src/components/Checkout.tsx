import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/hooks/useCart";
import { setActiveOrder } from "@/components/ActiveOrderBanner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { brl, formatPhone, unmaskPhone } from "@/lib/format";
import { toast } from "sonner";
import { DeliveryZone, GeoPoint, findDeliveryFee, geocodeAddress, haversineKm } from "@/lib/delivery";
import { Loader2, MapPin, Bike, Store } from "lucide-react";

const baseSchema = z.object({
  customer_name: z.string().trim().min(2, "Informe seu nome").max(80),
  customer_phone: z.string().trim().refine((v) => unmaskPhone(v).length >= 10, "Telefone inválido").transform((v) => formatPhone(v)),
  payment_method: z.enum(["cash", "pix", "card_on_delivery"]),
  change_for: z.string().optional(),
});

const deliverySchema = baseSchema.extend({
  address_cep: z.string().trim().regex(/^\d{5}-?\d{3}$/, "CEP inválido"),
  address_street: z.string().trim().min(2).max(120),
  address_number: z.string().trim().min(1).max(10),
  address_complement: z.string().trim().max(80).optional(),
  address_neighborhood: z.string().trim().min(2).max(80),
  address_city: z.string().trim().min(2).max(80),
  address_state: z.string().trim().length(2),
  address_notes: z.string().trim().max(200).optional(),
});

type RestaurantInfo = {
  id: string;
  latitude?: number | null;
  longitude?: number | null;
  delivery_zones?: DeliveryZone[] | null;
  address_cep?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
};

export function Checkout({ open, onOpenChange, restaurant }: { open: boolean; onOpenChange: (o: boolean) => void; restaurant: RestaurantInfo }) {
  const cart = useCart();
  const [busy, setBusy] = useState(false);
  const [orderType, setOrderType] = useState<"delivery" | "pickup">("delivery");
  const [cep, setCep] = useState("");
  const [phone, setPhone] = useState("");
  const [addr, setAddr] = useState({ street: "", number: "", neighborhood: "", city: "", state: "" });
  const [payment, setPayment] = useState<"cash" | "pix" | "card_on_delivery">("cash");

  const [delivery, setDelivery] = useState<{ fee: number; km: number; pt: GeoPoint } | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);

  const zones = (restaurant.delivery_zones ?? []) as DeliveryZone[];
  const hasZones = zones.length > 0;
  const restaurantHasCoords = !!(restaurant.latitude && restaurant.longitude);
  const isPickup = orderType === "pickup";

  // Recalcula a taxa quando endereço estiver completo (apenas delivery)
  useEffect(() => {
    setDelivery(null);
    setDeliveryError(null);
    if (isPickup) return;
    if (!hasZones || !restaurantHasCoords) return;
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length !== 8 || !addr.street || !addr.number || !addr.city || !addr.state) return;

    let cancelled = false;
    setCalculating(true);
    const t = setTimeout(async () => {
      const pt = await geocodeAddress({
        cep: cleanCep, street: addr.street, number: addr.number,
        neighborhood: addr.neighborhood, city: addr.city, state: addr.state,
      });
      if (cancelled) return;
      if (!pt) {
        setCalculating(false);
        setDeliveryError("Não foi possível localizar este endereço para calcular a entrega.");
        return;
      }
      const km = haversineKm({ lat: restaurant.latitude!, lng: restaurant.longitude! }, pt);
      const found = findDeliveryFee(km, zones);
      setCalculating(false);
      if (!found) {
        setDeliveryError(`Endereço fora da área de entrega (${km.toFixed(1)} km).`);
        return;
      }
      setDelivery({ fee: found.fee, km, pt });
    }, 500);
    return () => { cancelled = true; clearTimeout(t); setCalculating(false); };
  }, [cep, addr.street, addr.number, addr.neighborhood, addr.city, addr.state, hasZones, restaurantHasCoords, restaurant.latitude, restaurant.longitude, zones, isPickup]);

  const lookupCep = async (raw: string) => {
    const clean = raw.replace(/\D/g, "");
    if (clean.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (data.erro) return toast.error("CEP não encontrado");
      setAddr((p) => ({ ...p, street: data.logradouro || "", neighborhood: data.bairro || "", city: data.localidade || "", state: data.uf || "" }));
    } catch { toast.error("Falha ao buscar CEP"); }
  };

  const fee = isPickup ? 0 : (delivery?.fee ?? 0);
  const subtotal = cart.total;
  const total = subtotal + fee;

  const storeAddressLine = [
    restaurant.address_street && `${restaurant.address_street}${restaurant.address_number ? `, ${restaurant.address_number}` : ""}`,
    restaurant.address_complement,
    restaurant.address_neighborhood,
    restaurant.address_city && restaurant.address_state ? `${restaurant.address_city}/${restaurant.address_state}` : restaurant.address_city,
    restaurant.address_cep,
  ].filter(Boolean).join(" • ");

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = Object.fromEntries(fd);

    let parsedData: any;
    if (isPickup) {
      const parsed = baseSchema.safeParse(raw);
      if (!parsed.success) return toast.error(parsed.error.issues[0].message);
      parsedData = parsed.data;
    } else {
      const parsed = deliverySchema.safeParse(raw);
      if (!parsed.success) return toast.error(parsed.error.issues[0].message);
      parsedData = parsed.data;
    }

    if (cart.items.length === 0) return toast.error("Carrinho vazio");
    if (!isPickup && hasZones && !delivery) return toast.error(deliveryError || "Aguarde o cálculo da taxa de entrega.");

    setBusy(true);

    const payload: any = {
      restaurant_id: restaurant.id,
      order_type: orderType,
      customer_name: parsedData.customer_name,
      customer_phone: parsedData.customer_phone,
      payment_method: parsedData.payment_method,
      change_for: parsedData.payment_method === "cash" && parsedData.change_for ? Number(parsedData.change_for) : null,
      subtotal,
      delivery_fee: fee,
      total,
    };

    if (isPickup) {
      // Pedido de retirada — copia o endereço da loja para referência
      payload.address_cep = restaurant.address_cep ?? "";
      payload.address_street = restaurant.address_street ?? "Retirada na loja";
      payload.address_number = restaurant.address_number ?? "—";
      payload.address_complement = restaurant.address_complement ?? null;
      payload.address_neighborhood = restaurant.address_neighborhood ?? "—";
      payload.address_city = restaurant.address_city ?? "—";
      payload.address_state = restaurant.address_state ?? "—";
      payload.address_notes = "Retirada no local";
    } else {
      payload.address_cep = parsedData.address_cep;
      payload.address_street = parsedData.address_street;
      payload.address_number = parsedData.address_number;
      payload.address_complement = parsedData.address_complement || null;
      payload.address_neighborhood = parsedData.address_neighborhood;
      payload.address_city = parsedData.address_city;
      payload.address_state = parsedData.address_state;
      payload.address_notes = parsedData.address_notes || null;
      payload.delivery_distance_km = delivery?.km ?? null;
      payload.delivery_latitude = delivery?.pt.lat ?? null;
      payload.delivery_longitude = delivery?.pt.lng ?? null;
    }

    const { data: order, error } = await supabase.from("orders").insert(payload).select("id, public_token").single();

    if (error || !order) { setBusy(false); return toast.error(error?.message || "Erro"); }

    const items = cart.items.map((i) => {
      const optsLines = (i.options ?? []).map((o) => `+ ${o.itemName}${o.extraPrice > 0 ? ` (${brl(o.extraPrice)})` : ""}`);
      const fullNotes = [optsLines.join("\n"), i.notes].filter(Boolean).join("\n").trim() || null;
      const unit = i.price + (i.options?.reduce((s, o) => s + (Number(o.extraPrice) || 0), 0) ?? 0);
      return {
        order_id: order.id,
        product_id: i.productId,
        product_name: i.name,
        unit_price: unit,
        quantity: i.quantity,
        notes: fullNotes,
      };
    });
    const { error: ie } = await supabase.from("order_items").insert(items);
    if (ie) { setBusy(false); return toast.error(ie.message); }

    cart.clear();
    setBusy(false);
    onOpenChange(false);
    setActiveOrder(restaurant.id, order.public_token);
    toast.success("Pedido enviado! Acompanhe o status no topo da tela.");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Finalizar pedido</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {/* Tipo do pedido */}
          <div className="space-y-2">
            <Label className="text-sm font-semibold">Como você quer receber?</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOrderType("delivery")}
                className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-colors ${orderType === "delivery" ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
              >
                <Bike className="w-5 h-5" />
                <div className="text-left">
                  <div className="font-medium text-sm">Delivery</div>
                  <div className="text-xs text-muted-foreground">Entregar no meu endereço</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setOrderType("pickup")}
                className={`flex items-center gap-2 p-3 rounded-lg border-2 transition-colors ${orderType === "pickup" ? "border-primary bg-primary/5" : "border-border hover:bg-muted"}`}
              >
                <Store className="w-5 h-5" />
                <div className="text-left">
                  <div className="font-medium text-sm">Retirada</div>
                  <div className="text-xs text-muted-foreground">Vou buscar na loja</div>
                </div>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 col-span-2"><Label>Nome</Label><Input name="customer_name" required /></div>
            <div className="space-y-2 col-span-2"><Label>Telefone</Label><Input name="customer_phone" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(11) 99999-0000" inputMode="tel" required /></div>
          </div>

          {isPickup ? (
            <div className="border-t pt-3 space-y-2">
              <h3 className="font-semibold text-sm flex items-center gap-2"><Store className="w-4 h-4" />Endereço para retirada</h3>
              {storeAddressLine ? (
                <div className="text-sm bg-muted rounded-lg p-3">
                  <p>{storeAddressLine}</p>
                  <p className="text-xs text-muted-foreground mt-1">Apresente seu nome ou telefone ao retirar.</p>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Endereço da loja não cadastrado. Entre em contato com o estabelecimento.</p>
              )}
            </div>
          ) : (
            <div className="border-t pt-3 space-y-3">
              <h3 className="font-semibold text-sm">Endereço de entrega</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2 col-span-1">
                  <Label>CEP</Label>
                  <Input name="address_cep" value={cep} onChange={(e) => setCep(e.target.value)} onBlur={(e) => lookupCep(e.target.value)} placeholder="00000-000" required />
                </div>
                <div className="space-y-2 col-span-2"><Label>Rua</Label><Input name="address_street" value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} required /></div>
                <div className="space-y-2"><Label>Número</Label><Input name="address_number" value={addr.number} onChange={(e) => setAddr({ ...addr, number: e.target.value })} required /></div>
                <div className="space-y-2 col-span-2"><Label>Complemento</Label><Input name="address_complement" placeholder="Apto, bloco..." /></div>
                <div className="space-y-2 col-span-2"><Label>Bairro</Label><Input name="address_neighborhood" value={addr.neighborhood} onChange={(e) => setAddr({ ...addr, neighborhood: e.target.value })} required /></div>
                <div className="space-y-2 col-span-2"><Label>Cidade</Label><Input name="address_city" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} required /></div>
                <div className="space-y-2"><Label>UF</Label><Input name="address_state" maxLength={2} value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value.toUpperCase() })} required /></div>
              </div>
              <div className="space-y-2"><Label>Observação do endereço</Label><Textarea name="address_notes" rows={2} placeholder="Ponto de referência, instruções..." /></div>

              {hasZones && restaurantHasCoords && (
                <div className={`text-sm rounded-lg p-3 flex items-start gap-2 ${deliveryError ? "bg-destructive/10 text-destructive" : delivery ? "bg-success/10 text-success-foreground border border-success/30" : "bg-muted"}`}>
                  {calculating ? <Loader2 className="w-4 h-4 animate-spin mt-0.5" /> : <MapPin className="w-4 h-4 mt-0.5" />}
                  <div className="flex-1">
                    {calculating && <span>Calculando taxa de entrega...</span>}
                    {!calculating && delivery && <span>Distância: {delivery.km.toFixed(1)} km — taxa <strong>{brl(delivery.fee)}</strong></span>}
                    {!calculating && !delivery && deliveryError && <span>{deliveryError}</span>}
                    {!calculating && !delivery && !deliveryError && <span>Preencha o endereço para calcular a taxa de entrega.</span>}
                  </div>
                </div>
              )}
              {!hasZones && (
                <p className="text-xs text-muted-foreground">Sem taxa de entrega configurada pela loja.</p>
              )}
            </div>
          )}

          <div className="border-t pt-3 space-y-3">
            <h3 className="font-semibold text-sm">Pagamento</h3>
            <RadioGroup name="payment_method" value={payment} onValueChange={(v) => setPayment(v as any)} className="space-y-2">
              {[
                { v: "cash", l: "Dinheiro" },
                { v: "pix", l: "Pix" },
                { v: "card_on_delivery", l: isPickup ? "Cartão na retirada" : "Cartão na entrega" },
              ].map((o) => (
                <label key={o.v} className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted">
                  <RadioGroupItem value={o.v} />
                  <span>{o.l}</span>
                </label>
              ))}
            </RadioGroup>
            {payment === "cash" && (
              <div className="space-y-2"><Label>Troco para (opcional)</Label><Input name="change_for" type="number" step="0.01" placeholder="Ex: 50.00" /></div>
            )}
          </div>

          <div className="border-t pt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
            {!isPickup && (
              <div className="flex justify-between"><span>Entrega</span><span>{fee > 0 ? brl(fee) : (hasZones ? "—" : "Grátis")}</span></div>
            )}
            {isPickup && (
              <div className="flex justify-between text-muted-foreground"><span>Retirada na loja</span><span>Sem taxa</span></div>
            )}
            <div className="flex justify-between font-bold text-lg pt-1 border-t"><span>Total</span><span>{brl(total)}</span></div>
          </div>
          <Button type="submit" className="w-full" size="lg" disabled={busy || (!isPickup && (calculating || (hasZones && !delivery)))}>
            {busy ? "Enviando..." : "Confirmar pedido"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
