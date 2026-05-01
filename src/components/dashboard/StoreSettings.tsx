import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, MapPin, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DAY_LABELS, defaultHours, OpeningHours } from "@/lib/hours";
import { DeliveryZone, geocodeAddress } from "@/lib/delivery";
import { brl, formatPhone } from "@/lib/format";

type Restaurant = {
  id: string; name: string; slug: string;
  description?: string | null; phone?: string | null; logo_url?: string | null;
  opening_hours?: OpeningHours | null;
  address_cep?: string | null; address_street?: string | null; address_number?: string | null;
  address_complement?: string | null; address_neighborhood?: string | null;
  address_city?: string | null; address_state?: string | null;
  latitude?: number | null; longitude?: number | null;
  delivery_zones?: DeliveryZone[] | null;
};

export function StoreSettings({ restaurant, onUpdated }: { restaurant: Restaurant; onUpdated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [full, setFull] = useState<Restaurant>(restaurant);
  const [hours, setHours] = useState<OpeningHours>(defaultHours());
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("restaurants").select("*").eq("id", restaurant.id).maybeSingle();
      if (!data) return;
      setFull(data as unknown as Restaurant);
      const oh = data.opening_hours as unknown as OpeningHours | null;
      setHours(oh && Object.keys(oh).length ? oh : defaultHours());
      setZones(((data.delivery_zones as unknown) ?? []) as DeliveryZone[]);
    })();
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
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const file = fd.get("logo") as File | null;
    let logo_url: string | null | undefined;
    if (file && file.size > 0) {
      const path = `${restaurant.id}/logo-${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const { error: upErr } = await supabase.storage.from("menu-images").upload(path, file, { upsert: true });
      if (upErr) { setBusy(false); return toast.error(upErr.message); }
      logo_url = supabase.storage.from("menu-images").getPublicUrl(path).data.publicUrl;
    }

    // Validar zonas
    const cleanZones = zones
      .filter((z) => Number(z.radius_km) > 0 && Number(z.fee) >= 0 && Number(z.radius_km) <= 50)
      .map((z) => ({ radius_km: Number(z.radius_km), fee: Number(z.fee) }));

    const update: any = {
      name: full.name,
      description: full.description || null,
      phone: full.phone || null,
      address_cep: full.address_cep || null,
      address_street: full.address_street || null,
      address_number: full.address_number || null,
      address_complement: full.address_complement || null,
      address_neighborhood: full.address_neighborhood || null,
      address_city: full.address_city || null,
      address_state: full.address_state || null,
      latitude: full.latitude ?? null,
      longitude: full.longitude ?? null,
      opening_hours: hours,
      delivery_zones: cleanZones,
    };
    if (logo_url !== undefined) update.logo_url = logo_url;

    const { error } = await supabase.from("restaurants").update(update).eq("id", restaurant.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Configurações salvas");
    onUpdated();
  };

  return (
    <form onSubmit={save} className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader><CardTitle>Informações da loja</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Nome</Label><Input value={full.name || ""} onChange={(e) => setFull({ ...full, name: e.target.value })} required /></div>
            <div className="space-y-2"><Label>Telefone</Label><Input value={formatPhone(full.phone || "")} onChange={(e) => setFull({ ...full, phone: formatPhone(e.target.value) })} placeholder="(11) 99999-0000" inputMode="tel" /></div>
          </div>
          <div className="space-y-2"><Label>Descrição</Label><Textarea value={full.description || ""} onChange={(e) => setFull({ ...full, description: e.target.value })} rows={2} /></div>
          <div className="space-y-2"><Label>Logo</Label><Input name="logo" type="file" accept="image/*" /></div>
          <div className="space-y-2"><Label>URL pública</Label><Input value={`/r/${restaurant.slug}`} readOnly /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Endereço do restaurante</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2"><Label>CEP</Label><Input value={full.address_cep || ""} onChange={(e) => setFull({ ...full, address_cep: e.target.value })} onBlur={(e) => lookupCep(e.target.value)} placeholder="00000-000" /></div>
            <div className="space-y-2 col-span-2"><Label>Rua</Label><Input value={full.address_street || ""} onChange={(e) => setFull({ ...full, address_street: e.target.value })} /></div>
            <div className="space-y-2"><Label>Número</Label><Input value={full.address_number || ""} onChange={(e) => setFull({ ...full, address_number: e.target.value })} /></div>
            <div className="space-y-2 col-span-2"><Label>Complemento</Label><Input value={full.address_complement || ""} onChange={(e) => setFull({ ...full, address_complement: e.target.value })} /></div>
            <div className="space-y-2 col-span-2"><Label>Bairro</Label><Input value={full.address_neighborhood || ""} onChange={(e) => setFull({ ...full, address_neighborhood: e.target.value })} /></div>
            <div className="space-y-2"><Label>Cidade</Label><Input value={full.address_city || ""} onChange={(e) => setFull({ ...full, address_city: e.target.value })} /></div>
            <div className="space-y-2"><Label>UF</Label><Input maxLength={2} value={full.address_state || ""} onChange={(e) => setFull({ ...full, address_state: e.target.value.toUpperCase() })} /></div>
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

      <Card>
        <CardHeader>
          <CardTitle>Taxas de entrega por raio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Cadastre faixas de raio (em km) e o valor da entrega. O sistema usa a menor faixa cujo raio comporta a distância do cliente.
            Ex: <strong>5 km → R$ 7</strong> e <strong>10 km → R$ 12</strong> significa que pedidos até 5 km pagam R$ 7 e entre 5 e 10 km pagam R$ 12.
            Pedidos acima do maior raio cadastrado ficam fora da área de entrega.
          </p>
          {zones.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-4 border-2 border-dashed rounded-lg">
              Nenhuma zona cadastrada — sem cobrança de entrega.
            </div>
          )}
          {zones.map((z, i) => (
            <div key={i} className="flex items-end gap-3 p-3 rounded-lg border">
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Raio máximo (km)</Label>
                <Input
                  type="number"
                  min={0}
                  max={50}
                  step={0.1}
                  value={z.radius_km === 0 ? "" : z.radius_km}
                  onChange={(e) => updateZoneRadius(i, e.target.value)}
                />
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs">Taxa de entrega (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={z.fee === 0 ? "" : z.fee}
                  onChange={(e) => updateZoneFee(i, e.target.value)}
                />
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => removeZone(i)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={addZone}><Plus className="w-4 h-4 mr-1" /> Adicionar faixa</Button>
        </CardContent>
      </Card>

      <div className="flex justify-end sticky bottom-0 bg-background/80 backdrop-blur py-3">
        <Button type="submit" disabled={busy} size="lg">{busy ? "Salvando..." : "Salvar tudo"}</Button>
      </div>
    </form>
  );
}
