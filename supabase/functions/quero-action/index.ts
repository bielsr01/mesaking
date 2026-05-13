// Envia ações para o Quero Delivery (confirm, dispatch, ready-for-pickup, cancel).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const QUERO_BASE = "https://api.quero.io";

type Body = {
  orderId?: string;
  action: "confirm" | "dispatch" | "readyForPickup" | "deliveryCompleted" | "cancel";
  cancelReason?: string;
  cancelCode?: string;
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

    const body = await req.json() as Body;
    if (!body.orderId || !body.action) {
      return new Response(JSON.stringify({ error: "orderId and action required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: order } = await admin.from("orders")
      .select("restaurant_id, external_order_id, external_source")
      .eq("id", body.orderId).maybeSingle();
    if (!order || order.external_source !== "quero" || !order.external_order_id) {
      return new Response(JSON.stringify({ error: "Pedido não é do Quero Delivery" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: integ } = await supa.from("quero_integrations")
      .select("token, place_id, enabled")
      .eq("restaurant_id", order.restaurant_id).maybeSingle();
    if (!integ) {
      return new Response(JSON.stringify({ error: "Integração não encontrada" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!integ.enabled) {
      return new Response(JSON.stringify({ error: "Integração desativada" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const pathByAction: Record<string, string> = {
      confirm: `/orders/${order.external_order_id}/confirm`,
      dispatch: `/orders/${order.external_order_id}/dispatch`,
      readyForPickup: `/orders/${order.external_order_id}/ready-fo-pickup`,
      deliveryCompleted: `/orders/${order.external_order_id}/delivery-completed`,
      cancel: `/orders/${order.external_order_id}/request-cancellation`,
    };
    const path = pathByAction[body.action];
    if (!path) {
      return new Response(JSON.stringify({ error: "Ação inválida" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `${QUERO_BASE}${path}?placeId=${encodeURIComponent(integ.place_id)}`;
    const auth = integ.token.startsWith("Basic ") ? integ.token : `Basic ${integ.token}`;
    const init: RequestInit = {
      method: "POST",
      headers: { authorization: auth, "Content-Type": "application/json", accept: "application/json" },
    };
    if (body.action === "cancel") {
      init.body = JSON.stringify({
        reason: body.cancelReason ?? "Cancelado pelo restaurante",
        code: body.cancelCode ?? "INTERNAL_DIFFICULTIES_OF_THE_RESTAURANT",
        mode: "MANUAL",
      });
    }

    const resp = await fetch(url, init);
    const text = await resp.text();
    let parsed: any = text;
    try { parsed = JSON.parse(text); } catch {}
    if (!resp.ok) {
      console.error("[quero-action] error", resp.status, parsed);
      return new Response(JSON.stringify({
        ok: false,
        error: parsed?.error ?? parsed?.errors?.[0] ?? `Quero ${resp.status}`,
        quero_status: resp.status,
        detail: parsed,
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ ok: true, quero: parsed }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[quero-action] unexpected", e);
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? "Erro inesperado" }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
