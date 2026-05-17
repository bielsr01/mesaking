import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BUCKETS = ["menu-images", "expense-receipts"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData } = await userClient.auth.getClaims(token);
    if (!claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const callerId = claimsData.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", callerId).eq("role", "master_admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    async function listAll(bucket: string, prefix = ""): Promise<string[]> {
      const out: string[] = [];
      const queue: string[] = [prefix];
      while (queue.length) {
        const p = queue.shift()!;
        const { data, error } = await admin.storage.from(bucket).list(p, { limit: 1000, sortBy: { column: "name", order: "asc" } });
        if (error) throw new Error(`list ${bucket}/${p}: ${error.message}`);
        for (const item of data ?? []) {
          const full = p ? `${p}/${item.name}` : item.name;
          if (item.id === null && !item.metadata) queue.push(full);
          else out.push(full);
        }
      }
      return out;
    }

    const summary: Record<string, { deleted: number; failed: number; errors: string[] }> = {};
    for (const bucket of BUCKETS) {
      summary[bucket] = { deleted: 0, failed: 0, errors: [] };
      try {
        const files = await listAll(bucket);
        // remove em lotes de 100
        for (let i = 0; i < files.length; i += 100) {
          const batch = files.slice(i, i + 100);
          const { error } = await admin.storage.from(bucket).remove(batch);
          if (error) {
            summary[bucket].failed += batch.length;
            summary[bucket].errors.push(error.message);
          } else {
            summary[bucket].deleted += batch.length;
          }
        }
      } catch (e) {
        summary[bucket].errors.push((e as Error).message);
      }
    }

    return new Response(JSON.stringify({ ok: true, summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
