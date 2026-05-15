// iHub merchant linking helper
// Actions: generate-user-code, link-merchant
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const IHUB_BASE = "https://ihub.arcn.com.br/api";
const DELIVERY_CONFIRMED_CODES = ["CONCLUDED", "DELIVERY_DROP_CODE_VALIDATION_SUCCESS"];
const VERIFY_DELIVERY_WAIT_MS = 15_000;
const VERIFY_DELIVERY_POLL_MS = 500;

function normalizeDomain(domain: string | null | undefined) {
  return (domain || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
}

async function checkDeliveryConfirmed(params: {
  restaurantId: string;
  orderId?: string | null;
  externalOrderId: string;
}) {
  let orderQuery = supabase
    .from("orders")
    .select("id,status")
    .eq("restaurant_id", params.restaurantId)
    .eq("external_source", "ifood");

  orderQuery = params.orderId
    ? orderQuery.eq("id", params.orderId)
    : orderQuery.eq("external_order_id", params.externalOrderId);

  const { data: order } = await orderQuery.maybeSingle();
  if (order?.status === "delivered") return { confirmed: true, source: "order" };

  const { data: event } = await supabase
    .from("ihub_events")
    .select("full_code,code,created_at")
    .eq("restaurant_id", params.restaurantId)
    .eq("order_id", params.externalOrderId)
    .in("full_code", DELIVERY_CONFIRMED_CODES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (event && order?.id) {
    await supabase
      .from("orders")
      .update({ status: "delivered", updated_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("restaurant_id", params.restaurantId);
    return { confirmed: true, source: "event", eventCode: event.full_code ?? event.code };
  }

  return { confirmed: false };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token0 = authHeader.replace(/^Bearer\s+/i, "").trim();
  const { data: claimsRes, error: userErr } = await supabase.auth.getClaims(token0);
  const userId = claimsRes?.claims?.sub;
  if (userErr || !userId) {
    return new Response(JSON.stringify({ error: "Unauthorized", details: userErr?.message }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { action, restaurantId, authorizationCode, authorizationCodeVerifier, merchantId: manualMerchantId, orderId, externalOrderId, code } = body;
  if (!action || !restaurantId) {
    return new Response(JSON.stringify({ error: "Missing action or restaurantId" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: integration } = await supabase
    .from("ihub_integrations")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (!integration?.secret_token) {
    return new Response(JSON.stringify({ error: "Token iHub não configurado para este restaurante" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const domain = normalizeDomain(integration.domain);
  if (!domain) {
    return new Response(JSON.stringify({
      error: "Domínio não configurado",
      details: "Cadastre o domínio do seu sistema (ex.: app.meudelivery.com.br) — deve ser EXATAMENTE o mesmo domínio cadastrado no painel do iHub para este token.",
    }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = integration.secret_token;
  const authHdr = { "Authorization": `Bearer ${token}`, "Accept": "application/json" };

  try {
    if (action === "generate-user-code") {
      // Per docs: generate-user-code does NOT require a body — token identifies the client.
      const r = await fetch(`${IHUB_BASE}/auth/generate-user-code`, {
        method: "POST",
        headers: authHdr,
      });
      const text = await r.text();
      let data: any; try { data = JSON.parse(text); } catch { data = { raw: text }; }
       if (!r.ok) {
        console.error("ihub generate-user-code failed", { status: r.status, domain, data });
         return new Response(JSON.stringify({ ok: false, error: "iHub error", status: r.status, data, domain }), {
           status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
         });
       }
      return new Response(JSON.stringify({ ok: true, ...data }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "link-merchant") {
      if (!authorizationCode || !authorizationCodeVerifier) {
        return new Response(JSON.stringify({ error: "authorizationCode e authorizationCodeVerifier são obrigatórios" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!manualMerchantId) {
        return new Response(JSON.stringify({ error: "merchantId é obrigatório" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const r = await fetch(`${IHUB_BASE}/auth/link-merchant`, {
        method: "POST",
        headers: { ...authHdr, "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          authorizationCode,
          authorizationCodeVerifier,
          merchantId: manualMerchantId,
        }),
      });
      const text = await r.text();
      let data: any; try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (!r.ok) {
        console.error("ihub link-merchant failed", {
          status: r.status,
          domain,
          authorizationCodeLength: String(authorizationCode).trim().length,
          authorizationCodeVerifierLength: String(authorizationCodeVerifier).trim().length,
          data,
        });
        const message = data?.error === "No merchants found for this token on iFood API"
          ? "O iFood autorizou o código, mas a conta usada no portal não retornou nenhuma loja/merchant para a API. Confirme se o login no portal do iFood é o dono/gestor da loja e se essa loja está liberada para integrações/API."
          : data?.message ?? data?.error ?? "Erro ao vincular merchant no iHub";
        return new Response(JSON.stringify({
          ok: false,
          error: message,
          status: r.status,
          data,
          debug: { domain },
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const merchantId = data?.merchant?.merchant_id ?? data?.ifood_details?.id ?? manualMerchantId ?? null;
      const merchantName = data?.ifood_details?.name ?? null;
      if (merchantId) {
        await supabase
          .from("ihub_integrations")
          .update({ merchant_id: merchantId, merchant_name: merchantName })
          .eq("id", integration.id);
      }
      return new Response(JSON.stringify({ ok: true, merchantId, merchantName, ...data }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "verify-delivery-code") {
      if (!externalOrderId || !code) {
        return new Response(JSON.stringify({ ok: false, error: "externalOrderId e code são obrigatórios" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (!integration.merchant_id) {
        return new Response(JSON.stringify({ ok: false, error: "Loja iFood não vinculada a este restaurante" }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Idempotência: se o pedido ou webhook já confirmou a entrega, não chama a API de novo.
      const alreadyConfirmed = await checkDeliveryConfirmed({ restaurantId, orderId, externalOrderId });
      if (alreadyConfirmed.confirmed) {
        return new Response(JSON.stringify({ ok: true, alreadyDelivered: true, confirmation: alreadyConfirmed }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const r = await fetch(`${IHUB_BASE}/orders/verify-delivery-code`, {
        method: "POST",
        headers: { ...authHdr, "Content-Type": "application/json" },
        body: JSON.stringify({
          domain,
          merchantId: integration.merchant_id,
          orderId: externalOrderId,
          code: String(code).trim(),
        }),
      });
      const text = await r.text();
      let data: any; try { data = JSON.parse(text); } catch { data = { raw: text }; }
      if (!r.ok || data?.success === false) {
        console.error("ihub verify-delivery-code failed", { status: r.status, data });
        // O iHub pode retornar 500 "Failed to verify delivery code" mesmo depois do iFood
        // aceitar o código e enviar DDCS/CONCLUDED. Nesse caso, o webhook é a fonte de verdade.
        const deadline = Date.now() + VERIFY_DELIVERY_WAIT_MS;
        while (Date.now() < deadline) {
          await new Promise((res) => setTimeout(res, VERIFY_DELIVERY_POLL_MS));
          const confirmed = await checkDeliveryConfirmed({ restaurantId, orderId, externalOrderId });
          if (confirmed.confirmed) {
            return new Response(JSON.stringify({ ok: true, viaWebhook: true, confirmation: confirmed, ihub_status: r.status }), {
              status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
        return new Response(JSON.stringify({
          ok: false,
          error: data?.message ?? data?.error ?? "Código de entrega inválido",
          status: r.status,
          data,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Marca pedido como entregue
      await supabase
        .from("orders")
        .update({ status: "delivered" })
        .eq("id", orderId)
        .eq("restaurant_id", restaurantId);
      return new Response(JSON.stringify({ ok: true, ...data }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "test-connection") {
      if (!integration.merchant_id) {
        return new Response(JSON.stringify({ ok: false, error: "Loja iFood não vinculada — gere o User Code e conclua a vinculação no portal do iFood." }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 1) Confirma que o vínculo deste restaurante está completo.
      const linkOk = !!(integration.secret_token && integration.domain && integration.merchant_id);

      // 2) Verifica se o iHub está ENVIANDO eventos para ESTE merchant (sinal real de conexão).
      const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentEvents, count: recentCount } = await supabase
        .from("ihub_events")
        .select("id, code, created_at", { count: "exact" })
        .eq("restaurant_id", restaurantId)
        .eq("merchant_id", integration.merchant_id)
        .gte("created_at", sinceIso)
        .order("created_at", { ascending: false })
        .limit(1);

      const { data: lastEverArr } = await supabase
        .from("ihub_events")
        .select("created_at")
        .eq("restaurant_id", restaurantId)
        .eq("merchant_id", integration.merchant_id)
        .order("created_at", { ascending: false })
        .limit(1);
      const lastEverAt = lastEverArr?.[0]?.created_at ?? null;

      if (linkOk && (recentCount ?? 0) > 0) {
        return new Response(JSON.stringify({
          ok: true,
          merchantId: integration.merchant_id,
          merchantName: integration.merchant_name,
          domain,
          recentEvents7d: recentCount,
          lastEventAt: recentEvents?.[0]?.created_at ?? lastEverAt,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (linkOk && lastEverAt) {
        return new Response(JSON.stringify({
          ok: true,
          warning: "Vinculado, mas sem eventos nos últimos 7 dias.",
          merchantId: integration.merchant_id,
          merchantName: integration.merchant_name,
          domain,
          lastEventAt: lastEverAt,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (linkOk) {
        return new Response(JSON.stringify({
          ok: true,
          warning: "Restaurante vinculado, aguardando o primeiro evento do iFood (faça um pedido teste).",
          merchantId: integration.merchant_id,
          merchantName: integration.merchant_name,
          domain,
        }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({
        ok: false,
        error: "Configuração incompleta (token, domínio ou merchant ausente).",
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
