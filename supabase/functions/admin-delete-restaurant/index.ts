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

    const { restaurant_id, delete_owner } = await req.json();
    if (!restaurant_id) {
      return new Response(JSON.stringify({ error: "restaurant_id obrigatório" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: rest } = await admin.from("restaurants").select("id, owner_id").eq("id", restaurant_id).maybeSingle();
    if (!rest) {
      return new Response(JSON.stringify({ error: "Restaurante não encontrado" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Delete order_items via orders
    const { data: orders } = await admin.from("orders").select("id").eq("restaurant_id", restaurant_id);
    const orderIds = (orders ?? []).map(o => o.id);
    if (orderIds.length) {
      await admin.from("order_items").delete().in("order_id", orderIds);
      await admin.from("orders").delete().in("id", orderIds);
    }

    await admin.from("products").delete().eq("restaurant_id", restaurant_id);
    await admin.from("categories").delete().eq("restaurant_id", restaurant_id);
    await admin.from("restaurant_members").delete().eq("restaurant_id", restaurant_id);

    // Storage cleanup
    try {
      const { data: files } = await admin.storage.from("menu-images").list(restaurant_id, { limit: 1000 });
      if (files?.length) {
        await admin.storage.from("menu-images").remove(files.map(f => `${restaurant_id}/${f.name}`));
      }
    } catch (_) { /* ignore */ }

    await admin.from("restaurants").delete().eq("id", restaurant_id);

    if (delete_owner && rest.owner_id) {
      // Only delete owner if they own no other restaurants
      const { data: others } = await admin.from("restaurants").select("id").eq("owner_id", rest.owner_id).limit(1);
      if (!others?.length) {
        await admin.auth.admin.deleteUser(rest.owner_id);
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
