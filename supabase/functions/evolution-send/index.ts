// Evolution API helper: verify connection or send a single message
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function normalizePhone(p: string) {
  const d = (p || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55")) return d;
  return "55" + d;
}

function sanitizeBase(apiUrl: string) {
  return (apiUrl || "").replace(/\/+$/, "").replace(/\/manager$/i, "");
}
async function evoFetch(apiUrl: string, path: string, apiKey: string, body?: any, method = "POST") {
  const url = sanitizeBase(apiUrl) + path;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { action, integrationId, apiUrl, apiKey, instance, phone, text, mediaUrl } = await req.json();
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    let cfg = { apiUrl, apiKey, instance };
    if (integrationId) {
      const { data } = await supabase.from("evolution_integrations").select("*").eq("id", integrationId).maybeSingle();
      if (!data) throw new Error("Integração não encontrada");
      cfg = { apiUrl: data.api_url, apiKey: data.api_key, instance: data.instance_name };
    }
    if (!cfg.apiUrl || !cfg.apiKey || !cfg.instance) throw new Error("Credenciais incompletas");

    const inst = encodeURIComponent(cfg.instance);
    if (action === "verify") {
      const r = await evoFetch(cfg.apiUrl, `/instance/connectionState/${inst}`, cfg.apiKey, undefined, "GET");
      if (integrationId) {
        await supabase.from("evolution_integrations").update({
          last_status: r.ok ? (r.data?.instance?.state || "ok") : `erro ${r.status}`,
          last_check_at: new Date().toISOString(),
        }).eq("id", integrationId);
      }
      return new Response(JSON.stringify({ ok: r.ok, status: r.status, data: r.data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "send") {
      const number = normalizePhone(phone);
      if (!number) throw new Error("Telefone inválido");
      let r;
      if (mediaUrl) {
        r = await evoFetch(cfg.apiUrl, `/message/sendMedia/${inst}`, cfg.apiKey, {
          number,
          mediatype: "image",
          media: mediaUrl,
          caption: text || "",
        });
      } else {
        r = await evoFetch(cfg.apiUrl, `/message/sendText/${inst}`, cfg.apiKey, {
          number,
          text: text || "",
        });
      }
      return new Response(JSON.stringify({ ok: r.ok, status: r.status, data: r.data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Ação desconhecida");
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
