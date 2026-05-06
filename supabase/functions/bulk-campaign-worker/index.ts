// Sequential sender for running bulk campaigns. Triggered by cron OR manual invoke.
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
async function evoFetch(apiUrl: string, path: string, apiKey: string, body: any) {
  const url = sanitizeBase(apiUrl) + path;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Find running campaigns
  const { data: campaigns } = await supabase
    .from("bulk_campaigns")
    .select("*")
    .eq("status", "running")
    .limit(20);

  const results: any[] = [];

  for (const c of campaigns ?? []) {
    // Pick integration
    let integrationQ = supabase.from("evolution_integrations").select("*").eq("enabled", true);
    integrationQ = c.is_admin ? integrationQ.eq("is_admin", true) : integrationQ.eq("restaurant_id", c.restaurant_id);
    const { data: integ } = await integrationQ.maybeSingle();
    if (!integ) {
      await supabase.from("bulk_campaigns").update({ status: "failed", finished_at: new Date().toISOString() }).eq("id", c.id);
      results.push({ id: c.id, error: "sem integração" });
      continue;
    }

    // Throttle: only send if enough time passed since last_run_at
    const interval = (c.interval_seconds ?? 8) * 1000;
    if (c.last_run_at && Date.now() - new Date(c.last_run_at).getTime() < interval) {
      results.push({ id: c.id, skipped: "interval" });
      continue;
    }

    // Pick next pending recipient
    const { data: rec } = await supabase
      .from("bulk_campaign_recipients")
      .select("*")
      .eq("campaign_id", c.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!rec) {
      await supabase.from("bulk_campaigns").update({
        status: "completed", finished_at: new Date().toISOString(),
      }).eq("id", c.id);
      results.push({ id: c.id, done: true });
      continue;
    }

    const number = normalizePhone(rec.phone);
    const personalized = (c.message_text || "").replace(/\{nome\}/gi, rec.name || "");
    const inst = encodeURIComponent(integ.instance_name);
    let r;
    try {
      if (c.media_url) {
        r = await evoFetch(integ.api_url, `/message/sendMedia/${inst}`, integ.api_key, {
          number, mediatype: "image", media: c.media_url, caption: personalized,
        });
      } else {
        r = await evoFetch(integ.api_url, `/message/sendText/${inst}`, integ.api_key, {
          number, text: personalized,
        });
      }
    } catch (e) {
      r = { ok: false, status: 0, body: (e as Error).message };
    }

    if (r.ok) {
      await supabase.from("bulk_campaign_recipients").update({
        status: "sent", sent_at: new Date().toISOString(),
      }).eq("id", rec.id);
      await supabase.from("bulk_campaigns").update({
        sent: (c.sent ?? 0) + 1, last_run_at: new Date().toISOString(),
      }).eq("id", c.id);
    } else {
      await supabase.from("bulk_campaign_recipients").update({
        status: "failed", error: `HTTP ${r.status}: ${String(r.body).slice(0, 200)}`,
      }).eq("id", rec.id);
      await supabase.from("bulk_campaigns").update({
        failed: (c.failed ?? 0) + 1, last_run_at: new Date().toISOString(),
      }).eq("id", c.id);
    }
    results.push({ id: c.id, recipient: rec.id, ok: r.ok });
  }

  return new Response(JSON.stringify({ ok: true, processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
