import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export function StoreSettings({ restaurant, onUpdated }: { restaurant: { id: string; name: string; slug: string }; onUpdated: () => void }) {
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "").trim();
    const description = String(fd.get("description") || "").trim() || null;
    const phone = String(fd.get("phone") || "").trim() || null;
    const file = fd.get("logo") as File | null;
    let logo_url: string | null | undefined = undefined;
    if (file && file.size > 0) {
      const path = `${restaurant.id}/logo-${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("menu-images").upload(path, file, { upsert: true });
      if (upErr) { setBusy(false); return toast.error(upErr.message); }
      logo_url = supabase.storage.from("menu-images").getPublicUrl(path).data.publicUrl;
    }
    const update: any = { name, description, phone };
    if (logo_url !== undefined) update.logo_url = logo_url;
    const { error } = await supabase.from("restaurants").update(update).eq("id", restaurant.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Configurações salvas");
    onUpdated();
  };

  return (
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Configurações da loja</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2"><Label>Nome do restaurante</Label><Input name="name" defaultValue={restaurant.name} required /></div>
          <div className="space-y-2"><Label>Descrição</Label><Textarea name="description" rows={2} placeholder="Comida caseira, pizzaria, hamburgueria..." /></div>
          <div className="space-y-2"><Label>Telefone</Label><Input name="phone" placeholder="(11) 99999-0000" /></div>
          <div className="space-y-2"><Label>Logo</Label><Input name="logo" type="file" accept="image/*" /></div>
          <div className="space-y-2"><Label>URL pública</Label><Input value={`/r/${restaurant.slug}`} readOnly /></div>
          <Button type="submit" disabled={busy}>{busy ? "Salvando..." : "Salvar"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
