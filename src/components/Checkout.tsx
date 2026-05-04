import { useEffect, useRef, useState, type MutableRefObject } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { brl, formatPhone, unmaskPhone } from "@/lib/format";
import { toast } from "sonner";
import { DeliveryZone, GeoPoint, findDeliveryFee, geocodeAddress, haversineKm } from "@/lib/delivery";
import { Loader2, MapPin, Bike, Store, ArrowLeft, ArrowRight, Check } from "lucide-react";
import { LocationPicker } from "@/components/LocationPicker";
import { AddressSearchDialog } from "@/components/AddressSearchDialog";

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
  const [dontKnowCep, setDontKnowCep] = useState(false);
  const [addr, setAddr] = useState({ street: "", number: "", complement: "", neighborhood: "", city: "", state: "", notes: "" });
  const [pinnedPoint, setPinnedPoint] = useState<GeoPoint | null>(null);

  // Etapa 3 — pagamento
  const [payment, setPayment] = useState<"" | "cash" | "pix" | "card_on_delivery">("");
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

  // Endereços anteriores deste telefone (até 3 distintos)
  type PrevAddress = {
    cep: string;
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
    notes: string;
    lat: number | null;
    lng: number | null;
    last_used_at: string;
  };
  const [prevAddresses, setPrevAddresses] = useState<PrevAddress[]>([]);

  // Busca endereços anteriores quando o telefone fica válido (10+ dígitos)
  useEffect(() => {
    if (!open) return;
    const digits = unmaskPhone(phone);
    if (digits.length < 10) {
      setPrevAddresses([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const phoneFmt = formatPhone(phone);
      const variants = Array.from(new Set([phoneFmt, digits].filter(Boolean)));
      const { data } = await supabase
        .from("orders")
        .select(
          "address_cep,address_street,address_number,address_complement,address_neighborhood,address_city,address_state,address_notes,delivery_latitude,delivery_longitude,created_at",
        )
        .eq("restaurant_id", restaurant.id)
        .in("customer_phone", variants)
        .eq("order_type", "delivery")
        .not("address_street", "is", null)
        .order("created_at", { ascending: false })
        .limit(15);
      if (cancelled) return;
      const seen = new Set<string>();
      const out: PrevAddress[] = [];
      for (const o of (data ?? []) as any[]) {
        const street = (o.address_street ?? "").trim();
        const number = (o.address_number ?? "").trim();
        const city = (o.address_city ?? "").trim();
        if (!street || !city) continue;
        const key = [street, number, city].join("|").toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          cep: o.address_cep ?? "",
          street,
          number,
          complement: o.address_complement ?? "",
          neighborhood: o.address_neighborhood ?? "",
          city,
          state: o.address_state ?? "",
          notes: o.address_notes ?? "",
          lat: typeof o.delivery_latitude === "number" ? o.delivery_latitude : null,
          lng: typeof o.delivery_longitude === "number" ? o.delivery_longitude : null,
          last_used_at: o.created_at,
        });
        if (out.length >= 3) break;
      }
      setPrevAddresses(out);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, phone, restaurant.id]);

  const applyPrevAddress = (p: PrevAddress) => {
    setAddr({
      street: p.street,
      number: p.number,
      complement: p.complement,
      neighborhood: p.neighborhood,
      city: p.city,
      state: p.state,
      notes: p.notes,
    });
    if (p.cep) setCep(p.cep);
    if (p.lat != null && p.lng != null && isFinite(p.lat) && isFinite(p.lng)) {
      setPinnedPoint({ lat: p.lat, lng: p.lng });
    } else {
      setPinnedPoint(null);
    }
  };

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

  // Chave de cache do cliente (nome+telefone) por restaurante
  const customerCacheKey = `checkout:lastCustomer:${restaurant.id}`;

  // Reset ao reabrir
  useEffect(() => {
    if (open) {
      setStep(1);
      // Cupom NUNCA deve vir aplicado por cache — sempre limpa ao abrir
      setCoupon(null);
      setCouponInput("");
      setCouponError(null);
      setPinnedPoint(null);
      setPayment("");
      setChangeFor("");
      // ao abrir, escolhe a opção disponível por padrão
      if (!deliveryEnabled && pickupEnabled) setOrderType("pickup");
      else if (deliveryEnabled) setOrderType("delivery");

      // Pré-preenche nome/telefone com cache do último pedido neste restaurante
      try {
        const raw = localStorage.getItem(customerCacheKey);
        if (raw) {
          const cached = JSON.parse(raw) as { name?: string; phone?: string };
          if (cached?.name) setName((prev) => (prev?.trim() ? prev : cached.name!));
          if (cached?.phone) setPhone((prev) => (prev?.trim() ? prev : cached.phone!));
        }
      } catch (_) { /* ignore */ }
    }
  }, [open, deliveryEnabled, pickupEnabled, customerCacheKey]);

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

  // Refs e estado de shake para feedback visual sem toasts
  const fieldRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [shakeKey, setShakeKey] = useState<string | null>(null);
  const flagInvalid = (key: string) => {
    const el = fieldRefs.current[key];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    setShakeKey(key);
    setTimeout(() => setShakeKey((k) => (k === key ? null : k)), 600);
  };

  // ---------- Validação por etapa ----------
  const validateStep1 = () => {
    if (name.trim().length < 2) { flagInvalid("name"); return false; }
    if (unmaskPhone(phone).length < 10) { flagInvalid("phone"); return false; }
    return true;
  };
  const validateStep2 = () => {
    if (isPickup) return true;
    if (!dontKnowCep && !/^\d{5}-?\d{3}$/.test(cep)) { flagInvalid("cep"); return false; }
    if (!addr.street) { flagInvalid("street"); return false; }
    if (!addr.number) { flagInvalid("number"); return false; }
    if (!addr.neighborhood) { flagInvalid("neighborhood"); return false; }
    if (!addr.city) { flagInvalid("city"); return false; }
    if (addr.state.length !== 2) { flagInvalid("state"); return false; }
    if (hasZones && !delivery) { flagInvalid("delivery"); return false; }
    return true;
  };

  const [validatingPhone, setValidatingPhone] = useState(false);
  const goNext = async () => {
    if (step === 1) {
      if (!validateStep1()) return;
      // Limpa qualquer endereço previamente preenchido (de pedido anterior na mesma sessão)
      // para forçar a tela de sugestões a aparecer como se a página tivesse sido recarregada
      if (!isPickup) {
        setAddr({ street: "", number: "", complement: "", neighborhood: "", city: "", state: "", notes: "" });
        setCep("");
        setDontKnowCep(false);
        setPinnedPoint(null);
        setDelivery(null);
        setDeliveryError(null);
        setPrevAddresses([]);
      }
      // Revalida o telefone consultando histórico antes de avançar
      try {
        setValidatingPhone(true);
        const digits = unmaskPhone(phone);
        const phoneFmt = formatPhone(phone);
        const variants = Array.from(new Set([phoneFmt, digits].filter(Boolean)));
        const { data } = await supabase
          .from("orders")
          .select(
            "address_cep,address_street,address_number,address_complement,address_neighborhood,address_city,address_state,address_notes,delivery_latitude,delivery_longitude,created_at",
          )
          .eq("restaurant_id", restaurant.id)
          .in("customer_phone", variants)
          .eq("order_type", "delivery")
          .not("address_street", "is", null)
          .order("created_at", { ascending: false })
          .limit(15);
        const seen = new Set<string>();
        const out: PrevAddress[] = [];
        for (const o of (data ?? []) as any[]) {
          const street = (o.address_street ?? "").trim();
          const number = (o.address_number ?? "").trim();
          const city = (o.address_city ?? "").trim();
          if (!street || !city) continue;
          const key = [street, number, city].join("|").toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          out.push({
            cep: o.address_cep ?? "",
            street,
            number,
            complement: o.address_complement ?? "",
            neighborhood: o.address_neighborhood ?? "",
            city,
            state: o.address_state ?? "",
            notes: o.address_notes ?? "",
            lat: typeof o.delivery_latitude === "number" ? o.delivery_latitude : null,
            lng: typeof o.delivery_longitude === "number" ? o.delivery_longitude : null,
            last_used_at: o.created_at,
          });
          if (out.length >= 3) break;
        }
        setPrevAddresses(out);
      } catch (_) { /* não bloqueia */ }
      finally { setValidatingPhone(false); }
    }
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
    if (!payment) { flagInvalid("payment"); return; }

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
      loyalty_opt_in: loyaltyEnabled && loyaltyOptIn,
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
      payload.delivery_latitude = pinnedPoint?.lat ?? (feeMode === "fixed" ? null : (delivery?.pt.lat ?? null));
      payload.delivery_longitude = pinnedPoint?.lng ?? (feeMode === "fixed" ? null : (delivery?.pt.lng ?? null));
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

    // Programa de fidelidade — cria/atualiza membro e cria transação pendente
    let earnedPoints = 0;
    if (loyaltyEnabled && loyaltyOptIn) {
      try {
        const phoneFmt = formatPhone(phone);
        earnedPoints = Math.floor(Number(subtotal) * Number(loyaltyPointsPerReal || 0));
        const sb = supabase as any;
        const { data: existing } = await sb
          .from("loyalty_members")
          .select("id")
          .eq("restaurant_id", restaurant.id)
          .eq("phone", phoneFmt)
          .maybeSingle();
        let memberId = existing?.id as string | undefined;
        if (!memberId) {
          const { data: created } = await sb
            .from("loyalty_members")
            .insert({ restaurant_id: restaurant.id, name: name.trim(), phone: phoneFmt, points: 0 })
            .select("id")
            .single();
          memberId = created?.id;
        }
        if (memberId && earnedPoints > 0) {
          await sb.from("loyalty_transactions").insert({
            restaurant_id: restaurant.id,
            member_id: memberId,
            order_id: order.id,
            points: earnedPoints,
            type: "earn",
            status: "pending",
          });
        }
      } catch (_) {}
    }

    // Salva nome+telefone em cache local para pré-preencher próximo pedido
    try {
      localStorage.setItem(
        customerCacheKey,
        JSON.stringify({ name: name.trim(), phone: formatPhone(phone) }),
      );
    } catch (_) { /* ignore */ }

    cart.clear();
    setBusy(false);
    onOpenChange(false);
    setActiveOrder(restaurant.id, order.public_token);
    // Rola para o topo da página com animação suave
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (_) { window.scrollTo(0, 0); }
    toast.custom(
      () => (
        <div className="flex items-center gap-4 rounded-xl border bg-background px-6 py-5 shadow-elegant">
          <svg viewBox="0 0 64 64" className="animated-check w-12 h-12 shrink-0" fill="none">
            <circle
              className="check-circle"
              cx="32" cy="32" r="28"
              stroke="hsl(var(--success))" strokeWidth="4" strokeLinecap="round"
            />
            <path
              className="check-mark"
              d="M20 33 l9 9 l16 -18"
              stroke="hsl(var(--success))" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"
            />
          </svg>
          <span className="text-xl font-semibold text-foreground">Pedido enviado</span>
        </div>
      ),
      { duration: 5000 },
    );
  };

  // Indicador de progresso
  const stepIndex = isPickup ? (step === 1 ? 1 : 2) : step;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-full sm:max-w-2xl w-screen h-[100dvh] sm:h-[100dvh] max-h-[100dvh] sm:rounded-none p-0 gap-0 flex flex-col overflow-hidden" onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader className="px-6 pt-6 pb-3 border-b shrink-0 text-left">
          <div className="flex items-center justify-between gap-3 pr-10">
            <DialogTitle className="text-left">Finalizar pedido</DialogTitle>
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
          <p className="text-xs text-muted-foreground mt-1 text-left">Etapa {stepIndex} de {totalSteps} — {stepLabel}</p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
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
              <div
                ref={(el) => { fieldRefs.current["name"] = el; }}
                style={{ scrollMarginTop: 80 }}
                className={`space-y-2 ${shakeKey === "name" ? "animate-shake" : ""}`}
              >
                <Label className={shakeKey === "name" ? "text-destructive" : ""}>Nome completo</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className={shakeKey === "name" ? "border-destructive" : ""} required />
              </div>
              <div
                ref={(el) => { fieldRefs.current["phone"] = el; }}
                style={{ scrollMarginTop: 80 }}
                className={`space-y-2 ${shakeKey === "phone" ? "animate-shake" : ""}`}
              >
                <Label className={shakeKey === "phone" ? "text-destructive" : ""}>Telefone</Label>
                <Input value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} placeholder="(11) 99999-0000" inputMode="tel" className={shakeKey === "phone" ? "border-destructive" : ""} required />
              </div>
            </div>
          )}

          {/* ETAPA 2 — Endereço (só delivery) */}
          {step === 2 && !isPickup && (
            <Step2Address
              cep={cep}
              setCep={setCep}
              dontKnowCep={dontKnowCep}
              setDontKnowCep={setDontKnowCep}
              addr={addr}
              setAddr={setAddr}
              lookupCep={lookupCep}
              fieldRefs={fieldRefs}
              shakeKey={shakeKey}
              flagInvalid={flagInvalid}
              feeMode={feeMode}
              fixedFee={fixedFee}
              hasZones={hasZones}
              restaurantHasCoords={restaurantHasCoords}
              delivery={delivery}
              deliveryError={deliveryError}
              calculating={calculating}
              pinnedPoint={pinnedPoint}
              setPinnedPoint={setPinnedPoint}
              restaurantLat={restaurant.latitude ?? null}
              restaurantLng={restaurant.longitude ?? null}
              restaurantCity={restaurant.address_city ?? null}
              restaurantState={restaurant.address_state ?? null}
              prevAddresses={prevAddresses}
              applyPrevAddress={applyPrevAddress}
            />
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

              <div className={`space-y-3 ${shakeKey === "payment" ? "animate-shake" : ""}`}>
                <h3 className={`font-semibold text-sm ${shakeKey === "payment" ? "text-destructive" : ""}`}>Pagamento</h3>
                <Select value={payment || undefined} onValueChange={(v) => setPayment(v as any)}>
                  <SelectTrigger className={`h-14 text-base ${shakeKey === "payment" ? "border-destructive" : ""}`}>
                    <SelectValue placeholder="Selecione a forma de pagamento" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash" className="py-4 text-base">Dinheiro</SelectItem>
                    <SelectItem value="pix" className="py-4 text-base">Pix</SelectItem>
                    <SelectItem value="card_on_delivery" className="py-4 text-base">{isPickup ? "Cartão na retirada" : "Cartão na entrega"}</SelectItem>
                  </SelectContent>
                </Select>
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

              {/* Programa de fidelidade */}
              {loyaltyEnabled && (
                <label className="flex items-start gap-3 rounded-lg border-2 border-dashed border-primary/40 bg-primary/5 p-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={loyaltyOptIn}
                    onChange={(e) => setLoyaltyOptIn(e.target.checked)}
                    className="mt-1 h-4 w-4"
                  />
                  <div className="text-sm">
                    <div className="font-semibold">Deseja pontuar no nosso programa de fidelidade?</div>
                    <div className="text-xs text-muted-foreground">
                      {loyaltyOptIn
                        ? `Sua compra gerará ${Math.floor(Number(subtotal) * Number(loyaltyPointsPerReal || 0))} ponto(s) (sem contar taxa de entrega).`
                        : `Marque para acumular pontos (${loyaltyPointsPerReal} ponto por R$ 1,00 em produtos).`}
                    </div>
                  </div>
                </label>
              )}

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

        </div>

        {/* Navegação fixa no final */}
        <div className="shrink-0 border-t bg-background px-6 py-3 flex gap-2">
            {step > 1 && (
              <Button type="button" variant="outline" onClick={goBack} disabled={busy}>
                <ArrowLeft className="w-4 h-4 mr-1" />
                Voltar
              </Button>
            )}
            {step < 3 ? (
              <Button type="button" className="flex-1" onClick={goNext} disabled={validatingPhone}>
                {validatingPhone ? (<><Loader2 className="w-4 h-4 mr-1 animate-spin" />Validando...</>) : (<>Avançar <ArrowRight className="w-4 h-4 ml-1" /></>)}
              </Button>
            ) : (
              <Button type="button" className="flex-1" size="lg" onClick={submit} disabled={busy || (!isPickup && (calculating || (hasZones && !delivery)))}>
                {busy ? "Enviando..." : (<><Check className="w-4 h-4 mr-1" />Enviar pedido</>)}
              </Button>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Sub-componente: Etapa 2 — Endereço ----------
type AddrShape = { street: string; number: string; complement: string; neighborhood: string; city: string; state: string; notes: string };

function Step2Address(props: {
  cep: string;
  setCep: (v: string) => void;
  dontKnowCep: boolean;
  setDontKnowCep: (v: boolean) => void;
  addr: AddrShape;
  setAddr: (a: AddrShape) => void;
  lookupCep: (raw: string) => Promise<unknown>;
  fieldRefs: MutableRefObject<Record<string, HTMLDivElement | null>>;
  shakeKey: string | null;
  flagInvalid: (k: string) => void;
  feeMode: "fixed" | "radius";
  fixedFee: number;
  hasZones: boolean;
  restaurantHasCoords: boolean;
  delivery: { fee: number; km: number; pt: GeoPoint } | null;
  deliveryError: string | null;
  calculating: boolean;
  pinnedPoint: GeoPoint | null;
  setPinnedPoint: (pt: GeoPoint | null) => void;
  restaurantLat: number | null;
  restaurantLng: number | null;
  restaurantCity: string | null;
  restaurantState: string | null;
  prevAddresses: Array<{
    cep: string; street: string; number: string; complement: string;
    neighborhood: string; city: string; state: string; notes: string;
    lat: number | null; lng: number | null; last_used_at: string;
  }>;
  applyPrevAddress: (p: {
    cep: string; street: string; number: string; complement: string;
    neighborhood: string; city: string; state: string; notes: string;
    lat: number | null; lng: number | null; last_used_at: string;
  }) => void;
}) {
  const {
    cep, setCep, dontKnowCep, setDontKnowCep, addr, setAddr, lookupCep,
    fieldRefs, shakeKey, feeMode, fixedFee, hasZones, restaurantHasCoords,
    delivery, deliveryError, calculating, pinnedPoint, setPinnedPoint,
    restaurantLat, restaurantLng, restaurantCity, restaurantState,
    prevAddresses, applyPrevAddress,
  } = props;

  const [editing, setEditing] = useState(false);
  const [pickingMap, setPickingMap] = useState(false);
  const [searching, setSearching] = useState(false);
  const [mapInitialPoint, setMapInitialPoint] = useState<GeoPoint | null>(null);
  const [forceGeolocate, setForceGeolocate] = useState(false);

  const hasAddress = !!(addr.street && addr.number && addr.neighborhood && addr.city && addr.state);

  const summaryLine = [
    addr.street && `${addr.street}${addr.number ? `, ${addr.number}` : ""}`,
    addr.complement,
    addr.neighborhood,
    addr.city && addr.state ? `${addr.city}/${addr.state}` : addr.city,
    cep,
  ].filter(Boolean).join(" • ");

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm">Endereço de entrega</h3>

      {hasAddress ? (
        <div className="border rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-3">
            <MapPin className="w-5 h-5 mt-0.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium break-words">{summaryLine}</p>
              {addr.notes && (
                <p className="text-xs text-muted-foreground mt-1 break-words">
                  <span className="font-semibold">Observação:</span> {addr.notes}
                </p>
              )}
              {pinnedPoint && (
                <p className="text-xs text-success mt-1 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Localização confirmada no mapa
                </p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setSearching(true)}>
              Editar endereço
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => { setMapInitialPoint(pinnedPoint); setPickingMap(true); }}>
              <MapPin className="w-4 h-4 mr-1" />
              {pinnedPoint ? "Reajustar pino" : "Pinar no mapa"}
            </Button>
          </div>
        </div>
      ) : prevAddresses.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {prevAddresses.length === 1 ? "Último endereço usado" : "Endereços usados anteriormente"}
          </p>
          <div className="space-y-2">
            {prevAddresses.map((p, i) => {
              const line = [
                `${p.street}${p.number ? `, ${p.number}` : ""}`,
                p.complement,
                p.neighborhood,
                p.city && p.state ? `${p.city}/${p.state}` : p.city,
                p.cep,
              ].filter(Boolean).join(" • ");
              return (
                <button
                  key={`${p.street}-${p.number}-${i}`}
                  type="button"
                  onClick={() => applyPrevAddress(p)}
                  className="w-full text-left border rounded-lg p-3 hover:bg-muted/60 transition-colors flex items-start gap-3"
                >
                  <MapPin className="w-5 h-5 mt-0.5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium break-words">{line}</p>
                    {i === 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">Último endereço usado</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
          <Button type="button" variant="outline" onClick={() => setSearching(true)} className="w-full justify-start gap-2">
            <MapPin className="w-4 h-4" />
            Adicionar novo endereço
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => setSearching(true)} className="w-full justify-start gap-2 h-12">
          <MapPin className="w-4 h-4" />
          Cadastre seu endereço
        </Button>
      )}

      {feeMode === "fixed" && (
        <div className="text-sm rounded-lg p-3 flex items-start gap-2 bg-success/20 text-foreground border border-success/50">
          <MapPin className="w-4 h-4 mt-0.5 text-success" />
          <div className="flex-1">
            Taxa de entrega: <strong>{brl(fixedFee)}</strong> (valor fixo)
          </div>
        </div>
      )}
      {feeMode !== "fixed" && hasZones && restaurantHasCoords && (
        <div
          ref={(el) => { fieldRefs.current["delivery"] = el; }}
          style={{ scrollMarginTop: 80 }}
          className={`text-sm rounded-lg p-3 flex items-start gap-2 ${shakeKey === "delivery" ? "animate-shake" : ""} ${deliveryError ? "bg-destructive/10 text-destructive" : delivery ? "bg-success/20 text-foreground border border-success/50" : "bg-muted"}`}
        >
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

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="p-0 gap-0 flex flex-col overflow-hidden max-w-full w-screen h-[100dvh] sm:max-w-full rounded-none">
          <DialogHeader className="shrink-0 px-6 py-4 border-b">
            <DialogTitle>Cadastre seu endereço</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3 flex items-end gap-3 flex-wrap">
                <div ref={(el) => { fieldRefs.current["cep"] = el; }} style={{ scrollMarginTop: 80 }} className={`space-y-2 ${shakeKey === "cep" ? "animate-shake" : ""}`}>
                  <Label className={shakeKey === "cep" ? "text-destructive" : ""}>CEP</Label>
                  <Input
                    value={cep}
                    onChange={(e) => {
                      const d = e.target.value.replace(/\D/g, "").slice(0, 8);
                      const masked = d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
                      setCep(masked);
                    }}
                    onBlur={(e) => !dontKnowCep && lookupCep(e.target.value)}
                    placeholder="00000-000"
                    disabled={dontKnowCep}
                    inputMode="numeric"
                    maxLength={9}
                    className={`w-[8rem] px-3 text-center ${shakeKey === "cep" ? "border-destructive" : ""}`}
                    required={!dontKnowCep}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none h-10">
                  <input
                    type="checkbox"
                    checked={dontKnowCep}
                    onChange={(e) => {
                      setDontKnowCep(e.target.checked);
                      if (e.target.checked) setCep("");
                    }}
                    className="h-4 w-4"
                  />
                  Não sei meu CEP
                </label>
              </div>
              <div ref={(el) => { fieldRefs.current["street"] = el; }} style={{ scrollMarginTop: 80 }} className={`space-y-2 col-span-3 ${shakeKey === "street" ? "animate-shake" : ""}`}>
                <Label className={shakeKey === "street" ? "text-destructive" : ""}>Rua</Label>
                <Input value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} className={shakeKey === "street" ? "border-destructive" : ""} required />
              </div>
              <div ref={(el) => { fieldRefs.current["number"] = el; }} style={{ scrollMarginTop: 80 }} className={`space-y-2 ${shakeKey === "number" ? "animate-shake" : ""}`}>
                <Label className={shakeKey === "number" ? "text-destructive" : ""}>Número</Label>
                <Input value={addr.number} onChange={(e) => setAddr({ ...addr, number: e.target.value })} className={shakeKey === "number" ? "border-destructive" : ""} required />
              </div>
              <div className="space-y-2 col-span-2"><Label>Complemento</Label><Input value={addr.complement} onChange={(e) => setAddr({ ...addr, complement: e.target.value })} placeholder="Apto, bloco..." /></div>
              <div ref={(el) => { fieldRefs.current["neighborhood"] = el; }} style={{ scrollMarginTop: 80 }} className={`space-y-2 col-span-2 ${shakeKey === "neighborhood" ? "animate-shake" : ""}`}>
                <Label className={shakeKey === "neighborhood" ? "text-destructive" : ""}>Bairro</Label>
                <Input value={addr.neighborhood} onChange={(e) => setAddr({ ...addr, neighborhood: e.target.value })} className={shakeKey === "neighborhood" ? "border-destructive" : ""} required />
              </div>
              <div ref={(el) => { fieldRefs.current["city"] = el; }} style={{ scrollMarginTop: 80 }} className={`space-y-2 col-span-2 ${shakeKey === "city" ? "animate-shake" : ""}`}>
                <Label className={shakeKey === "city" ? "text-destructive" : ""}>Cidade</Label>
                <Input value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} className={shakeKey === "city" ? "border-destructive" : ""} required />
              </div>
              <div ref={(el) => { fieldRefs.current["state"] = el; }} style={{ scrollMarginTop: 80 }} className={`space-y-2 ${shakeKey === "state" ? "animate-shake" : ""}`}>
                <Label className={shakeKey === "state" ? "text-destructive" : ""}>UF</Label>
                <Input maxLength={2} value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value.toUpperCase() })} className={shakeKey === "state" ? "border-destructive" : ""} required />
              </div>
            </div>
            <div className="space-y-2"><Label>Observação do endereço</Label><Textarea value={addr.notes} onChange={(e) => setAddr({ ...addr, notes: e.target.value })} rows={2} placeholder="Ponto de referência, instruções..." /></div>
          </div>
          <div className="shrink-0 border-t bg-background px-6 py-3">
            <Button
              type="button"
              className="w-full"
              onClick={() => {
                if (!dontKnowCep && !/^\d{5}-?\d{3}$/.test(cep)) { props.flagInvalid("cep"); return; }
                if (!addr.street) { props.flagInvalid("street"); return; }
                if (!addr.number) { props.flagInvalid("number"); return; }
                if (!addr.neighborhood) { props.flagInvalid("neighborhood"); return; }
                if (!addr.city) { props.flagInvalid("city"); return; }
                if (addr.state.length !== 2) { props.flagInvalid("state"); return; }
                setEditing(false);
              }}
            >
              Confirmar endereço
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AddressSearchDialog
        open={searching}
        onOpenChange={setSearching}
        proximity={pinnedPoint ?? (restaurantLat != null && restaurantLng != null ? { lat: restaurantLat, lng: restaurantLng } : undefined)}
        cityFilter={restaurantCity ?? undefined}
        stateFilter={restaurantState ?? undefined}
        onPickSuggestion={(s) => {
          setSearching(false);
          setAddr({
            ...addr,
            street: s.street || addr.street,
            neighborhood: s.neighborhood || addr.neighborhood,
            city: s.city || addr.city,
            state: s.state || addr.state,
            number: s.number || addr.number || "",
          });
          if (s.cep) setCep(s.cep.replace(/\D/g, "").replace(/(\d{5})(\d{3})/, "$1-$2"));
          // Só usa o ponto da sugestão se for um par lat/lng válido; senão cai no
          // ponto já fixado ou na geolocalização do navegador.
          const validPoint =
            typeof s.lat === "number" && typeof s.lng === "number" && isFinite(s.lat) && isFinite(s.lng)
              ? { lat: s.lat, lng: s.lng }
              : null;
          setMapInitialPoint(validPoint ?? pinnedPoint);
          setForceGeolocate(!validPoint && !pinnedPoint);
          setPickingMap(true);
        }}
        onUseCurrentLocation={() => {
          setSearching(false);
          setMapInitialPoint(null);
          setForceGeolocate(true);
          setPickingMap(true);
        }}
      />

      <LocationPicker
        open={pickingMap}
        onOpenChange={(o) => { setPickingMap(o); if (!o) setForceGeolocate(false); }}
        initialPoint={forceGeolocate ? null : (mapInitialPoint ?? pinnedPoint)}
        onConfirm={(r) => {
          // Endereço do mapa SEMPRE prevalece sobre o digitado/pesquisado. Se o
          // cliente arrastou o pino, limpamos o número para ele digitar manualmente.
          const numberFromMap = r.mapMoved ? "" : (addr.number || r.number || "");
          setPinnedPoint({ lat: r.lat, lng: r.lng });
          setAddr({
            ...addr,
            street: r.street || (r.mapMoved ? "" : addr.street) || "",
            neighborhood: r.neighborhood || (r.mapMoved ? "" : addr.neighborhood) || "",
            city: r.city || (r.mapMoved ? "" : addr.city) || "",
            state: r.state || (r.mapMoved ? "" : addr.state) || "",
            number: numberFromMap,
          });
          if (r.cep) setCep(r.cep.replace(/\D/g, "").replace(/(\d{5})(\d{3})/, "$1-$2"));
          if (r.mapMoved) props.flagInvalid("number");
          setEditing(true);
        }}
      />
    </div>
  );
}

