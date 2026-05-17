import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { r2Put, R2_PUBLIC_BASE_URL, ensureR2Configured } from "../_shared/r2.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Tables/columns containing public URLs that may point to Supabase Storage
const URL_COLUMNS: { table: string; columns: string[] }[] = [
  { table: "products", columns: ["image_url"] },
  { table: "option_items", columns: ["image_url"] },
  { table: "option_groups", columns: ["image_url"] },
  { table: "supply_products", columns: ["image_url"] },
  { table: "restaurants", columns: ["logo_url", "cover_url"] },
  { table: "expenses", columns: ["receipt_url"] },
  { table: "admin_expenses", columns: ["receipt_url"] },
];

const SOURCE_BUCKETS = ["menu-images", "expense-receipts"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    ensureR2Configured();

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

    const summary = {
      uploaded: 0,
      skipped: 0,
      failed: 0,
      url_replacements: 0,
      errors: [] as string[],
      buckets: {} as Record<string, { uploaded: number; failed: number }>,
    };

    // Helpers
    async function listAllFiles(bucket: string, prefix = ""): Promise<string[]> {
      const out: string[] = [];
      const queue: string[] = [prefix];
      while (queue.length) {
        const p = queue.shift()!;
        const { data, error } = await admin.storage.from(bucket).list(p, { limit: 1000, sortBy: { column: "name", order: "asc" } });
        if (error) throw new Error(`list ${bucket}/${p}: ${error.message}`);
        for (const item of data ?? []) {
          const full = p ? `${p}/${item.name}` : item.name;
          // folders have null id/metadata
          if (item.id === null && !item.metadata) {
            queue.push(full);
          } else {
            out.push(full);
          }
        }
      }
      return out;
    }

    function buildR2Key(bucket: string, path: string) {
      return `${bucket}/${path}`;
    }

    function publicUrlForBucketPath(bucket: string, path: string) {
      // matches what supabase getPublicUrl returns
      return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${path}`;
    }

    function r2PublicUrl(bucket: string, path: string) {
      return `${R2_PUBLIC_BASE_URL}/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`;
    }

    // 1) Copy files
    const fileMap = new Map<string, string>(); // oldUrl -> newUrl
    for (const bucket of SOURCE_BUCKETS) {
      summary.buckets[bucket] = { uploaded: 0, failed: 0 };
      let files: string[] = [];
      try {
        files = await listAllFiles(bucket);
      } catch (e) {
        summary.errors.push(String((e as Error).message));
        continue;
      }
      for (const path of files) {
        const oldUrl = publicUrlForBucketPath(bucket, path);
        const newUrl = r2PublicUrl(bucket, path);
        try {
          const { data: blob, error: dlErr } = await admin.storage.from(bucket).download(path);
          if (dlErr || !blob) throw new Error(dlErr?.message || "download failed");
          const buf = new Uint8Array(await blob.arrayBuffer());
          await r2Put(buildR2Key(bucket, path), buf, blob.type || "application/octet-stream");
          fileMap.set(oldUrl, newUrl);
          summary.uploaded++;
          summary.buckets[bucket].uploaded++;
        } catch (e) {
          summary.failed++;
          summary.buckets[bucket].failed++;
          summary.errors.push(`${bucket}/${path}: ${(e as Error).message}`);
        }
      }
    }

    // 2) Update DB URLs (replace supabase storage host with R2 host)
    const supaHost = `${SUPABASE_URL}/storage/v1/object/public/`;
    const r2Host = `${R2_PUBLIC_BASE_URL}/`;
    for (const { table, columns } of URL_COLUMNS) {
      for (const col of columns) {
        try {
          const { data: rows, error } = await admin.from(table).select(`id, ${col}`).ilike(col, `${supaHost}%`);
          if (error) { summary.errors.push(`${table}.${col} select: ${error.message}`); continue; }
          for (const row of rows ?? []) {
            const oldVal = (row as any)[col] as string;
            if (!oldVal) continue;
            const newVal = oldVal.replace(supaHost, r2Host);
            const { error: upErr } = await admin.from(table).update({ [col]: newVal }).eq("id", (row as any).id);
            if (upErr) { summary.errors.push(`${table}.${col} update ${(row as any).id}: ${upErr.message}`); continue; }
            summary.url_replacements++;
          }
        } catch (e) {
          summary.errors.push(`${table}.${col}: ${(e as Error).message}`);
        }
      }
    }

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
