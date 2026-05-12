// iHub (iFood) webhook receiver
// URL: https://kcjrrnxsqdcgjqplgiku.supabase.co/functions/v1/ihub-webhook
// Configure this URL no painel do iHub (https://ihub.arcn.com.br)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ifood-hub-signature, accept",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

type IHubEvent = {
  id?: string;
  code?: string;
  fullCode?: string;
  orderId?: string;
  merchantId?: string;
  createdAt?: string;
  order_details?: any;
};

// Map iHub fullCode -> internal order status
// CONFIRMED é mapeado direto para "preparing" porque, no nosso fluxo, ao aceitar
// o pedido o restaurante já está iniciando o preparo (não temos passo "accepted" separado).
function mapStatus(fullCode?: string): string | null {
  switch (fullCode) {
    case "PLACED": return "pending";
    case "CONFIRMED": return "preparing";
    case "PREPARATION_STARTED": return "preparing";
    case "READY_TO_PICKUP": return "awaiting_pickup";
    case "DISPATCHED": return "out_for_delivery";
    case "CONCLUDED": return "delivered";
    case "CANCELLED": return "cancelled";
    default: return null;
  }
}

// Ordem de progresso para evitar regressões (webhook fora de ordem não puxa status pra trás)
const STATUS_ORDER: Record<string, number> = {
  pending: 0,
  accepted: 1,
  preparing: 2,
  awaiting_pickup: 3,
  out_for_delivery: 3,
  delivered: 4,
  cancelled: 5,
};

// iFood orderType -> nosso order_type
function mapOrderType(od: any): "delivery" | "pickup" {
  const t = String(od?.orderType ?? od?.type ?? "DELIVERY").toUpperCase();
  if (t === "TAKEOUT" || t === "PICKUP" || t === "INDOOR") return "pickup";
  return "delivery";
}

// Telefone do iFood: vem como { number: "0800...", localizer: "12345" }
function formatIfoodPhone(customer: any): string {
  const phoneObj = customer?.phone;
  if (!phoneObj) return "";
  if (typeof phoneObj === "string") return phoneObj;
  const num = phoneObj.number ?? "";
  const loc = phoneObj.localizer ?? "";
  if (num && loc) return `${num} (cód: ${loc})`;
  return num || loc || "";
}

// Mapeia método de pagamento iFood -> enum interno
function mapPayment(od: any): string {
  const methods = od?.payments?.methods ?? od?.paymentMethods ?? [];
  const m = Array.isArray(methods) && methods.length > 0 ? methods[0] : null;
  if (!m) return "card_on_delivery";
  // Pago online (pré-pago) no iFood => loja não recebe na entrega
  const prepaid = m?.prepaid === true || String(m?.type ?? "").toUpperCase() === "ONLINE";
  if (prepaid) return "online";
  const method = String(m?.method ?? "").toUpperCase();
  const type = String(m?.type ?? "").toUpperCase();
  const combined = `${method} ${type}`;
  if (combined.includes("CASH") || combined.includes("DINHEIRO")) return "cash";
  if (combined.includes("PIX")) return "pix";
  if (
    combined.includes("CREDIT") || combined.includes("DEBIT") || combined.includes("CARD") ||
    combined.includes("WALLET") || combined.includes("VOUCHER") || combined.includes("MEAL_VOUCHER") ||
    combined.includes("FOOD_VOUCHER")
  ) return "card_on_delivery";
  return "card_on_delivery";
}

// Troco para (somente quando paga em dinheiro)
function extractChangeFor(od: any): number | null {
  const methods = od?.payments?.methods ?? od?.paymentMethods ?? [];
  const m = Array.isArray(methods) && methods.length > 0 ? methods[0] : null;
  if (!m) return null;
  const cf = m?.cash?.changeFor ?? m?.changeFor ?? m?.cashChangeFor ?? null;
  if (cf == null) return null;
  const n = Number(cf);
  return isFinite(n) && n > 0 ? n : null;
}

// Itens com sub-itens (grupos de opções) achatados na coluna notes
function buildItemsForOrderItems(od: any) {
  const items = Array.isArray(od?.items) ? od.items : [];
  const collectOpt = (s: any, depth: number, acc: string[]) => {
    const qty = s.quantity ? `${s.quantity}× ` : "";
    const indent = depth > 0 ? "  ".repeat(depth) + "↳ " : "";
    acc.push(`${indent}${qty}${s.name ?? ""}`.trim());
    if (Array.isArray(s.customizations)) {
      s.customizations.forEach((c: any) => collectOpt(c, depth + 1, acc));
    }
    if (Array.isArray(s.options)) {
      s.options.forEach((c: any) => collectOpt(c, depth + 1, acc));
    }
  };
  return items.map((it: any) => {
    const subs: string[] = [];
    if (Array.isArray(it.subItems)) it.subItems.forEach((s: any) => collectOpt(s, 0, subs));
    if (Array.isArray(it.options)) it.options.forEach((s: any) => collectOpt(s, 0, subs));
    const notesParts: string[] = [];
    if (subs.length) notesParts.push(subs.join(" • "));
    if (it.observations) notesParts.push(it.observations);
    // Preço unitário considerando complementos/customizações:
    // iFood já fornece totalPrice (preço total da linha incluindo opções).
    // Dividimos pela quantidade para obter o unitário "cheio".
    const qty = Number(it.quantity ?? 1) || 1;
    const total = Number(it.totalPrice ?? 0);
    const optionsPrice = Number(it.optionsPrice ?? 0);
    const customizationPrice = Number(it.customizationPrice ?? 0);
    const baseUnit = Number(it.unitPrice ?? it.price ?? 0);
    const unitFromTotal = total > 0 ? total / qty : baseUnit + optionsPrice + customizationPrice;
    return {
      product_name: it.name ?? "Item",
      unit_price: unitFromTotal,
      quantity: qty,
      notes: notesParts.length ? notesParts.join(" — ") : null,
    };
  });
}

async function handlePlaced(integration: any, ev: IHubEvent) {
  const od = ev.order_details ?? {};
  const customer = od.customer ?? {};
  
  const total = od.total ?? {};
  const orderType = mapOrderType(od);
  const phone = formatIfoodPhone(customer);

  // Avoid duplicates
  const { data: existing } = await supabase
    .from("orders")
    .select("id")
    .eq("restaurant_id", integration.restaurant_id)
    .eq("external_source", "ifood")
    .eq("external_order_id", ev.orderId)
    .maybeSingle();
  if (existing) return existing.id;

  // iFood payload v2: endereço fica em delivery.deliveryAddress / takeout.takeoutAddress
  const addr =
    od?.delivery?.deliveryAddress ??
    od?.deliveryAddress ??
    od?.takeout?.takeoutAddress ??
    od?.takeoutAddress ??
    {};

  const subtotal = Number(total.subTotal ?? total.subtotal ?? 0);
  const deliveryFee = Number(total.deliveryFee ?? od?.delivery?.deliveryFee ?? 0);
  const benefits = Number(total.benefits ?? 0);
  const additionalFees = Number(total.additionalFees ?? 0);
  const orderAmount = Number(total.orderAmount ?? subtotal + deliveryFee + additionalFees - benefits);

  // Breakdown de subsídio (cupons): IFOOD vs MERCHANT
  let ifoodSubsidy = 0;
  let merchantSubsidy = 0;
  const benefitsArr = Array.isArray(od?.benefits) ? od.benefits : [];
  for (const b of benefitsArr) {
    const sv = Array.isArray(b?.sponsorshipValues) ? b.sponsorshipValues : [];
    for (const s of sv) {
      const name = String(s?.name ?? "").toUpperCase();
      const v = Number(s?.value ?? 0);
      if (!isFinite(v) || v <= 0) continue;
      if (name === "IFOOD") ifoodSubsidy += v;
      else if (name === "MERCHANT") merchantSubsidy += v;
    }
  }
  const changeFor = extractChangeFor(od);
  const lat = addr?.coordinates?.latitude ?? addr?.latitude ?? null;
  const lng = addr?.coordinates?.longitude ?? addr?.longitude ?? null;

  const { data, error } = await supabase
    .from("orders")
    .insert({
      restaurant_id: integration.restaurant_id,
      customer_name: customer.name ?? "Cliente iFood",
      customer_phone: phone || "—",
      address_street: orderType === "delivery" ? (addr.streetName ?? null) : null,
      address_number: orderType === "delivery" ? (addr.streetNumber ?? null) : null,
      address_neighborhood: orderType === "delivery" ? (addr.neighborhood ?? null) : null,
      address_city: orderType === "delivery" ? (addr.city ?? null) : null,
      address_state: orderType === "delivery" ? (addr.state ?? null) : null,
      address_cep: orderType === "delivery" ? (addr.postalCode ?? null) : null,
      address_complement: orderType === "delivery" ? (addr.complement ?? null) : null,
      address_notes: orderType === "delivery" ? (addr.reference ?? addr.formattedAddress ?? null) : null,
      delivery_latitude: orderType === "delivery" ? lat : null,
      delivery_longitude: orderType === "delivery" ? lng : null,
      subtotal,
      delivery_fee: deliveryFee,
      service_fee: additionalFees,
      discount: benefits,
      total: orderAmount,
      payment_method: mapPayment(od),
      change_for: changeFor,
      status: "pending",
      order_type: orderType,
      external_source: "ifood",
      external_order_id: ev.orderId,
      external_display_id: od.displayId ?? null,
      ifood_subsidy: ifoodSubsidy,
      merchant_subsidy: merchantSubsidy,
    })
    .select("id")
    .single();
  if (error) throw error;

  // Insert order_items
  const items = buildItemsForOrderItems(od);
  if (items.length) {
    const rows = items.map((it) => ({ order_id: data.id, ...it }));
    await supabase.from("order_items").insert(rows);
  }
  return data.id;
}

async function handleStatus(integration: any, ev: IHubEvent) {
  const newStatus = mapStatus(ev.fullCode);
  if (!newStatus || !ev.orderId) return;
  // Busca status atual para evitar regressão (ex.: CONFIRMED chegando depois de DISPATCHED)
  const { data: cur } = await supabase
    .from("orders")
    .select("status")
    .eq("restaurant_id", integration.restaurant_id)
    .eq("external_source", "ifood")
    .eq("external_order_id", ev.orderId)
    .maybeSingle();
  if (cur && newStatus !== "cancelled") {
    const curRank = STATUS_ORDER[cur.status] ?? -1;
    const newRank = STATUS_ORDER[newStatus] ?? -1;
    if (newRank < curRank) return; // ignora evento que regrediria o status
  }
  await supabase
    .from("orders")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("restaurant_id", integration.restaurant_id)
    .eq("external_source", "ifood")
    .eq("external_order_id", ev.orderId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const signature = req.headers.get("x-ifood-hub-signature") ?? "";
  if (!signature) {
    return new Response(JSON.stringify({ error: "Missing signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let ev: IHubEvent;
  try {
    ev = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let integration: any = null;
  if (ev.merchantId) {
    const { data } = await supabase
      .from("ihub_integrations")
      .select("*")
      .eq("secret_token", signature)
      .eq("merchant_id", ev.merchantId)
      .maybeSingle();
    integration = data;
  }
  if (!integration) {
    const { data } = await supabase
      .from("ihub_integrations")
      .select("*")
      .eq("secret_token", signature)
      .is("merchant_id", null)
      .limit(1)
      .maybeSingle();
    integration = data;
  }

  if (!integration) {
    return new Response(JSON.stringify({ error: "Unauthorized or merchant not linked" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: logged } = await supabase
    .from("ihub_events")
    .insert({
      integration_id: integration.id,
      restaurant_id: integration.restaurant_id,
      event_id: ev.id ?? null,
      code: ev.code ?? null,
      full_code: ev.fullCode ?? null,
      order_id: ev.orderId ?? null,
      merchant_id: ev.merchantId ?? null,
      payload: ev,
    })
    .select("id")
    .single();

  let processError: string | null = null;
  try {
    if (!integration.enabled) {
      processError = "integration_disabled";
    } else if (ev.code === "PLC" || ev.fullCode === "PLACED") {
      await handlePlaced(integration, ev);
    } else {
      await handleStatus(integration, ev);
    }
  } catch (e: any) {
    processError = e?.message ?? String(e);
    console.error("ihub-webhook process error", processError);
  }

  await supabase
    .from("ihub_integrations")
    .update({
      last_event_at: new Date().toISOString(),
      last_event_code: ev.fullCode ?? ev.code ?? null,
      merchant_id: integration.merchant_id ?? ev.merchantId ?? null,
    })
    .eq("id", integration.id);

  if (logged?.id) {
    await supabase
      .from("ihub_events")
      .update({ processed: !processError, error: processError })
      .eq("id", logged.id);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
