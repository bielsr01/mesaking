// Worker: envia mensagens da fila evolution_message_queue cujo scheduled_at <= now()
// Disparado por: (1) cron 2x/min, (2) trigger pg_net imediato quando delay=0.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BATCH_LIMIT = 200;
const PARALLELISM = 20;

function normalizePhone(p: string) {
  const d = (p || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55")) return d;
  return "55" + d;
}
function sanitizeBase(apiUrl: string) {
  return (apiUrl || "").replace(/\/+$/, "").replace(/\/manager$/i, "");
}

type QueueRow = {
  id: string;
  restaurant_id: string;
  phone: string;
  message: string;
  attempts: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // 1) Buscar candidatos vencidos
  const { data: candidates, error } = await supabase
    .from("evolution_message_queue")
    .select("id,restaurant_id,phone,message,attempts")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2) Lock otimista: tenta marcar cada um como "processing"
  const locked: QueueRow[] = [];
  for (const row of (candidates ?? []) as QueueRow[]) {
    const { data: claim } = await supabase
      .from("evolution_message_queue")
      .update({ status: "processing" })
      .eq("id", row.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (claim) locked.push(row);
  }

  const ENV_URL = Deno.env.get("EVOLUTION_API_URL") || "";
  const ENV_KEY = Deno.env.get("EVOLUTION_API_KEY") || "";

  // Cache de configs por restaurante
  const cfgCache = new Map<string, any>();
  async function getCfg(restaurantId: string) {
    if (cfgCache.has(restaurantId)) return cfgCache.get(restaurantId);
    const { data: cfg } = await supabase
      .from("evolution_integrations")
      .select("api_url,api_key,instance_name,instance_token,enabled")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();
    if (cfg) {
      cfg.api_url = cfg.api_url || ENV_URL;
      // For sending messages we use the instance token; fall back to global key only if no instance token
      cfg.send_key = cfg.instance_token || cfg.api_key || ENV_KEY;
    }
    cfgCache.set(restaurantId, cfg);
    return cfg;
  }

  let sent = 0, failed = 0;

  async function processOne(row: QueueRow) {
    const cfg = await getCfg(row.restaurant_id);
    if (!cfg || !cfg.enabled || !cfg.api_url || !cfg.api_key || !cfg.instance_name) {
      await supabase.from("evolution_message_queue").update({
        status: "failed",
        error: "Integração Evolution não configurada/desativada",
        attempts: (row.attempts ?? 0) + 1,
      }).eq("id", row.id);
      failed++;
      return;
    }

    const number = normalizePhone(row.phone);
    if (!number) {
      await supabase.from("evolution_message_queue").update({
        status: "failed", error: "Telefone inválido",
        attempts: (row.attempts ?? 0) + 1,
      }).eq("id", row.id);
      failed++;
      return;
    }

    const url = sanitizeBase(cfg.api_url) + `/message/sendText/${encodeURIComponent(cfg.instance_name)}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.api_key },
        body: JSON.stringify({ number, text: row.message }),
      });
      const text = await res.text();
      if (res.ok) {
        await supabase.from("evolution_message_queue").update({
          status: "sent", sent_at: new Date().toISOString(),
          attempts: (row.attempts ?? 0) + 1,
        }).eq("id", row.id);
        sent++;
      } else {
        const attempts = (row.attempts ?? 0) + 1;
        await supabase.from("evolution_message_queue").update({
          status: attempts >= 3 ? "failed" : "pending",
          error: `HTTP ${res.status}: ${text.slice(0, 300)}`,
          attempts,
          scheduled_at: new Date(Date.now() + 60_000 * attempts).toISOString(),
        }).eq("id", row.id);
        failed++;
      }
    } catch (e) {
      const attempts = (row.attempts ?? 0) + 1;
      await supabase.from("evolution_message_queue").update({
        status: attempts >= 3 ? "failed" : "pending",
        error: (e as Error).message,
        attempts,
        scheduled_at: new Date(Date.now() + 60_000 * attempts).toISOString(),
      }).eq("id", row.id);
      failed++;
    }
  }

  // 3) Processar em chunks paralelos
  for (let i = 0; i < locked.length; i += PARALLELISM) {
    const chunk = locked.slice(i, i + PARALLELISM);
    await Promise.all(chunk.map(processOne));
  }

  return new Response(JSON.stringify({
    ok: true,
    candidates: candidates?.length ?? 0,
    processed: locked.length,
    sent, failed,
  }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
