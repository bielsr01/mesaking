import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import QRCode from "npm:qrcode@1.5.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isDataImage(value: string) {
  return /^data:image\/[a-z0-9+.-]+;base64,/i.test(value.trim());
}

function isRawPngBase64(value: string) {
  return value.trim().startsWith("iVBORw0KGgo");
}

function normalizeBase64Image(value: unknown) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s/g, "");
  if (!cleaned) return null;
  if (isDataImage(cleaned)) return cleaned;
  if (isRawPngBase64(cleaned)) return `data:image/png;base64,${cleaned}`;
  return null;
}

function extractQrCode(data: any) {
  const qrcode = data?.qrcode;
  const value = typeof qrcode === "string" ? qrcode.trim() : null;
  const code = data?.code || qrcode?.code || (value && !isDataImage(value) && !isRawPngBase64(value) ? value : null);
  return typeof code === "string" && code.trim() ? code.trim() : null;
}

async function buildPureQrImage(data: any) {
  const code = extractQrCode(data);
  if (code) {
    return await QRCode.toDataURL(code, {
      type: "image/png",
      width: 304,
      margin: 1,
      color: { dark: "#000000", light: "#FFFFFF" },
    });
  }
  return normalizeBase64Image(data?.qrcode?.base64 || data?.base64 || data?.qrcode);
}

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

    // Verify caller is master_admin
    const { data: roleRow } = await admin.from("user_roles").select("role").eq("user_id", callerId).eq("role", "master_admin").maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const { name, slug, manager_email, manager_password, manager_name } = body ?? {};
    if (!name || !slug || !manager_email || !manager_password || !manager_name) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios faltando" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!/^[a-z0-9-]{2,60}$/.test(slug)) {
      return new Response(JSON.stringify({ error: "Slug inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (String(manager_password).length < 6) {
      return new Response(JSON.stringify({ error: "Senha mínima de 6 caracteres" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Check slug
    const { data: existing } = await admin.from("restaurants").select("id").eq("slug", slug).maybeSingle();
    if (existing) {
      return new Response(JSON.stringify({ error: "Slug já em uso" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create user (auto-confirmed)
    const { data: createdUser, error: createUserErr } = await admin.auth.admin.createUser({
      email: manager_email,
      password: manager_password,
      email_confirm: true,
      user_metadata: { full_name: manager_name },
    });
    if (createUserErr || !createdUser?.user) {
      return new Response(JSON.stringify({ error: createUserErr?.message ?? "Erro ao criar usuário" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const newUserId = createdUser.user.id;

    // Set role = manager (remove default 'customer' set by trigger)
    await admin.from("user_roles").delete().eq("user_id", newUserId);
    await admin.from("user_roles").insert({ user_id: newUserId, role: "manager" });

    // Create restaurant owned by this manager
    const { data: rest, error: restErr } = await admin.from("restaurants").insert({
      name, slug, owner_id: newUserId, is_open: false,
    }).select().single();

    if (restErr) {
      // rollback user
      await admin.auth.admin.deleteUser(newUserId);
      return new Response(JSON.stringify({ error: restErr.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Best-effort: auto-create Evolution WhatsApp instance for the new restaurant.
    // We swallow errors so a missing/invalid Evolution env doesn't block restaurant creation.
    try {
      const evoUrl = Deno.env.get("EVOLUTION_API_URL") || "";
      const evoKey = Deno.env.get("EVOLUTION_API_KEY") || "";
      if (evoUrl && evoKey) {
        const base = evoUrl.replace(/\/+$/, "").replace(/\/manager$/i, "");
        const slugSan = String(slug).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
          .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
        let instanceName = slugSan ? `mk_${slugSan}` : `mk_${rest.id.replace(/-/g, "").slice(0, 6)}`;
        let r = await fetch(`${base}/instance/create`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: evoKey },
          body: JSON.stringify({ instanceName, integration: "WHATSAPP-BAILEYS", qrcode: true }),
        });
        if (!r.ok && (r.status === 403 || r.status === 409)) {
          instanceName = `${instanceName}_${Math.random().toString(36).slice(2, 6)}`;
          r = await fetch(`${base}/instance/create`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: evoKey },
            body: JSON.stringify({ instanceName, integration: "WHATSAPP-BAILEYS", qrcode: true }),
          });
        }
        const txt = await r.text();
        let json: any = null;
        try { json = txt ? JSON.parse(txt) : null; } catch { /* ignore */ }
        if (r.ok && json) {
          const instanceToken = json?.hash || json?.instance?.hash || json?.token || null;
          const qr = await buildPureQrImage(json);
          await admin.from("evolution_integrations").insert({
            restaurant_id: rest.id,
            api_url: base,
            api_key: evoKey,
            instance_name: instanceName,
            instance_token: instanceToken,
            enabled: true,
            qrcode: qr,
            last_status: "created",
            last_check_at: new Date().toISOString(),
          });
        }
      }
    } catch (_e) { /* best-effort */ }

    return new Response(JSON.stringify({ restaurant: rest, user_id: newUserId }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
