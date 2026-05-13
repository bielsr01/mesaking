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
    const { data: claimsData } = await userClient.auth.getClaims(token);
    if (!claimsData?.claims) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const callerId = claimsData.claims.sub as string;

    const admin = createClient(SUPABASE_URL, SERVICE);
    const body = await req.json();
    const { restaurant_id, name, email, password, access_group_id } = body ?? {};
    if (!restaurant_id || !name || !email || !password) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios faltando" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (String(password).length < 6) {
      return new Response(JSON.stringify({ error: "Senha mínima de 6 caracteres" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Authorize: caller must be owner or member (manager) of this restaurant, OR master_admin
    const { data: rest } = await admin.from("restaurants").select("id,owner_id").eq("id", restaurant_id).maybeSingle();
    if (!rest) return new Response(JSON.stringify({ error: "Restaurante inválido" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    let allowed = rest.owner_id === callerId;
    if (!allowed) {
      const { data: mem } = await admin.from("restaurant_members").select("user_id,access_group_id").eq("restaurant_id", restaurant_id).eq("user_id", callerId).maybeSingle();
      if (mem && !mem.access_group_id) allowed = true;
    }
    if (!allowed) {
      const { data: master } = await admin.from("user_roles").select("role").eq("user_id", callerId).eq("role", "master_admin").maybeSingle();
      if (master) allowed = true;
    }
    if (!allowed) return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name: name },
    });
    if (createErr || !created?.user) {
      return new Response(JSON.stringify({ error: createErr?.message ?? "Erro ao criar usuário" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const newUserId = created.user.id;
    await admin.from("user_roles").delete().eq("user_id", newUserId);
    await admin.from("user_roles").insert({ user_id: newUserId, role: "manager" });
    const { error: memErr } = await admin.from("restaurant_members").insert({
      restaurant_id, user_id: newUserId, access_group_id: access_group_id ?? null,
    });
    if (memErr) {
      await admin.auth.admin.deleteUser(newUserId);
      return new Response(JSON.stringify({ error: memErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ user_id: newUserId }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
