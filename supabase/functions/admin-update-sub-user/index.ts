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
    const { restaurant_id, target_user_id, name, email, password, access_group_id, action } = body ?? {};
    if (!restaurant_id || !target_user_id) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios faltando" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Authorize caller
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

    // Cannot manage the owner
    if (rest.owner_id === target_user_id) {
      return new Response(JSON.stringify({ error: "Não é possível alterar o dono do restaurante" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "delete") {
      await admin.from("restaurant_members").delete().eq("restaurant_id", restaurant_id).eq("user_id", target_user_id);
      // Delete auth user only if no other memberships and not owner of any restaurant
      const { count: otherMems } = await admin.from("restaurant_members").select("user_id", { count: "exact", head: true }).eq("user_id", target_user_id);
      const { count: ownerCount } = await admin.from("restaurants").select("id", { count: "exact", head: true }).eq("owner_id", target_user_id);
      if ((otherMems ?? 0) === 0 && (ownerCount ?? 0) === 0) {
        await admin.auth.admin.deleteUser(target_user_id);
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const updates: any = {};
    if (typeof email === "string" && email) updates.email = email;
    if (typeof password === "string" && password) {
      if (password.length < 6) return new Response(JSON.stringify({ error: "Senha mínima de 6 caracteres" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      updates.password = password;
    }
    if (typeof name === "string" && name) updates.user_metadata = { full_name: name };
    if (Object.keys(updates).length > 0) {
      const { error: upErr } = await admin.auth.admin.updateUserById(target_user_id, updates);
      if (upErr) return new Response(JSON.stringify({ error: upErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (typeof name === "string" && name) {
        await admin.from("profiles").update({ full_name: name }).eq("id", target_user_id);
      }
    }
    if (access_group_id !== undefined) {
      await admin.from("restaurant_members").update({ access_group_id: access_group_id || null }).eq("restaurant_id", restaurant_id).eq("user_id", target_user_id);
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
