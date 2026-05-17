import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { r2Put, ensureR2Configured } from "../_shared/r2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    ensureR2Configured();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const form = await req.formData();
    const file = form.get("file");
    const folder = String(form.get("folder") || "uploads").replace(/^\/+|\/+$/g, "");
    const filenameOverride = form.get("filename") ? String(form.get("filename")) : null;

    if (!(file instanceof File)) {
      return new Response(JSON.stringify({ error: "Arquivo ausente (campo 'file')" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (file.size > 25 * 1024 * 1024) {
      return new Response(JSON.stringify({ error: "Arquivo acima de 25MB" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const ext = (filenameOverride?.split(".").pop() || file.name.split(".").pop() || "bin")
      .toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
    const base = filenameOverride || `${crypto.randomUUID()}.${ext}`;
    const safeBase = base.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${folder}/${safeBase}`;

    const buf = new Uint8Array(await file.arrayBuffer());
    const url = await r2Put(key, buf, file.type || "application/octet-stream");

    return new Response(JSON.stringify({ url, key }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
