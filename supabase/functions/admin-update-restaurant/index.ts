import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const callerId = claimsData.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE);

    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", callerId).eq("role", "master_admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { restaurant_id, name, slug, manager_name, manager_email, manager_password } = body ?? {};

    if (!restaurant_id) {
      return new Response(JSON.stringify({ error: "restaurant_id obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (slug && !/^[a-z0-9-]{2,60}$/.test(slug)) {
      return new Response(JSON.stringify({ error: "Slug inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (manager_password && String(manager_password).length < 6) {
      return new Response(JSON.stringify({ error: "Senha mínima de 6 caracteres" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: rest, error: restFetchErr } = await admin.from("restaurants").select("id, owner_id, slug").eq("id", restaurant_id).maybeSingle();
    if (restFetchErr || !rest) {
      return new Response(JSON.stringify({ error: "Restaurante não encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (slug && slug !== rest.slug) {
      const { data: existing } = await admin.from("restaurants").select("id").eq("slug", slug).maybeSingle();
      if (existing && existing.id !== restaurant_id) {
        return new Response(JSON.stringify({ error: "Slug já em uso" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    const restPatch: Record<string, unknown> = {};
    if (typeof name === "string" && name.trim()) restPatch.name = name.trim();
    if (typeof slug === "string" && slug.trim()) restPatch.slug = slug.trim();
    if (Object.keys(restPatch).length) {
      const { error: updErr } = await admin.from("restaurants").update(restPatch).eq("id", restaurant_id);
      if (updErr) return new Response(JSON.stringify({ error: updErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (rest.owner_id) {
      const userPatch: Record<string, unknown> = {};
      if (typeof manager_email === "string" && manager_email.trim()) userPatch.email = manager_email.trim();
      if (typeof manager_password === "string" && manager_password) userPatch.password = manager_password;
      if (typeof manager_name === "string" && manager_name.trim()) userPatch.user_metadata = { full_name: manager_name.trim() };

      if (Object.keys(userPatch).length) {
        const { error: authErr } = await admin.auth.admin.updateUserById(rest.owner_id, userPatch as any);
        if (authErr) return new Response(JSON.stringify({ error: authErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (typeof manager_name === "string" && manager_name.trim()) {
        await admin.from("profiles").update({ full_name: manager_name.trim() }).eq("id", rest.owner_id);
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
