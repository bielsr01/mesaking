// Quero Delivery polling worker.
// Pode ser chamado pelo cron (sem body) para rodar todas as integrações habilitadas,
// ou com { restaurantId } para forçar polling de um restaurante específico (uso interno).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const QUERO_BASE = "https://api.quero.io";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Mapeia status do Quero -> status interno
function mapStatus(s?: string): string | null {
  switch (s) {
    case "CREATED": return "pending";
    case "CONFIRMED": return "preparing";
    case "DISPATCHED": return "out_for_delivery";
    case "READY_FOR_PICKUP":
    case "PICKUP_AREA_ASSIGNED": return "awaiting_pickup";
    case "CONCLUDED": return "delivered";
    case "CANCELLED": return "cancelled";
    default: return null;
  }
}

const STATUS_ORDER: Record<string, number> = {
  pending: 0, accepted: 1, preparing: 2,
  awaiting_pickup: 3, out_for_delivery: 3,
  delivered: 4, cancelled: 5,
};

function mapOrderType(type?: string): "delivery" | "pickup" {
  return String(type ?? "DELIVERY").toUpperCase() === "TAKEOUT" ? "pickup" : "delivery";
}

function mapPayment(method?: string, type?: string): string {
  const m = String(method ?? "").toUpperCase();
  const t = String(type ?? "").toUpperCase();
  if (t === "PREPAID") return "online";
  if (m === "CASH") return "cash";
  if (m === "CREDIT" || m === "DEBIT") return "card_on_delivery";
  return "card_on_delivery";
}

function buildItems(od: any) {
  const items = Array.isArray(od?.items) ? od.items : [];
  const collect = (s: any, depth: number, acc: string[]) => {
    const qty = s.quantity ? `${s.quantity}× ` : "";
    const indent = depth > 0 ? "  ".repeat(depth) + "↳ " : "";
    acc.push(`${indent}${qty}${s.name ?? ""}`.trim());
    if (Array.isArray(s.options)) s.options.forEach((c: any) => collect(c, depth + 1, acc));
  };
  return items.map((it: any) => {
    const subs: string[] = [];
    if (Array.isArray(it.options)) it.options.forEach((s: any) => collect(s, 0, subs));
    const noteParts: string[] = [];
    if (subs.length) noteParts.push(subs.join(" • "));
    if (it.specialInstructions) noteParts.push(it.specialInstructions);
    const qty = Number(it.quantity ?? 1) || 1;
    const total = Number(it.totalPrice?.value ?? 0);
    const baseUnit = Number(it.unitPrice?.value ?? 0);
    const optsPrice = Number(it.optionsPrice?.value ?? 0);
    const unit = total > 0 ? total / qty : baseUnit + optsPrice;
    return {
      product_name: it.name ?? "Item",
      unit_price: unit,
      quantity: qty,
      notes: noteParts.length ? noteParts.join(" — ") : null,
    };
  });
}

async function queroFetch(path: string, token: string): Promise<any> {
  const url = `${QUERO_BASE}${path}`;
  const resp = await fetch(url, {
    headers: { authorization: token.startsWith("Basic ") ? token : `Basic ${token}`, accept: "application/json" },
  });
  const text = await resp.text();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch {}
  if (!resp.ok) throw new Error(`Quero ${resp.status}: ${typeof parsed === "string" ? parsed : JSON.stringify(parsed).slice(0, 300)}`);
  return parsed;
}

async function ingestOrder(integration: any, ev: any) {
  const orderId = ev.orderId as string | undefined;
  if (!orderId) return;
  const status = mapStatus(ev.status);

  // Já existe?
  const { data: existing } = await supabase
    .from("orders")
    .select("id, status")
    .eq("restaurant_id", integration.restaurant_id)
    .eq("external_source", "quero")
    .eq("external_order_id", orderId)
    .maybeSingle();

  if (existing) {
    if (status && status !== existing.status) {
      const cur = STATUS_ORDER[existing.status] ?? -1;
      const nxt = STATUS_ORDER[status] ?? -1;
      if (status === "cancelled" || nxt >= cur) {
        await supabase.from("orders").update({ status, updated_at: new Date().toISOString() }).eq("id", existing.id);
      }
    }
    return;
  }

  // Novo pedido — busca detalhe
  const detail = await queroFetch(
    `/orders?placeId=${encodeURIComponent(integration.place_id)}&orderId=${encodeURIComponent(orderId)}`,
    integration.token,
  );
  const od = detail?.data ?? detail ?? {};
  const customer = od.customer ?? {};
  const total = od.total ?? {};
  const orderType = mapOrderType(od.type);
  const addr = od?.delivery?.deliveryAddress ?? {};
  const subtotal = Number(total?.itemsPrice?.value ?? 0);
  const deliveryFee = Number(
    (od?.otherFees ?? []).find((f: any) => f.type === "DELIVERY_FEE")?.price?.value ?? 0,
  );
  const otherFees = Number(total?.otherFees?.value ?? 0);
  const discount = Number(total?.discount?.value ?? 0);
  const orderAmount = Number(total?.orderAmount?.value ?? subtotal + otherFees - discount);
  const methods = od?.payments?.methods ?? [];
  const m0 = Array.isArray(methods) && methods.length ? methods[0] : null;

  const phoneNumber = customer?.phone?.number ?? "";

  const { data: inserted, error } = await supabase.from("orders").insert({
    restaurant_id: integration.restaurant_id,
    customer_name: customer?.name ?? "Cliente Quero",
    customer_phone: phoneNumber || "—",
    address_street: orderType === "delivery" ? (addr.street ?? null) : null,
    address_number: orderType === "delivery" ? (addr.number ?? null) : null,
    address_neighborhood: orderType === "delivery" ? (addr.district ?? null) : null,
    address_city: orderType === "delivery" ? (addr.city ?? null) : null,
    address_state: orderType === "delivery" ? (addr.state ?? null) : null,
    address_cep: orderType === "delivery" ? (addr.postalCode ?? null) : null,
    address_complement: orderType === "delivery" ? (addr.complement ?? null) : null,
    address_notes: orderType === "delivery" ? (addr.reference ?? addr.formattedAddress ?? null) : null,
    delivery_latitude: orderType === "delivery" ? (addr?.coordinates?.latitude ?? null) : null,
    delivery_longitude: orderType === "delivery" ? (addr?.coordinates?.longitude ?? null) : null,
    subtotal,
    delivery_fee: deliveryFee,
    service_fee: Math.max(0, otherFees - deliveryFee),
    discount,
    total: orderAmount,
    payment_method: mapPayment(m0?.method, m0?.type),
    change_for: m0?.changeFor ? Number(m0.changeFor) : null,
    status: status ?? "pending",
    order_type: orderType,
    external_source: "quero",
    external_order_id: orderId,
    external_display_id: od.displayId ?? ev.orderCode ?? null,
  }).select("id").single();
  if (error) throw error;

  const items = buildItems(od);
  if (items.length) {
    await supabase.from("order_items").insert(items.map((it) => ({ order_id: inserted.id, ...it })));
  }

  // Seed order_status_history with any prior Quero events for this order
  // (status changes that happened before the order was created locally).
  const { data: priorEvents } = await supabase
    .from("quero_events")
    .select("status, created_at")
    .eq("restaurant_id", integration.restaurant_id)
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (priorEvents && priorEvents.length) {
    const seen = new Set<string>();
    const rows: { order_id: string; status: string; changed_at: string; source: string }[] = [];
    for (const ev2 of priorEvents) {
      const mapped = mapStatus(ev2.status);
      if (!mapped || seen.has(mapped)) continue;
      seen.add(mapped);
      rows.push({ order_id: inserted.id, status: mapped, changed_at: ev2.created_at, source: "quero" });
    }
    if (rows.length) {
      // Trigger already inserted current status; avoid duplicates by deleting and reinserting in order.
      await supabase.from("order_status_history").delete().eq("order_id", inserted.id);
      await supabase.from("order_status_history").insert(rows);
    }
  }
}

// Reconcilia pedidos Quero ainda "abertos" no nosso banco contra o detalhe na API.
// Necessário porque o endpoint /orders/events:polling deixa de retornar o pedido
// quando ele é finalizado/cancelado pelo lado da plataforma — sem isso o status
// fica preso (ex.: out_for_delivery) mesmo após cancelamento na Quero.
const ACTIVE_LOCAL_STATUSES = ["pending", "accepted", "preparing", "awaiting_pickup", "out_for_delivery"];

async function reconcileOpenOrders(integration: any) {
  const { data: openOrders } = await supabase
    .from("orders")
    .select("id, status, external_order_id")
    .eq("restaurant_id", integration.restaurant_id)
    .eq("external_source", "quero")
    .in("status", ACTIVE_LOCAL_STATUSES)
    .order("created_at", { ascending: false })
    .limit(50);
  if (!openOrders?.length) return 0;

  let updates = 0;
  for (const o of openOrders) {
    if (!o.external_order_id) continue;
    try {
      const detail = await queroFetch(
        `/orders?placeId=${encodeURIComponent(integration.place_id)}&orderId=${encodeURIComponent(o.external_order_id)}`,
        integration.token,
      );
      const od = detail?.data ?? detail ?? {};
      const remoteStatus = od?.status ?? od?.orderStatus ?? od?.lastStatus ?? null;
      console.log("[quero-poll] reconcile", o.external_order_id, "local=", o.status, "remote=", remoteStatus, "keys=", Object.keys(od ?? {}).join(","));
      const mapped = mapStatus(remoteStatus);
      if (!mapped || mapped === o.status) continue;
      const cur = STATUS_ORDER[o.status] ?? -1;
      const nxt = STATUS_ORDER[mapped] ?? -1;
      if (mapped === "cancelled" || nxt >= cur) {
        await supabase.from("orders")
          .update({ status: mapped, updated_at: new Date().toISOString() })
          .eq("id", o.id);
        // Loga como evento sintético para auditoria
        await supabase.from("quero_events").insert({
          integration_id: integration.id,
          restaurant_id: integration.restaurant_id,
          order_id: o.external_order_id,
          status: remoteStatus,
          payload: { source: "reconcile", status: remoteStatus, orderId: o.external_order_id },
          processed: true,
        });
        updates++;
      }
    } catch (e: any) {
      console.error("[quero-poll] reconcile error", o.external_order_id, e?.message ?? e);
    }
  }
  return updates;
}

async function pollOne(integration: any) {
  const events = await queroFetch(
    `/orders/events:polling?placeId=${encodeURIComponent(integration.place_id)}`,
    integration.token,
  );
  const list: any[] = Array.isArray(events) ? events : Array.isArray(events?.data) ? events.data : [];
  let lastCode: string | null = null;
  for (const ev of list) {
    const { data: logged } = await supabase.from("quero_events").insert({
      integration_id: integration.id,
      restaurant_id: integration.restaurant_id,
      order_id: ev.orderId ?? null,
      order_code: ev.orderCode ?? null,
      status: ev.status ?? null,
      payload: ev,
    }).select("id").single();

    let err: string | null = null;
    try {
      await ingestOrder(integration, ev);
    } catch (e: any) {
      err = e?.message ?? String(e);
      console.error("[quero-poll] ingest error", err);
    }
    if (logged?.id) {
      await supabase.from("quero_events").update({ processed: !err, error: err }).eq("id", logged.id);
    }
    lastCode = ev.status ?? lastCode;
  }
  // Reconcilia pedidos abertos contra a API da Quero (pega cancelamentos que
  // não vieram via polling).
  let reconciled = 0;
  try { reconciled = await reconcileOpenOrders(integration); }
  catch (e: any) { console.error("[quero-poll] reconcile fatal", e?.message ?? e); }

  await supabase.from("quero_integrations").update({
    last_poll_at: new Date().toISOString(),
    last_event_at: list.length ? new Date().toISOString() : integration.last_event_at,
    last_event_code: lastCode ?? integration.last_event_code,
    last_status: "ok",
  }).eq("id", integration.id);
  return list.length + reconciled;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let restaurantId: string | null = null;
  try {
    const body = await req.json();
    restaurantId = body?.restaurantId ?? null;
  } catch { /* sem body = roda todos */ }

  let q = supabase.from("quero_integrations").select("*").eq("enabled", true);
  if (restaurantId) q = q.eq("restaurant_id", restaurantId);
  const { data: integrations, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];
  for (const integ of integrations ?? []) {
    try {
      const n = await pollOne(integ);
      results.push({ restaurant_id: integ.restaurant_id, events: n });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      console.error("[quero-poll] integration error", integ.id, msg);
      await supabase.from("quero_integrations").update({
        last_poll_at: new Date().toISOString(),
        last_status: msg.slice(0, 200),
      }).eq("id", integ.id);
      results.push({ restaurant_id: integ.restaurant_id, error: msg });
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
