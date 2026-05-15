// Manage Evolution API instances per restaurant using GLOBAL credentials from env.
// Actions: env_status, create, connect, state, logout, delete
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import QRCode from "npm:qrcode@1.5.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function sanitizeBase(u: string) {
  return (u || "").replace(/\/+$/, "").replace(/\/manager$/i, "");
}

async function evoFetch(base: string, path: string, apiKey: string, body?: any, method = "POST") {
  const res = await fetch(sanitizeBase(base) + path, {
    method,
    headers: { "Content-Type": "application/json", apikey: apiKey },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

function slugify(s: string) {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}
function genInstanceName(restaurantId: string, base?: string | null, withSuffix = false) {
  const slug = slugify(base || "");
  const short = restaurantId.replace(/-/g, "").slice(0, 6);
  const core = slug ? `mk_${slug}` : `mk_${short}`;
  if (!withSuffix) return core;
  const rand = Math.random().toString(36).slice(2, 6);
  return `${core}_${rand}`;
}

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

  const URL_ENV = Deno.env.get("EVOLUTION_API_URL") || "";
  const KEY_ENV = Deno.env.get("EVOLUTION_API_KEY") || "";
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

  try {
    const body = await req.json().catch(() => ({}));
    const { action, restaurantId } = body ?? {};

    if (action === "env_status") {
      return new Response(JSON.stringify({
        ok: true,
        configured: !!URL_ENV && !!KEY_ENV,
        apiUrl: URL_ENV ? sanitizeBase(URL_ENV) : null,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!URL_ENV || !KEY_ENV) {
      throw new Error("EVOLUTION_API_URL ou EVOLUTION_API_KEY não configurados no servidor.");
    }

    // Auth: must be authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userErr || !userData?.user?.id) throw new Error("Unauthorized");
    const uid = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE);

    if (!restaurantId) throw new Error("restaurantId obrigatório");

    // Permission: master_admin OR manager of restaurant
    const { data: isAdminRow } = await admin.from("user_roles").select("role").eq("user_id", uid).eq("role", "master_admin").maybeSingle();
    const isAdmin = !!isAdminRow;
    if (!isAdmin) {
      const { data: ok } = await admin.rpc("is_restaurant_manager", { _user_id: uid, _restaurant_id: restaurantId });
      if (!ok) throw new Error("Sem permissão para este restaurante");
    }

    // Load or initialize integration row
    const { data: existing } = await admin.from("evolution_integrations")
      .select("*").eq("restaurant_id", restaurantId).maybeSingle();

    async function upsertRow(fields: Record<string, any>) {
      if (existing?.id) {
        await admin.from("evolution_integrations").update(fields).eq("id", existing.id);
      } else {
        await admin.from("evolution_integrations").insert({ restaurant_id: restaurantId, ...fields });
      }
    }

    if (action === "create") {
      // If already has an instance, reuse it
      let instanceName = existing?.instance_name as string | undefined;
      let instanceToken = existing?.instance_token as string | undefined;

      if (!instanceName) {
        // Buscar nome/slug do restaurante para nomear a instância
        const { data: rest } = await admin.from("restaurants")
          .select("slug, name").eq("id", restaurantId).maybeSingle();
        const base = rest?.slug || rest?.name || "";
        instanceName = genInstanceName(restaurantId, base, false);
        let r = await evoFetch(URL_ENV, "/instance/create", KEY_ENV, {
          instanceName,
          integration: "WHATSAPP-BAILEYS",
          qrcode: true,
        });
        // Se nome já existir, tenta com sufixo aleatório
        if (!r.ok && (r.status === 403 || r.status === 409 || /exist|already|conflict/i.test(JSON.stringify(r.data)))) {
          instanceName = genInstanceName(restaurantId, base, true);
          r = await evoFetch(URL_ENV, "/instance/create", KEY_ENV, {
            instanceName, integration: "WHATSAPP-BAILEYS", qrcode: true,
          });
        }
        if (!r.ok) throw new Error(`Falha ao criar instância (${r.status}): ${JSON.stringify(r.data).slice(0, 300)}`);
        instanceToken = r.data?.hash || r.data?.instance?.hash || r.data?.token || null;
        const qr = await buildPureQrImage(r.data);
        await upsertRow({
          api_url: sanitizeBase(URL_ENV),
          api_key: KEY_ENV,
          instance_name: instanceName,
          instance_token: instanceToken,
          enabled: true,
          qrcode: qr,
          last_status: r.data?.instance?.status || "created",
          last_check_at: new Date().toISOString(),
        });
        return new Response(JSON.stringify({ ok: true, instanceName, qrcode: qr, status: "created" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: true, instanceName, status: existing?.last_status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "connect") {
      const instanceName = existing?.instance_name;
      if (!instanceName) throw new Error("Instância não criada ainda");
      const r = await evoFetch(URL_ENV, `/instance/connect/${encodeURIComponent(instanceName)}`, KEY_ENV, undefined, "GET");
      if (!r.ok) throw new Error(`Falha ao obter QR (${r.status})`);
      const qr = await buildPureQrImage(r.data);
      const code = r.data?.code || r.data?.qrcode?.code || null;
      await upsertRow({ qrcode: qr, last_check_at: new Date().toISOString() });
      return new Response(JSON.stringify({ ok: true, qrcode: qr, code }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "state") {
      const instanceName = existing?.instance_name;
      if (!instanceName) throw new Error("Instância não criada");
      const r = await evoFetch(URL_ENV, `/instance/connectionState/${encodeURIComponent(instanceName)}`, KEY_ENV, undefined, "GET");
      const state = r.data?.instance?.state || r.data?.state || (r.ok ? "unknown" : `erro ${r.status}`);
      const update: any = { last_status: state, last_check_at: new Date().toISOString() };
      if (state === "open") update.qrcode = null;
      await upsertRow(update);
      return new Response(JSON.stringify({ ok: r.ok, state }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "logout") {
      const instanceName = existing?.instance_name;
      if (!instanceName) throw new Error("Instância não criada");
      const r = await evoFetch(URL_ENV, `/instance/logout/${encodeURIComponent(instanceName)}`, KEY_ENV, undefined, "DELETE");
      await upsertRow({ last_status: "close", qrcode: null, last_check_at: new Date().toISOString() });
      return new Response(JSON.stringify({ ok: r.ok }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "delete") {
      const instanceName = existing?.instance_name;
      if (instanceName) {
        await evoFetch(URL_ENV, `/instance/delete/${encodeURIComponent(instanceName)}`, KEY_ENV, undefined, "DELETE");
      }
      await upsertRow({
        instance_name: null, instance_token: null, qrcode: null,
        phone_number: null, last_status: "deleted", last_check_at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Ação desconhecida");
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
