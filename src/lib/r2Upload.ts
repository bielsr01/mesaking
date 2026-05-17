import { supabase } from "@/integrations/supabase/client";

/**
 * Faz upload de um arquivo para o Cloudflare R2 via edge function `r2-upload`.
 * Retorna a URL pública.
 *
 * Importante: usamos fetch direto (não `supabase.functions.invoke`) porque o
 * helper do supabase-js não envia FormData corretamente em todos os casos,
 * o que fazia o arquivo nunca chegar na edge function (e a imagem acabava
 * indo parar em outro lugar / não subindo para o R2).
 */
export async function uploadToR2(file: File | Blob, folder: string, filename?: string): Promise<string> {
  const asFile = file instanceof File
    ? file
    : new File([file], filename || "upload.bin", { type: (file as Blob).type });

  const form = new FormData();
  form.append("file", asFile);
  form.append("folder", folder);
  if (filename) form.append("filename", filename);

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Faça login novamente para enviar imagens.");

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
  const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  const endpoint = `${SUPABASE_URL}/functions/v1/r2-upload`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: ANON,
    },
    body: form,
  });

  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }

  if (!res.ok) {
    throw new Error(json?.error || text || `Falha no upload (HTTP ${res.status})`);
  }
  if (!json?.url) throw new Error("Resposta inválida do servidor de upload");
  return json.url as string;
}
