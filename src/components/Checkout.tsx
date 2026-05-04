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
import { Loader2, MapPin, Bike, Store, ArrowLeft, ArrowRight, Check } from "lucide-react";

// ---------- Helpers de CPF ----------
const onlyDigits = (v: string) => v.replace(/\D/g, "");
const formatCPF = (v: string) => {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
};
const isValidCPF = (raw: string) => {
  const cpf = onlyDigits(raw);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (slice: number) => {
    let sum = 0;
    for (let i = 0; i < slice; i++) sum += parseInt(cpf[i]) * (slice + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === parseInt(cpf[9]) && calc(10) === parseInt(cpf[10]);
};

type RestaurantInfo = {
  id: string;
  latitude?: number | null;
  longitude?: number | null;
  delivery_zones?: DeliveryZone[] | null;
  delivery_fee_mode?: "fixed" | "radius" | null;
  delivery_fixed_fee?: number | null;
  address_cep?: string | null;
  address_street?: string | null;
  address_number?: string | null;
  address_complement?: string | null;
  address_neighborhood?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  service_delivery?: boolean | null;
  service_pickup?: boolean | null;
};

type Step = 1 | 2 | 3;

export function Checkout({ open, onOpenChange, restaurant }: { open: boolean; onOpenChange: (o: boolean) => void; restaurant: RestaurantInfo }) {
  const cart = useCart();
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<Step>(1);
  const [orderType, setOrderType] = useState<"delivery" | "pickup">("delivery");

  // Etapa 1 — cliente
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  // Etapa 2 — endereço
  const [cep, setCep] = useState("");
  const [addr, setAddr] = useState({ street: "", number: "", complement: "", neighborhood: "", city: "", state: "", notes: "" });

  // Etapa 3 — pagamento
  const [payment, setPayment] = useState<"cash" | "pix" | "card_on_delivery">("cash");
  const [changeFor, setChangeFor] = useState("");

  // Programa de fidelidade
  const [loyaltyEnabled, setLoyaltyEnabled] = useState(false);
  const [loyaltyPointsPerReal, setLoyaltyPointsPerReal] = useState(1);
  const [loyaltyOptIn, setLoyaltyOptIn] = useState(false);

  useEffect(() => {
    if (!restaurant?.id) return;
    (async () => {
      const { data } = await (supabase as any)
        .from("loyalty_settings")
        .select("enabled, points_per_real")
        .eq("restaurant_id", restaurant.id)
        .maybeSingle();
      setLoyaltyEnabled(!!data?.enabled);
      setLoyaltyPointsPerReal(Number(data?.points_per_real ?? 1));
    })();
  }, [restaurant?.id]);

  // Cupom
  const [couponInput, setCouponInput] = useState("");
  const [coupon, setCoupon] = useState<any | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [validatingCoupon, setValidatingCoupon] = useState(false);

  const [delivery, setDelivery] = useState<{ fee: number; km: number; pt: GeoPoint } | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);

  const zones = (restaurant.delivery_zones ?? []) as DeliveryZone[];
  const feeMode = (restaurant.delivery_fee_mode ?? "radius") as "fixed" | "radius";
  const fixedFee = Number(restaurant.delivery_fixed_fee ?? 0);
  const hasZones = zones.length > 0;
  const restaurantHasCoords = !!(restaurant.latitude && restaurant.longitude);
  const deliveryEnabled = restaurant.service_delivery !== false;
  const pickupEnabled = restaurant.service_pickup === true;
  const isPickup = orderType === "pickup";

  // Garante um tipo válido conforme as opções disponíveis
  useEffect(() => {
    if (orderType === "delivery" && !deliveryEnabled && pickupEnabled) setOrderType("pickup");
    if (orderType === "pickup" && !pickupEnabled && deliveryEnabled) setOrderType("delivery");
  }, [deliveryEnabled, pickupEnabled, orderType]);

  // Reset ao reabrir
  useEffect(() => {
    if (open) {
      setStep(1);
      // Cupom NUNCA deve vir aplicado por cache — sempre limpa ao abrir
      setCoupon(null);
      setCouponInput("");
      setCouponError(null);
      // ao abrir, escolhe a opção disponível por padrão
      if (!deliveryEnabled && pickupEnabled) setOrderType("pickup");
      else if (deliveryEnabled) setOrderType("delivery");
    }
  }, [open, deliveryEnabled, pickupEnabled]);

  // Se for pickup, não mostra etapa de endereço
  const totalSteps = isPickup ? 2 : 3;
  const stepLabel = isPickup
    ? (step === 1 ? "Seus dados" : "Pagamento")
    : (step === 1 ? "Seus dados" : step === 2 ? "Endereço" : "Pagamento");

  // Recalcula a taxa quando endereço estiver completo (apenas delivery)
  useEffect(() => {
    setDelivery(null);
    setDeliveryError(null);
    if (isPickup) return;

    // Modo valor fixo: já mostra o valor sem precisar do endereço
    if (feeMode === "fixed") {
      setDelivery({ fee: fixedFee, km: 0, pt: { lat: 0, lng: 0 } });
      return;
    }

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
  }, [cep, addr.street, addr.number, addr.neighborhood, addr.city, addr.state, hasZones, restaurantHasCoords, restaurant.latitude, restaurant.longitude, zones, isPickup, feeMode, fixedFee]);

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

  // Calcula desconto aplicado
  const discount = (() => {
    if (!coupon) return 0;
    let base = subtotal;
    if (coupon.apply_to === "items") {
      const ids: string[] = coupon.product_ids ?? [];
      base = cart.items
        .filter((i) => ids.includes(i.productId))
        .reduce((s, i) => s + (i.price + (i.options?.reduce((a, o) => a + (Number(o.extraPrice) || 0), 0) ?? 0)) * i.quantity, 0);
    }
    const v = coupon.discount_type === "percent"
      ? base * (Number(coupon.discount_value) / 100)
      : Number(coupon.discount_value);
    return Math.min(Math.max(0, v), base);
  })();

  const total = Math.max(0, subtotal + fee - discount);

  const applyCoupon = async () => {
    setCouponError(null);
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setValidatingCoupon(true);
    try {
      const { data } = await supabase
        .from("coupons" as any)
        .select("*")
        .eq("restaurant_id", restaurant.id)
        .eq("code", code)
        .eq("is_active", true)
        .maybeSingle();
      const c: any = data;
      if (!c) { setCoupon(null); setCouponError("Cupom inválido ou inativo"); return; }
      const now = new Date();
      if (c.starts_at && new Date(c.starts_at) > now) { setCoupon(null); setCouponError("Cupom ainda não está disponível"); return; }
      if (c.ends_at && new Date(c.ends_at) < now) { setCoupon(null); setCouponError("Cupom expirado"); return; }
      if (isPickup && !c.service_pickup) { setCoupon(null); setCouponError("Cupom não válido para retirada"); return; }
      if (!isPickup && !c.service_delivery) { setCoupon(null); setCouponError("Cupom não válido para delivery"); return; }
      if (Number(c.min_order_value) > 0 && subtotal < Number(c.min_order_value)) {
        setCoupon(null); setCouponError(`Pedido mínimo de ${brl(Number(c.min_order_value))} para usar este cupom`); return;
      }
      if (c.usage_limit_total != null && Number(c.uses_count ?? 0) >= Number(c.usage_limit_total)) {
        setCoupon(null); setCouponError("Cupom esgotado"); return;
      }
      if (c.apply_to === "items") {
        const ids: string[] = c.product_ids ?? [];
        const hasItem = cart.items.some((i) => ids.includes(i.productId));
        if (!hasItem) { setCoupon(null); setCouponError("Adicione um produto elegível para usar este cupom"); return; }
      }
      // Validações por cliente (telefone)
      const phoneRaw = unmaskPhone(phone);
      if (phoneRaw.length < 10) {
        setCoupon(null);
        setCouponError("Informe seu telefone na etapa 1 antes de aplicar o cupom");
        return;
      }
      const phoneFmt = formatPhone(phone);

      // Lista de variações do telefone para busca robusta (formatos diferentes podem ter sido salvos)
      const phoneDigits = unmaskPhone(phone);
      const phoneVariants = Array.from(new Set([phoneFmt, phoneDigits].filter(Boolean)));

      // Verifica se já é cliente (apenas novos clientes)
      // Considera "cliente antigo" se já existe na aba Contatos OU já fez algum pedido na loja
      if (c.customer_type === "new") {
        const [{ data: existingCustomers }, { count: prevOrdersCount }] = await Promise.all([
          supabase
            .from("customers" as any)
            .select("id")
            .eq("restaurant_id", restaurant.id)
            .in("phone", phoneVariants)
            .limit(1),
          supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .eq("restaurant_id", restaurant.id)
            .in("customer_phone", phoneVariants),
        ]);
        const isExistingCustomer =
          (Array.isArray(existingCustomers) && existingCustomers.length > 0) ||
          (prevOrdersCount ?? 0) > 0;
        if (isExistingCustomer) {
          setCoupon(null);
          setCouponError("Cupom válido apenas para novos clientes — você já é nosso cliente");
          return;
        }
      }

      // Verifica se este cupom já foi usado por este telefone (1 por cliente)
      if (Number(c.usage_limit_per_customer ?? 0) >= 1) {
        const { count: prevUses } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("restaurant_id", restaurant.id)
          .eq("coupon_code", c.code)
          .in("customer_phone", phoneVariants);
        if ((prevUses ?? 0) >= Number(c.usage_limit_per_customer)) {
          setCoupon(null);
          setCouponError("Você já utilizou este cupom — limite por cliente atingido");
          return;
        }
      }
      setCoupon(c);
      toast.success("Cupom aplicado!");
    } finally {
      setValidatingCoupon(false);
    }
  };

  const removeCoupon = () => { setCoupon(null); setCouponInput(""); setCouponError(null); };

  const storeAddressLine = [
    restaurant.address_street && `${restaurant.address_street}${restaurant.address_number ? `, ${restaurant.address_number}` : ""}`,
    restaurant.address_complement,
    restaurant.address_neighborhood,
    restaurant.address_city && restaurant.address_state ? `${restaurant.address_city}/${restaurant.address_state}` : restaurant.address_city,
    restaurant.address_cep,
  ].filter(Boolean).join(" • ");

  // ---------- Validação por etapa ----------
  const validateStep1 = () => {
    if (name.trim().length < 2) { toast.error("Informe seu nome"); return false; }
    if (unmaskPhone(phone).length < 10) { toast.error("Telefone inválido"); return false; }
    return true;
  };
  const validateStep2 = () => {
    if (isPickup) return true;
    if (!/^\d{5}-?\d{3}$/.test(cep)) { toast.error("CEP inválido"); return false; }
    if (!addr.street || !addr.number || !addr.neighborhood || !addr.city || addr.state.length !== 2) {
      toast.error("Preencha o endereço completo"); return false;
    }
    if (hasZones && !delivery) { toast.error(deliveryError || "Aguarde o cálculo da taxa de entrega."); return false; }
    return true;
  };

  const goNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !isPickup && !validateStep2()) return;
    if (isPickup && step === 1) { setStep(3); return; } // pula endereço
    setStep((s) => (Math.min(3, s + 1) as Step));
  };
  const goBack = () => {
    if (isPickup && step === 3) { setStep(1); return; }
    if (step === 1) { onOpenChange(false); return; } // volta para o carrinho
    setStep((s) => (Math.max(1, s - 1) as Step));
  };

  const submit = async () => {
    if (cart.items.length === 0) return toast.error("Carrinho vazio");
    if (!validateStep1()) { setStep(1); return; }
    if (!isPickup && !validateStep2()) { setStep(2); return; }

    setBusy(true);

    const payload: any = {
      restaurant_id: restaurant.id,
      order_type: orderType,
      customer_name: name.trim(),
      customer_phone: formatPhone(phone),
      payment_method: payment,
      change_for: payment === "cash" && changeFor ? Number(changeFor) : null,
      subtotal,
      delivery_fee: fee,
      total,
      coupon_code: coupon?.code ?? null,
    };

    if (isPickup) {
      payload.address_cep = restaurant.address_cep ?? "";
      payload.address_street = restaurant.address_street ?? "Retirada na loja";
      payload.address_number = restaurant.address_number ?? "—";
      payload.address_complement = restaurant.address_complement ?? null;
      payload.address_neighborhood = restaurant.address_neighborhood ?? "—";
      payload.address_city = restaurant.address_city ?? "—";
      payload.address_state = restaurant.address_state ?? "—";
      payload.address_notes = "Retirada no local";
    } else {
      payload.address_cep = cep;
      payload.address_street = addr.street;
      payload.address_number = addr.number;
      payload.address_complement = addr.complement || null;
      payload.address_neighborhood = addr.neighborhood;
      payload.address_city = addr.city;
      payload.address_state = addr.state;
      payload.address_notes = addr.notes || null;
      payload.delivery_distance_km = feeMode === "fixed" ? null : (delivery?.km ?? null);
      payload.delivery_latitude = feeMode === "fixed" ? null : (delivery?.pt.lat ?? null);
      payload.delivery_longitude = feeMode === "fixed" ? null : (delivery?.pt.lng ?? null);
    }

    // Remove customer_cpf se a coluna não existir (failsafe)
    let { data: order, error } = await supabase.from("orders").insert(payload).select("id, public_token").single();
    if (error && /customer_cpf/i.test(error.message)) {
      delete payload.customer_cpf;
      const retry = await supabase.from("orders").insert(payload).select("id, public_token").single();
      order = retry.data; error = retry.error;
    }

    if (error || !order) { setBusy(false); return toast.error(error?.message || "Erro"); }

    const items = cart.items.map((i) => {
      // Group options by groupName: "Sabores: Pizza, Frango (R$ 5,00)"
      const grouped = new Map<string, string[]>();
      (i.options ?? []).forEach((o) => {
        const label = `${o.itemName}${o.extraPrice > 0 ? ` (${brl(o.extraPrice)})` : ""}`;
        const arr = grouped.get(o.groupName) ?? [];
        arr.push(label);
        grouped.set(o.groupName, arr);
      });
      const optsLines = Array.from(grouped.entries()).map(([g, items]) => `${g}: ${items.join(", ")}`);
      const obsLine = i.notes ? `Obs: ${i.notes}` : "";
      const fullNotes = [...optsLines, obsLine].filter(Boolean).join("\n").trim() || null;
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

    // Salva/atualiza cliente automaticamente via RPC (dedupe pelos dígitos do telefone)
    try {
      const phoneFmt = formatPhone(phone);
      await supabase.rpc("upsert_customer_on_order" as any, {
        _restaurant_id: restaurant.id,
        _name: name.trim(),
        _phone: phoneFmt,
        _address_cep: !isPickup ? cep : null,
        _address_street: !isPickup ? addr.street : null,
        _address_number: !isPickup ? addr.number : null,
        _address_complement: !isPickup ? (addr.complement || null) : null,
        _address_neighborhood: !isPickup ? addr.neighborhood : null,
        _address_city: !isPickup ? addr.city : null,
        _address_state: !isPickup ? addr.state : null,
      });
    } catch (_) { /* não bloqueia o pedido */ }

    // Incrementa uses_count do cupom (best-effort)
    if (coupon?.id) {
      try {
        await supabase.from("coupons" as any).update({ uses_count: Number(coupon.uses_count ?? 0) + 1 }).eq("id", coupon.id);
      } catch (_) {}
    }

    cart.clear();
    setBusy(false);
    onOpenChange(false);
    setActiveOrder(restaurant.id, order.public_token);
    toast.success("Pedido enviado! Acompanhe o status no topo da tela.");
  };

  // Indicador de progresso
  const stepIndex = isPickup ? (step === 1 ? 1 : 2) : step;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center justify-between gap-3">
            <DialogTitle>Finalizar pedido</DialogTitle>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${
                isPickup
                  ? "bg-accent text-accent-foreground border-border"
                  : "bg-primary/10 text-primary border-primary/30"
              }`}
            >
              {isPickup ? <Store className="w-3.5 h-3.5" /> : <Bike className="w-3.5 h-3.5" />}
              {isPickup ? "Retirada" : "Delivery"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-2">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i + 1 <= stepIndex ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">Etapa {stepIndex} de {totalSteps} — {stepLabel}</p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tipo do pedido — visível só na etapa 1, e só se houver mais de uma opção */}
          {step === 1 && (deliveryEnabled && pickupEnabled) && (
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
          )}

          {/* ETAPA 1 — Dados do cliente */}
          {step === 1 && (
            <div className="space-y-3">
              <div className="space-y-2"><Label>Nome completo</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
              <div className="space-y-2"><Label>Telefone</Label><Input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(11) 99999-0000" inputMode="tel" required /></div>
              
            </div>
          )}

          {/* ETAPA 2 — Endereço (só delivery) */}
          {step === 2 && !isPickup && (
            <div className="space-y-3">
              <h3 className="font-semibold text-sm">Endereço de entrega</h3>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2 col-span-1">
                  <Label>CEP</Label>
                  <Input value={cep} onChange={(e) => setCep(e.target.value)} onBlur={(e) => lookupCep(e.target.value)} placeholder="00000-000" required />
                </div>
                <div className="space-y-2 col-span-2"><Label>Rua</Label><Input value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} required /></div>
                <div className="space-y-2"><Label>Número</Label><Input value={addr.number} onChange={(e) => setAddr({ ...addr, number: e.target.value })} required /></div>
                <div className="space-y-2 col-span-2"><Label>Complemento</Label><Input value={addr.complement} onChange={(e) => setAddr({ ...addr, complement: e.target.value })} placeholder="Apto, bloco..." /></div>
                <div className="space-y-2 col-span-2"><Label>Bairro</Label><Input value={addr.neighborhood} onChange={(e) => setAddr({ ...addr, neighborhood: e.target.value })} required /></div>
                <div className="space-y-2 col-span-2"><Label>Cidade</Label><Input value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} required /></div>
                <div className="space-y-2"><Label>UF</Label><Input maxLength={2} value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value.toUpperCase() })} required /></div>
              </div>
              <div className="space-y-2"><Label>Observação do endereço</Label><Textarea value={addr.notes} onChange={(e) => setAddr({ ...addr, notes: e.target.value })} rows={2} placeholder="Ponto de referência, instruções..." /></div>

              {feeMode === "fixed" && (
                <div className="text-sm rounded-lg p-3 flex items-start gap-2 bg-success/10 text-success-foreground border border-success/30">
                  <MapPin className="w-4 h-4 mt-0.5" />
                  <div className="flex-1">
                    Taxa de entrega: <strong>{brl(fixedFee)}</strong> (valor fixo)
                  </div>
                </div>
              )}
              {feeMode !== "fixed" && hasZones && restaurantHasCoords && (
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
              {feeMode !== "fixed" && !hasZones && (
                <p className="text-xs text-muted-foreground">Sem taxa de entrega configurada pela loja.</p>
              )}
            </div>
          )}

          {/* ETAPA 3 — Pagamento + Resumo */}
          {step === 3 && (
            <div className="space-y-4">
              {isPickup && storeAddressLine && (
                <div className="border rounded-lg p-3 space-y-1">
                  <h3 className="font-semibold text-sm flex items-center gap-2"><Store className="w-4 h-4" />Endereço para retirada</h3>
                  <p className="text-sm">{storeAddressLine}</p>
                  <p className="text-xs text-muted-foreground">Apresente seu nome ou telefone ao retirar.</p>
                </div>
              )}

              <div className="space-y-3">
                <h3 className="font-semibold text-sm">Pagamento</h3>
                <RadioGroup value={payment} onValueChange={(v) => setPayment(v as any)} className="space-y-2">
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
                  <div className="space-y-2"><Label>Troco para (opcional)</Label><Input value={changeFor} onChange={(e) => setChangeFor(e.target.value)} type="number" step="0.01" placeholder="Ex: 50.00" /></div>
                )}
              </div>

              {/* Cupom de desconto */}
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Cupom de desconto</h3>
                {coupon ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-3">
                    <div className="text-sm">
                      <div className="font-mono font-bold text-primary">{coupon.code}</div>
                      <div className="text-xs text-muted-foreground">{coupon.name} — desconto {brl(discount)}</div>
                    </div>
                    <Button type="button" variant="ghost" size="sm" onClick={removeCoupon}>Remover</Button>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2">
                      <Input
                        value={couponInput}
                        onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null); }}
                        placeholder="Digite o código"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(); } }}
                      />
                      <Button type="button" variant="outline" onClick={applyCoupon} disabled={validatingCoupon || !couponInput.trim()}>
                        {validatingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : "Aplicar"}
                      </Button>
                    </div>
                    {couponError && <p className="text-xs text-destructive">{couponError}</p>}
                  </>
                )}
              </div>

              {/* Resumo do pedido */}
              <div className="border rounded-lg p-3 space-y-2">
                <h3 className="font-semibold text-sm">Resumo do pedido</h3>
                <div className="space-y-1 text-sm max-h-44 overflow-y-auto pr-1">
                  {cart.items.map((i, idx) => {
                    const unit = i.price + (i.options?.reduce((s, o) => s + (Number(o.extraPrice) || 0), 0) ?? 0);
                    return (
                      <div key={idx} className="flex justify-between gap-2">
                        <span><span className="font-medium">{i.quantity}×</span> {i.name}</span>
                        <span className="tabular-nums">{brl(unit * i.quantity)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="border-t pt-2 space-y-1 text-sm">
                  <div className="flex justify-between"><span>Subtotal</span><span>{brl(subtotal)}</span></div>
                  {!isPickup && (
                    <div className="flex justify-between"><span>Entrega</span><span>{fee > 0 ? brl(fee) : (hasZones ? "—" : "Grátis")}</span></div>
                  )}
                  {isPickup && (
                    <div className="flex justify-between text-muted-foreground"><span>Retirada na loja</span><span>Sem taxa</span></div>
                  )}
                  {discount > 0 && (
                    <div className="flex justify-between text-success"><span>Desconto ({coupon?.code})</span><span>− {brl(discount)}</span></div>
                  )}
                  <div className="flex justify-between font-bold text-base pt-1 border-t"><span>Total</span><span>{brl(total)}</span></div>
                </div>
              </div>
            </div>
          )}

          {/* Navegação */}
          <div className="flex gap-2 pt-2 border-t">
            <Button type="button" variant="outline" onClick={goBack} disabled={busy}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              {step === 1 ? "Carrinho" : "Voltar"}
            </Button>
            {step < 3 ? (
              <Button type="button" className="flex-1" onClick={goNext}>
                Avançar <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            ) : (
              <Button type="button" className="flex-1" size="lg" onClick={submit} disabled={busy || (!isPickup && (calculating || (hasZones && !delivery)))}>
                {busy ? "Enviando..." : (<><Check className="w-4 h-4 mr-1" />Enviar pedido</>)}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
