// Shared Cloudflare R2 helper (S3-compatible API via AWS SigV4)
import { AwsClient } from "https://esm.sh/aws4fetch@1.0.20";

const ACCOUNT_ID = Deno.env.get("R2_ACCOUNT_ID") ?? "";
const ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID") ?? "";
const SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY") ?? "";
export const R2_BUCKET = Deno.env.get("R2_BUCKET") ?? "";
export const R2_PUBLIC_BASE_URL = (Deno.env.get("R2_PUBLIC_BASE_URL") ?? "").replace(/\/+$/, "");

export const R2_ENDPOINT = `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`;

export function ensureR2Configured() {
  if (!ACCOUNT_ID || !ACCESS_KEY_ID || !SECRET_ACCESS_KEY || !R2_BUCKET || !R2_PUBLIC_BASE_URL) {
    throw new Error("R2 não configurado (faltam variáveis de ambiente).");
  }
}

export const r2Client = new AwsClient({
  accessKeyId: ACCESS_KEY_ID,
  secretAccessKey: SECRET_ACCESS_KEY,
  service: "s3",
  region: "auto",
});

export async function r2Put(key: string, body: ArrayBuffer | Uint8Array | Blob, contentType?: string) {
  ensureR2Configured();
  const url = `${R2_ENDPOINT}/${R2_BUCKET}/${encodeKey(key)}`;
  const res = await r2Client.fetch(url, {
    method: "PUT",
    body,
    headers: contentType ? { "Content-Type": contentType } : {},
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`R2 PUT ${key} falhou [${res.status}]: ${txt}`);
  }
  return `${R2_PUBLIC_BASE_URL}/${encodeKey(key)}`;
}

export async function r2Delete(key: string) {
  ensureR2Configured();
  const url = `${R2_ENDPOINT}/${R2_BUCKET}/${encodeKey(key)}`;
  const res = await r2Client.fetch(url, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    const txt = await res.text();
    throw new Error(`R2 DELETE ${key} falhou [${res.status}]: ${txt}`);
  }
}

function encodeKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

export function publicUrlFor(key: string) {
  return `${R2_PUBLIC_BASE_URL}/${encodeKey(key)}`;
}
