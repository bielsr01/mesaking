import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Trash2, Plus, MapPin, Loader2, Crop } from "lucide-react";
import { toast } from "sonner";
import { DAY_LABELS, defaultHours, OpeningHours } from "@/lib/hours";
import { DeliveryZone, geocodeAddress } from "@/lib/delivery";
import { brl, formatPhone } from "@/lib/format";
import { CoverImageCropper } from "@/components/CoverImageCropper";
import { Skeleton } from "@/components/ui/skeleton";

type Restaurant = {
  id: string; name: string; slug: string;
  description?: string | null; phone?: string | null; logo_url?: string | null;
  cover_url?: string | null;
  opening_hours?: OpeningHours | null;
  address_cep?: string | null; address_street?: string | null; address_number?: string | null;
  address_complement?: string | null; address_neighborhood?: string | null;
  address_city?: string | null; address_state?: string | null;
  latitude?: number | null; longitude?: number | null;
  delivery_zones?: DeliveryZone[] | null;
  delivery_time_min?: number | null;
  delivery_time_max?: number | null;
  whatsapp_url?: string | null;
  instagram_url?: string | null;
  facebook_url?: string | null;
  service_delivery?: boolean | null;
  service_pickup?: boolean | null;
  delivery_fee_mode?: "fixed" | "radius" | null;
  delivery_fixed_fee?: number | null;
};

export function StoreSettings({ restaurant, onUpdated }: { restaurant: Restaurant; onUpdated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [full, setFull] = useState<Restaurant>(restaurant);
  const [hours, setHours] = useState<OpeningHours>(defaultHours());
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [geocoding, setGeocoding] = useState(false);

  // Cropper de capa
  const [cropperOpen, setCropperOpen] = useState(false);
  const [cropperSrc, setCropperSrc] = useState<string | null>(null);
  const [coverBlob, setCoverBlob] = useState<Blob | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);

  const onCoverFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCropperSrc(url);
    setCropperOpen(true);
    // Permite reescolher o mesmo arquivo depois
    e.target.value = "";
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("restaurants").select("*").eq("id", restaurant.id).maybeSingle();
      if (cancelled) return;
      if (data) {
        setFull(data as unknown as Restaurant);
        const oh = data.opening_hours as unknown as OpeningHours | null;
        setHours(oh && Object.keys(oh).length ? oh : defaultHours());
        setZones(((data.delivery_zones as unknown) ?? []) as DeliveryZone[]);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [restaurant.id]);

  const lookupCep = async (raw: string) => {
    const clean = raw.replace(/\D/g, "");
    if (clean.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const d = await res.json();
      if (d.erro) return toast.error("CEP não encontrado");
      setFull((p) => ({
        ...p,
        address_street: d.logradouro || p.address_street,
        address_neighborhood: d.bairro || p.address_neighborhood,
        address_city: d.localidade || p.address_city,
        address_state: d.uf || p.address_state,
      }));
    } catch { toast.error("Falha ao buscar CEP"); }
  };

  const geocode = async () => {
    setGeocoding(true);
    const pt = await geocodeAddress({
      cep: full.address_cep || undefined,
      street: full.address_street || undefined,
      number: full.address_number || undefined,
      neighborhood: full.address_neighborhood || undefined,
      city: full.address_city || undefined,
      state: full.address_state || undefined,
    });
    setGeocoding(false);
    if (!pt) return toast.error("Não foi possível localizar este endereço");
    setFull((p) => ({ ...p, latitude: pt.lat, longitude: pt.lng }));
    toast.success("Coordenadas atualizadas");
  };

  const addZone = () => setZones((z) => [...z, { radius_km: 0, fee: 0 }]);
  const updateZoneRadius = (i: number, v: string) =>
    setZones((z) => z.map((x, idx) => (idx === i ? { ...x, radius_km: v === "" ? 0 : Number(v) } : x)));
  const updateZoneFee = (i: number, v: string) =>
    setZones((z) => z.map((x, idx) => (idx === i ? { ...x, fee: v === "" ? 0 : Number(v) } : x)));
  const removeZone = (i: number) => setZones((z) => z.filter((_, idx) => idx !== i));

  const save = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Validações de obrigatoriedade
    const required: [string, any][] = [
      ["Nome", full.name],
      ["Telefone", full.phone],
      ["CEP", full.address_cep],
      ["Rua", full.address_street],
      ["Número", full.address_number],
      ["Bairro", full.address_neighborhood],
      ["Cidade", full.address_city],
      ["UF", full.address_state],
    ];
    for (const [label, val] of required) {
      if (val === null || val === undefined || String(val).trim() === "") {
        return toast.error(`Preencha o campo: ${label}`);
      }
    }
    if (!full.latitude || !full.longitude) {
      return toast.error("Calcule as coordenadas do endereço (botão Localizar no mapa)");
    }
    if (!Object.values(hours).some((h: any) => h?.enabled)) {
      return toast.error("Habilite ao menos um dia no horário de funcionamento");
    }
    if (!full.logo_url) {
      // Logo será exigido se ainda não estiver salvo e não houver upload
    }

    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const logoFile = fd.get("logo") as File | null;
    // capa vem do cropper (coverBlob), não mais do FormData

    let logo_url: string | null | undefined;
    if (logoFile && logoFile.size > 0) {
      const path = `${restaurant.id}/logo-${Date.now()}-${logoFile.name.replace(/\s+/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("menu-images").upload(path, logoFile, { upsert: true });
      if (upErr) { setBusy(false); return toast.error(upErr.message); }
      logo_url = supabase.storage.from("menu-images").getPublicUrl(path).data.publicUrl;
    }
    if (!logo_url && !full.logo_url) {
      setBusy(false);
      return toast.error("Envie a logo da loja");
    }

    let cover_url: string | null | undefined;
    if (coverBlob) {
      const path = `${restaurant.id}/cover-${Date.now()}.jpg`;
      const { error: upErr } = await supabase.storage.from("menu-images").upload(path, coverBlob, { upsert: true, contentType: "image/jpeg" });
      if (upErr) { setBusy(false); return toast.error(upErr.message); }
      cover_url = supabase.storage.from("menu-images").getPublicUrl(path).data.publicUrl;
    }
    if (!cover_url && !full.cover_url) {
      setBusy(false);
      return toast.error("Envie a foto de capa da loja");
    }

    const update: any = {
      name: full.name,
      description: full.description,
      phone: full.phone,
      address_cep: full.address_cep,
      address_street: full.address_street,
      address_number: full.address_number,
      address_complement: full.address_complement || null,
      address_neighborhood: full.address_neighborhood,
      address_city: full.address_city,
      address_state: full.address_state,
      latitude: full.latitude,
      longitude: full.longitude,
      opening_hours: hours,
      whatsapp_url: full.whatsapp_url || null,
      instagram_url: full.instagram_url || null,
      facebook_url: full.facebook_url || null,
      service_delivery: full.service_delivery ?? true,
      service_pickup: full.service_pickup ?? false,
    };
    if (logo_url !== undefined) update.logo_url = logo_url;
    if (cover_url !== undefined) update.cover_url = cover_url;

    const { error } = await supabase.from("restaurants").update(update).eq("id", restaurant.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    if (cover_url) {
      setFull((p) => ({ ...p, cover_url }));
      setCoverBlob(null);
      if (coverPreview) { URL.revokeObjectURL(coverPreview); setCoverPreview(null); }
    }
    toast.success("Configurações salvas");
    onUpdated();
  };

  if (!loaded) {
    return (
      <div className="space-y-4 max-w-3xl animate-fade-in">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <>
    <form onSubmit={save} className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader><CardTitle>Informações da loja</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Nome *</Label><Input value={full.name || ""} onChange={(e) => setFull({ ...full, name: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Telefone *</Label><Input value={formatPhone(full.phone || "")} onChange={(e) => setFull({ ...full, phone: formatPhone(e.target.value) })} placeholder="(11) 99999-0000" inputMode="tel" required /></div>
          </div>
          
          <div className="space-y-2">
            <Label>Logo *</Label>
            {full.logo_url && <img src={full.logo_url} alt="Logo atual" className="w-20 h-20 rounded-lg object-cover border" />}
            <Input name="logo" type="file" accept="image/*" {...(!full.logo_url ? { required: true } : {})} />
            <p className="text-xs text-muted-foreground">{full.logo_url ? "Envie um arquivo para substituir." : "Obrigatório."}</p>
          </div>
          <div className="space-y-2">
            <Label>Foto de capa *</Label>
            {(coverPreview || full.cover_url) && (
              <div className="relative w-full aspect-[16/6] rounded-lg overflow-hidden border bg-muted">
                <img src={coverPreview || full.cover_url!} alt="Capa atual" className="w-full h-full object-cover" />
                {coverPreview && (
                  <span className="absolute top-2 left-2 text-xs bg-primary text-primary-foreground px-2 py-0.5 rounded-full">Pré-visualização (salve para aplicar)</span>
                )}
              </div>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onCoverFileChosen}
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => coverInputRef.current?.click()}>
                {full.cover_url || coverPreview ? "Trocar foto de capa" : "Enviar foto de capa"}
              </Button>
              {(coverPreview || full.cover_url) && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    const src = coverPreview || full.cover_url!;
                    setCropperSrc(src);
                    setCropperOpen(true);
                  }}
                >
                  <Crop className="w-4 h-4 mr-1" /> Ajustar enquadramento
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Aparece como fundo do cabeçalho do site do cliente. Ao escolher uma imagem, abre o editor para arrastar, dar zoom e cortar exatamente como deve aparecer.</p>
          </div>
          <div className="space-y-2"><Label>URL pública</Label><Input value={`/r/${restaurant.slug}`} readOnly /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Endereço do restaurante</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2"><Label>CEP *</Label><Input value={full.address_cep || ""} onChange={(e) => setFull({ ...full, address_cep: e.target.value })} onBlur={(e) => lookupCep(e.target.value)} placeholder="00000-000" required /></div>
            <div className="space-y-2 col-span-2"><Label>Rua *</Label><Input value={full.address_street || ""} onChange={(e) => setFull({ ...full, address_street: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Número *</Label><Input value={full.address_number || ""} onChange={(e) => setFull({ ...full, address_number: e.target.value })} required /></div>
            <div className="space-y-2 col-span-2"><Label>Complemento</Label><Input value={full.address_complement || ""} onChange={(e) => setFull({ ...full, address_complement: e.target.value })} /></div>
            <div className="space-y-2 col-span-2"><Label>Bairro *</Label><Input value={full.address_neighborhood || ""} onChange={(e) => setFull({ ...full, address_neighborhood: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Cidade *</Label><Input value={full.address_city || ""} onChange={(e) => setFull({ ...full, address_city: e.target.value })} required /></div>
            <div className="space-y-2"><Label>UF *</Label><Input maxLength={2} value={full.address_state || ""} onChange={(e) => setFull({ ...full, address_state: e.target.value.toUpperCase() })} required /></div>
          </div>
          <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-muted/50">
            <div className="text-sm">
              <div className="font-medium flex items-center gap-1"><MapPin className="w-4 h-4" /> Coordenadas geográficas</div>
              <div className="text-xs text-muted-foreground">
                {full.latitude && full.longitude
                  ? `${full.latitude.toFixed(5)}, ${full.longitude.toFixed(5)}`
                  : "Não definidas — calcule para habilitar a taxa de entrega por raio."}
              </div>
            </div>
            <Button type="button" variant="outline" onClick={geocode} disabled={geocoding}>
              {geocoding ? <Loader2 className="w-4 h-4 animate-spin" /> : "Localizar no mapa"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Redes sociais e contato</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>WhatsApp (link wa.me ou número)</Label>
            <Input value={full.whatsapp_url || ""} onChange={(e) => setFull({ ...full, whatsapp_url: e.target.value })} placeholder="https://wa.me/5511999990000" />
          </div>
          <div className="space-y-2">
            <Label>Instagram (URL do perfil)</Label>
            <Input value={full.instagram_url || ""} onChange={(e) => setFull({ ...full, instagram_url: e.target.value })} placeholder="https://instagram.com/sualoja" />
          </div>
          <div className="space-y-2">
            <Label>Facebook (URL da página)</Label>
            <Input value={full.facebook_url || ""} onChange={(e) => setFull({ ...full, facebook_url: e.target.value })} placeholder="https://facebook.com/sualoja" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Tipos de serviço</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <div className="font-medium">Delivery</div>
              <div className="text-xs text-muted-foreground">Entrega no endereço do cliente.</div>
            </div>
            <Switch checked={full.service_delivery ?? true} onCheckedChange={(v) => setFull({ ...full, service_delivery: v })} />
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <div className="font-medium">Retirada na loja</div>
              <div className="text-xs text-muted-foreground">Cliente busca o pedido no balcão.</div>
            </div>
            <Switch checked={full.service_pickup ?? false} onCheckedChange={(v) => setFull({ ...full, service_pickup: v })} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Horário de funcionamento</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {DAY_LABELS.map((label, i) => {
            const cfg = hours[String(i)] || { open: "18:00", close: "23:00", enabled: false };
            return (
              <div key={i} className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/40">
                <div className="w-24 text-sm font-medium">{label}</div>
                <Switch checked={cfg.enabled} onCheckedChange={(v) => setHours((h) => ({ ...h, [i]: { ...cfg, enabled: v } }))} />
                <Input type="time" value={cfg.open} disabled={!cfg.enabled} onChange={(e) => setHours((h) => ({ ...h, [i]: { ...cfg, open: e.target.value } }))} className="w-32" />
                <span className="text-muted-foreground text-sm">até</span>
                <Input type="time" value={cfg.close} disabled={!cfg.enabled} onChange={(e) => setHours((h) => ({ ...h, [i]: { ...cfg, close: e.target.value } }))} className="w-32" />
                {!cfg.enabled && <span className="text-xs text-muted-foreground ml-auto">Fechado</span>}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground pt-2">O status "Aberto/Fechado" segue automaticamente estes horários, mas você pode abrir ou fechar manualmente a qualquer momento pelo botão no topo do painel.</p>
        </CardContent>
      </Card>

      <div className="flex justify-end sticky bottom-0 bg-background/80 backdrop-blur py-3">
        <Button type="submit" disabled={busy} size="lg">{busy ? "Salvando..." : "Salvar tudo"}</Button>
      </div>
    </form>
    <CoverImageCropper
      open={cropperOpen}
      imageSrc={cropperSrc}
      aspect={16 / 6}
      onCancel={() => {
        setCropperOpen(false);
        if (cropperSrc && cropperSrc.startsWith("blob:") && cropperSrc !== coverPreview && cropperSrc !== full.cover_url) {
          URL.revokeObjectURL(cropperSrc);
        }
        setCropperSrc(null);
      }}
      onConfirm={(blob, url) => {
        if (coverPreview) URL.revokeObjectURL(coverPreview);
        setCoverBlob(blob);
        setCoverPreview(url);
        setCropperOpen(false);
        if (cropperSrc && cropperSrc.startsWith("blob:") && cropperSrc !== url) {
          URL.revokeObjectURL(cropperSrc);
        }
        setCropperSrc(null);
        toast.success("Enquadramento aplicado — clique em Salvar tudo.");
      }}
    />
    </>
  );
}
