// iHub (iFood) webhook receiver
// URL: https://kcjrrnxsqdcgjqplgiku.supabase.co/functions/v1/ihub-webhook
// Configure this URL no painel do iHub (https://ihub.arcn.com.br)
// O iHub envia POST com o token secreto no header X-iFood-Hub-Signature.

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
function mapStatus(fullCode?: string): string | null {
  switch (fullCode) {
    case "PLACED": return "pending";
    case "CONFIRMED": return "accepted";
    case "PREPARATION_STARTED": return "preparing";
    case "READY_TO_PICKUP": return "ready";
    case "DISPATCHED": return "out_for_delivery";
    case "CONCLUDED": return "delivered";
    case "CANCELLED": return "cancelled";
    default: return null;
  }
}

async function handlePlaced(integration: any, ev: IHubEvent) {
  const od = ev.order_details ?? {};
  const customer = od.customer ?? {};
  const addr = od.deliveryAddress ?? {};
  const items = Array.isArray(od.items) ? od.items : [];
  const total = od.total ?? {};
  const phone = typeof customer.phone === "object" ? customer.phone?.number : customer.phone;

  // Avoid duplicates
  const { data: existing } = await supabase
    .from("orders")
    .select("id")
    .eq("restaurant_id", integration.restaurant_id)
    .eq("external_source", "ifood")
    .eq("external_id", ev.orderId)
    .maybeSingle();
  if (existing) return existing.id;

  const itemsJson = items.map((it: any) => ({
    name: it.name,
    quantity: it.quantity,
    price: Number(it.unitPrice ?? 0),
    total: Number(it.totalPrice ?? 0),
    observations: it.observations ?? null,
    subItems: it.subItems ?? [],
  }));

  const { data, error } = await supabase
    .from("orders")
    .insert({
      restaurant_id: integration.restaurant_id,
      customer_name: customer.name ?? "Cliente iFood",
      customer_phone: phone ?? null,
      address_street: addr.streetName ?? null,
      address_number: addr.streetNumber ?? null,
      address_neighborhood: addr.neighborhood ?? null,
      address_city: addr.city ?? null,
      address_state: addr.state ?? null,
      address_cep: addr.postalCode ?? null,
      address_complement: addr.complement ?? null,
      items: itemsJson,
      subtotal: Number(total.subTotal ?? 0),
      delivery_fee: Number(total.deliveryFee ?? 0),
      total: Number(total.orderAmount ?? 0),
      status: "pending",
      order_type: "delivery",
      external_source: "ifood",
      external_id: ev.orderId,
      external_display_id: od.displayId ?? null,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function handleStatus(integration: any, ev: IHubEvent) {
  const newStatus = mapStatus(ev.fullCode);
  if (!newStatus || !ev.orderId) return;
  await supabase
    .from("orders")
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("restaurant_id", integration.restaurant_id)
    .eq("external_source", "ifood")
    .eq("external_id", ev.orderId);
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

  // Parse body first — we need the merchantId to identify which restaurant
  let ev: IHubEvent;
  try {
    ev = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // The iHub secret_token is per-account (not per-restaurant).
  // The merchantId in the payload identifies which restaurant.
  // We accept any integration that:
  //   1) shares this secret_token (proves authenticity), AND
  //   2) matches the merchantId from the event.
  // If no merchant_id is mapped yet, fall back to the first integration with this token
  // and auto-link the merchant_id on first event.
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
    // Fallback: any integration with this token that hasn't been linked to a merchant yet
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

  // Log the raw event
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

  // Update integration last seen + auto-link merchantId if not yet set
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
