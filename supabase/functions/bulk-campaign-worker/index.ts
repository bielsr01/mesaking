// Bulk campaign worker.
// Each invocation runs a loop (up to ~50s) processing pending recipients of running
// campaigns, respecting per-campaign interval_seconds and auto-pause rules.
// Cron triggers it every 30s; UI also kicks it on Play.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_RUN_MS = 50_000; // stay under edge function limit
const startedAt = Date.now();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const log: any[] = [];
  let processed = 0;

  // Loop until time runs out
  while (Date.now() - startedAt < MAX_RUN_MS) {
    const { data: campaigns } = await supabase
      .from("bulk_campaigns")
      .select("*")
      .eq("status", "running")
      .limit(20);

    if (!campaigns || campaigns.length === 0) break;

    let didWork = false;

    for (const c of campaigns) {
      if (Date.now() - startedAt >= MAX_RUN_MS) break;

      // Auto-resume if pause window expired
      if (c.paused_until && new Date(c.paused_until).getTime() <= Date.now()) {
        await supabase.from("bulk_campaigns")
          .update({ paused_until: null, sent_in_block: 0 })
          .eq("id", c.id);
        c.paused_until = null;
        c.sent_in_block = 0;
      }
      // Still paused?
      if (c.paused_until) { log.push({ id: c.id, waiting_pause: c.paused_until }); continue; }

      // Throttle by configured interval
      const interval = Math.max(1, Number(c.interval_seconds ?? 8)) * 1000;
      if (c.last_run_at && Date.now() - new Date(c.last_run_at).getTime() < interval) {
        continue;
      }

      // Integration
      let integQ = supabase.from("evolution_integrations").select("*").eq("enabled", true);
      integQ = c.is_admin ? integQ.eq("is_admin", true) : integQ.eq("restaurant_id", c.restaurant_id);
      const { data: integ } = await integQ.maybeSingle();
      if (!integ) {
        await supabase.from("bulk_campaigns")
          .update({ status: "failed", finished_at: new Date().toISOString() })
          .eq("id", c.id);
        log.push({ id: c.id, error: "no integration" });
        continue;
      }

      // Next pending recipient
      const { data: rec } = await supabase
        .from("bulk_campaign_recipients")
        .select("*")
        .eq("campaign_id", c.id)
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (!rec) {
        await supabase.from("bulk_campaigns")
          .update({ status: "completed", finished_at: new Date().toISOString() })
          .eq("id", c.id);
        log.push({ id: c.id, done: true });
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

      const now = new Date().toISOString();
      if (r.ok) {
        const newSent = (c.sent ?? 0) + 1;
        const newBlock = (c.sent_in_block ?? 0) + 1;
        const patch: any = { sent: newSent, last_run_at: now, sent_in_block: newBlock };
        // Auto pause check
        if (c.pause_after_messages > 0 && c.pause_duration_minutes > 0 && newBlock >= c.pause_after_messages) {
          patch.paused_until = new Date(Date.now() + c.pause_duration_minutes * 60_000).toISOString();
          patch.sent_in_block = 0;
        }
        await supabase.from("bulk_campaign_recipients")
          .update({ status: "sent", sent_at: now }).eq("id", rec.id);
        await supabase.from("bulk_campaigns").update(patch).eq("id", c.id);
        // mirror in c for next iteration in same call
        c.sent = newSent; c.last_run_at = now;
        c.sent_in_block = patch.sent_in_block;
        c.paused_until = patch.paused_until ?? null;
      } else {
        await supabase.from("bulk_campaign_recipients")
          .update({ status: "failed", error: `HTTP ${r.status}: ${String(r.body).slice(0, 200)}` })
          .eq("id", rec.id);
        await supabase.from("bulk_campaigns")
          .update({ failed: (c.failed ?? 0) + 1, last_run_at: now })
          .eq("id", c.id);
        c.failed = (c.failed ?? 0) + 1; c.last_run_at = now;
      }
      processed++;
      didWork = true;
      log.push({ id: c.id, recipient: rec.id, ok: r.ok });
    }

    if (!didWork) {
      // Nothing was eligible this pass (all throttled/paused) — small wait then retry
      await sleep(1000);
    }
  }

  return new Response(JSON.stringify({ ok: true, processed, log }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
