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

function normalizeDomain(domain: string | null | undefined) {
  return (domain || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
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

      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
