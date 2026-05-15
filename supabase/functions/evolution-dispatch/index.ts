// Cron worker: envia mensagens da fila evolution_message_queue cujo scheduled_at <= now()
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Pega até 25 itens vencidos
  const { data: queue, error } = await supabase
    .from("evolution_message_queue")
    .select("id,restaurant_id,phone,message,attempts")
    .eq("status", "pending")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(25);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let sent = 0, failed = 0;
  const results: any[] = [];

  for (const row of queue ?? []) {
    // Busca config Evolution do restaurante (deve estar habilitada)
    const { data: cfg } = await supabase
      .from("evolution_integrations")
      .select("api_url,api_key,instance_name,enabled")
      .eq("restaurant_id", row.restaurant_id)
      .maybeSingle();

    if (!cfg || !cfg.enabled || !cfg.api_url || !cfg.api_key || !cfg.instance_name) {
      await supabase.from("evolution_message_queue").update({
        status: "failed",
        error: "Integração Evolution não configurada/desativada",
        attempts: (row.attempts ?? 0) + 1,
      }).eq("id", row.id);
      failed++;
      continue;
    }

    const number = normalizePhone(row.phone);
    if (!number) {
      await supabase.from("evolution_message_queue").update({
        status: "failed", error: "Telefone inválido",
        attempts: (row.attempts ?? 0) + 1,
      }).eq("id", row.id);
      failed++;
      continue;
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
        results.push({ id: row.id, ok: true });
      } else {
        const attempts = (row.attempts ?? 0) + 1;
        await supabase.from("evolution_message_queue").update({
          status: attempts >= 3 ? "failed" : "pending",
          error: `HTTP ${res.status}: ${text.slice(0, 300)}`,
          attempts,
          scheduled_at: new Date(Date.now() + 60_000 * attempts).toISOString(),
        }).eq("id", row.id);
        failed++;
        results.push({ id: row.id, ok: false, status: res.status });
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
      results.push({ id: row.id, ok: false, error: (e as Error).message });
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: queue?.length ?? 0, sent, failed, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
