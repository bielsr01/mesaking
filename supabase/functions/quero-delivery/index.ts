// Edge function for Quero Delivery integration.
// Actions: verify (test credentials), sync (poll new orders and import).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function normalizePhone(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  // Remove country code 55 if present and resulting number has 10 or 11 digits (BR)
  let n = digits;
  if (n.startsWith("55") && (n.length === 12 || n.length === 13)) n = n.slice(2);
  if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
  return n;
}

function authHeader(token: string) {
  const t = token.trim();
  if (/^basic\s/i.test(t) || /^bearer\s/i.test(t)) return t;
  return `Basic ${t}`;
}

function mapStatus(s: string): string {
  switch (s) {
    case "CREATED":
    case "CONFIRMED":
      return "pending";
    case "DISPATCHED":
      return "out_for_delivery";
    case "READY_FOR_PICKUP":
    case "PICKUP_AREA_ASSIGNED":
      return "awaiting_pickup";
    case "CONCLUDED":
      return "delivered";
    case "CANCELLED":
      return "cancelled";
    default:
      return "pending";
  }
}

function mapPayment(m?: string): string {
  switch ((m || "").toUpperCase()) {
    case "CASH":
      return "cash";
    case "CREDIT":
    case "DEBIT":
      return "card_on_delivery";
    default:
      return "pix";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authz = req.headers.get("Authorization") || "";
    if (!authz.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const token0 = authz.replace(/^Bearer\s+/i, "").trim();
    if (!token0) return json({ error: "unauthorized", details: "Missing bearer token" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: claimsRes, error: userErr } = await admin.auth.getClaims(token0);
    const userId = claimsRes?.claims?.sub;
    if (userErr || !userId) {
      console.error("auth getClaims error:", userErr);
      return json({ error: "unauthorized", details: userErr?.message }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const { action, restaurantId, apiUrl, placeId, token } = body || {};

    if (!restaurantId) return json({ error: "restaurantId required" }, 400);

    // Verify caller is manager/owner
    const { data: isMgr } = await admin.rpc("is_restaurant_manager", {
      _user_id: userId,
      _restaurant_id: restaurantId,
    });
    if (!isMgr) {
      const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", userId);
      const isAdmin = roles?.some((r: any) => r.role === "master_admin");
      if (!isAdmin) return json({ error: "forbidden" }, 403);
    }

    // Resolve credentials
    let cfgApiUrl: string = apiUrl || "https://api.quero.io";
    let cfgPlaceId: string | undefined = placeId;
    let cfgToken: string | undefined = token;

    if (!cfgPlaceId || !cfgToken) {
      const { data: cfg } = await admin
        .from("quero_integrations")
        .select("api_url, place_id, auth_token")
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      if (cfg) {
        cfgApiUrl = cfg.api_url || cfgApiUrl;
        cfgPlaceId = cfgPlaceId || cfg.place_id;
        cfgToken = cfgToken || cfg.auth_token;
      }
    }

    if (!cfgPlaceId || !cfgToken) return json({ error: "missing credentials" }, 400);

    const baseUrl = cfgApiUrl.replace(/\/$/, "");
    const headers = { Authorization: authHeader(cfgToken), "Content-Type": "application/json" };

    if (action === "verify") {
      const url = `${baseUrl}/orders/events:polling?placeId=${encodeURIComponent(cfgPlaceId)}`;
      const r = await fetch(url, { headers });
      const txt = await r.text();
      if (!r.ok) {
        return json({ ok: false, status: r.status, message: txt.slice(0, 300) }, 200);
      }
      return json({ ok: true, status: r.status });
    }

    if (action === "update_status") {
      // newStatus: pending|preparing|out_for_delivery|awaiting_pickup|delivered|cancelled
      const { newStatus, orderId: localOrderId } = body || {};
      if (!localOrderId || !newStatus) return json({ error: "orderId and newStatus required" }, 400);

      const { data: ord } = await admin
        .from("orders")
        .select("external_order_id, external_source, order_type")
        .eq("id", localOrderId)
        .maybeSingle();
      if (!ord || ord.external_source !== "quero" || !ord.external_order_id) {
        return json({ ok: true, skipped: true });
      }

      const orderId = ord.external_order_id;
      const isPickup = ord.order_type === "pickup";

      const endpointByStatus: Record<string, string | null> = {
        preparing: `/orders/${orderId}/confirm`,
        out_for_delivery: `/orders/${orderId}/dispatch`,
        awaiting_pickup: `/orders/${orderId}/ready-fo-pickup`,
        delivered: `/orders/${orderId}/delivery-completed`,
        cancelled: `/orders/${orderId}/request-cancellation`,
      };

      const path = endpointByStatus[newStatus];
      if (!path) return json({ ok: true, skipped: true });

      const r = await fetch(`${baseUrl}${path}?placeId=${encodeURIComponent(cfgPlaceId)}`, { method: "POST", headers });
      const txt = await r.text();
      if (!r.ok) {
        return json({ ok: false, status: r.status, message: txt.slice(0, 400) }, 200);
      }
      return json({ ok: true, status: r.status, isPickup });
    }

    if (action === "sync") {
      // Poll new orders (sem filtro de eventType para importar qualquer status)
      const pollUrl = `${baseUrl}/orders/events:polling?placeId=${encodeURIComponent(cfgPlaceId)}`;
      const pr = await fetch(pollUrl, { headers });
      if (!pr.ok) {
        const t = await pr.text();
        await admin.from("quero_integrations").update({ last_status: `poll_error:${pr.status}` }).eq("restaurant_id", restaurantId);
        return json({ ok: false, status: pr.status, message: t.slice(0, 300) }, 200);
      }
      const events: any[] = await pr.json().catch(() => []);
      let imported = 0;

      for (const ev of Array.isArray(events) ? events : []) {
        const orderId: string | undefined = ev?.orderId;
        if (!orderId) continue;

        // If already imported, sync status from Quero (external -> local)
        const { data: existing } = await admin
          .from("orders")
          .select("id, status")
          .eq("restaurant_id", restaurantId)
          .eq("external_source", "quero")
          .eq("external_order_id", orderId)
          .maybeSingle();
        if (existing) {
          const newStatus = mapStatus(ev?.status || "");
          if (newStatus && newStatus !== existing.status) {
            await admin
              .from("orders")
              .update({ status: newStatus, updated_at: new Date().toISOString() })
              .eq("id", existing.id);
          }
          continue;
        }

        // Fetch full order
        const detailUrl = `${baseUrl}/orders?placeId=${encodeURIComponent(cfgPlaceId)}&orderId=${encodeURIComponent(orderId)}`;
        const dr = await fetch(detailUrl, { headers });
        if (!dr.ok) continue;
        const detail = await dr.json().catch(() => null);
        if (!detail) continue;

        const items: any[] = Array.isArray(detail.items) ? detail.items : [];
        const subtotal = Number(detail?.total?.itemsPrice?.value ?? 0);
        const total = Number(detail?.total?.orderAmount?.value ?? 0);
        const otherFees = Number(detail?.total?.otherFees?.value ?? 0);
        const discount = Number(detail?.total?.discount?.value ?? 0);
        const isDelivery = (detail?.type || "").toUpperCase() === "DELIVERY";
        const addr = detail?.delivery?.deliveryAddress || {};
        const pmMethod = detail?.payments?.methods?.[0]?.method;
        const changeFor = detail?.payments?.methods?.[0]?.changeFor;

        const { data: order, error: oErr } = await admin
          .from("orders")
          .insert({
            restaurant_id: restaurantId,
            customer_name: detail?.customer?.name || "Cliente Quero",
            customer_phone: normalizePhone(detail?.customer?.phone?.number),
            order_type: isDelivery ? "delivery" : "pickup",
            payment_method: mapPayment(pmMethod),
            change_for: changeFor ?? null,
            subtotal,
            total,
            delivery_fee: isDelivery ? otherFees : 0,
            service_fee: 0,
            discount,
            status: mapStatus(ev?.status || "CREATED"),
            external_source: "quero",
            external_order_id: orderId,
            address_cep: addr.postalCode || null,
            address_street: addr.street || null,
            address_number: addr.number || null,
            address_complement: addr.complement || null,
            address_neighborhood: addr.district || null,
            address_city: addr.city || null,
            address_state: addr.state || null,
            address_notes: detail?.extraInfo || null,
            delivery_latitude: addr?.coordinates?.latitude ?? null,
            delivery_longitude: addr?.coordinates?.longitude ?? null,
          })
          .select("id")
          .single();

        if (oErr || !order) continue;

        if (items.length) {
          await admin.from("order_items").insert(
            items.map((it: any) => ({
              order_id: order.id,
              product_name: it?.name || "Item",
              unit_price: Number(it?.unitPrice?.value ?? 0),
              quantity: Number(it?.quantity ?? 1),
              notes: it?.specialInstructions || null,
            })),
          );
        }
        imported++;
      }

      await admin
        .from("quero_integrations")
        .update({ last_sync_at: new Date().toISOString(), last_status: `ok:${imported}` })
        .eq("restaurant_id", restaurantId);

      return json({ ok: true, imported, total: events.length });
    }

    return json({ error: "unknown action" }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return json({ error: msg }, 500);
  }
});
