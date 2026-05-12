// Forward action commands (confirm, dispatch, cancel, etc.) to iHub /api/ifood/action
// Caller must be authenticated; we identify the integration by restaurant_id (or order_id).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const IHUB_BASE = "https://ihub.arcn.com.br/api";

type ActionBody = {
  orderId?: string;          // local order id (uuid) OR external id
  externalOrderId?: string;  // iFood order id
  restaurantId?: string;
  action: "confirm" | "startPreparation" | "readyToPickup" | "dispatch" | "cancel";
  cancelCode?: string;
  cancelReason?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) {
    return new Response(JSON.stringify({ ok: false, error: "Missing auth" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: userData } = await supa.auth.getUser();
  if (!userData?.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: ActionBody;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!body.action) {
    return new Response(JSON.stringify({ error: "action required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Resolve restaurant + iFood order id from local order, if needed
  let restaurantId = body.restaurantId ?? null;
  let externalOrderId = body.externalOrderId ?? null;
  if (body.orderId && (!restaurantId || !externalOrderId)) {
    const { data: order } = await admin
      .from("orders")
      .select("restaurant_id, external_order_id, external_source")
      .eq("id", body.orderId)
      .maybeSingle();
    if (!order || order.external_source !== "ifood") {
      return new Response(JSON.stringify({ error: "Order is not from iFood" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    restaurantId = order.restaurant_id;
    externalOrderId = order.external_order_id;
  }

  if (!restaurantId || !externalOrderId) {
    return new Response(JSON.stringify({ error: "Missing restaurantId/externalOrderId" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify the user manages this restaurant (uses their JWT through 'supa' client)
  const { data: canSee } = await supa
    .from("ihub_integrations")
    .select("id, secret_token, domain, merchant_id, enabled")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();
  if (!canSee) {
    return new Response(JSON.stringify({ error: "Integration not found or no access" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!canSee.enabled) {
    return new Response(JSON.stringify({ error: "Integration disabled" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!canSee.merchant_id) {
    return new Response(JSON.stringify({ error: "Merchant not linked" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const payload: Record<string, unknown> = {
    domain: canSee.domain,
    merchantId: canSee.merchant_id,
    orderId: externalOrderId,
    action: body.action,
  };
  if (body.action === "cancel") {
    payload.cancelCode = body.cancelCode ?? "501";
    payload.cancelReason = body.cancelReason ?? "Cancelado pelo restaurante";
  }

  const resp = await fetch(`${IHUB_BASE}/ifood/action`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${canSee.secret_token}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await resp.text();
  let parsed: any = text;
  try { parsed = JSON.parse(text); } catch {}

  if (!resp.ok) {
    console.error("iHub action error", resp.status, "payload:", payload, "response:", parsed);
    // Return 200 so the supabase-js client can read the body (it treats non-2xx as FunctionsHttpError)
    return new Response(JSON.stringify({
      ok: false,
      error: parsed?.message ?? parsed?.error ?? "Falha ao enviar ação para o iFood",
      ihub_status: resp.status,
      detail: parsed,
    }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, ihub: parsed }), {
    status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
  } catch (e: any) {
    console.error("ifood-action unexpected error", e);
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? "Erro inesperado" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
