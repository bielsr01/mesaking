import { supabase } from "@/integrations/supabase/client";

/**
 * Faz upload de um arquivo para o Cloudflare R2 via edge function `r2-upload`.
 * Retorna a URL pública.
 *
 * @param file Arquivo (File ou Blob)
 * @param folder Pasta lógica no bucket (ex.: "restaurants/<id>", "expenses/<rid>")
 * @param filename Nome opcional (caso queira controle do path, ex.: "logo-123.png")
 */
export async function uploadToR2(file: File | Blob, folder: string, filename?: string): Promise<string> {
  const form = new FormData();
  const asFile = file instanceof File ? file : new File([file], filename || "upload.bin", { type: (file as Blob).type });
  form.append("file", asFile);
  form.append("folder", folder);
  if (filename) form.append("filename", filename);

  const { data, error } = await supabase.functions.invoke("r2-upload", { body: form });
  if (error) throw new Error(error.message || "Falha no upload");
  if (!data?.url) throw new Error("Resposta inválida do servidor de upload");
  return data.url as string;
}
