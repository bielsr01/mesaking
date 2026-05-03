import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Inbox, Zap, Bike, Store, Truck, Plus, Trash2 } from "lucide-react";
import { DeliveryZone } from "@/lib/delivery";

type ReceiveMode = "system" | "system_whatsapp";
type AcceptanceMode = "auto" | "manual";
type FeeMode = "fixed" | "radius";

interface Props {
  restaurantId: string;
}

export function OrderConfigSettings({ restaurantId }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receiveMode, setReceiveMode] = useState<ReceiveMode>("system");
  const [acceptanceMode, setAcceptanceMode] = useState<AcceptanceMode>("manual");
  const [serviceDelivery, setServiceDelivery] = useState(true);
  const [servicePickup, setServicePickup] = useState(false);

  // Taxa de entrega
  const [feeMode, setFeeMode] = useState<FeeMode>("radius");
  const [fixedFee, setFixedFee] = useState<string>("");
  const [timeMin, setTimeMin] = useState<string>("");
  const [timeMax, setTimeMax] = useState<string>("");
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [savingFee, setSavingFee] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("order_receive_mode, order_acceptance_mode, service_delivery, service_pickup, delivery_fee_mode, delivery_fixed_fee, delivery_time_min, delivery_time_max, delivery_zones")
        .eq("id", restaurantId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast.error("Erro ao carregar configurações");
      } else if (data) {
        const d = data as any;
        setReceiveMode((d.order_receive_mode ?? "system") as ReceiveMode);
        setAcceptanceMode((d.order_acceptance_mode ?? "manual") as AcceptanceMode);
        setServiceDelivery(Boolean(d.service_delivery ?? true));
        setServicePickup(Boolean(d.service_pickup ?? false));
        setFeeMode((d.delivery_fee_mode ?? "radius") as FeeMode);
        setFixedFee(d.delivery_fixed_fee != null ? String(d.delivery_fixed_fee) : "");
        setTimeMin(d.delivery_time_min != null ? String(d.delivery_time_min) : "");
        setTimeMax(d.delivery_time_max != null ? String(d.delivery_time_max) : "");
        setZones((d.delivery_zones ?? []) as DeliveryZone[]);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [restaurantId]);

  async function update(patch: Record<string, any>) {
    setSaving(true);
    const { error } = await supabase.from("restaurants").update(patch as any).eq("id", restaurantId);
    setSaving(false);
    if (error) {
      toast.error("Não foi possível salvar");
      return false;
    }
    toast.success("Configuração salva");
    return true;
  }

  async function handleReceiveChange(value: string) {
    if (value === "system_whatsapp") {
      toast.info("Integração com WhatsApp em breve");
      return;
    }
    const v = value as ReceiveMode;
    const prev = receiveMode;
    setReceiveMode(v);
    const ok = await update({ order_receive_mode: v });
    if (!ok) setReceiveMode(prev);
  }

  async function handleAcceptanceChange(value: string) {
    const v = value as AcceptanceMode;
    const prev = acceptanceMode;
    setAcceptanceMode(v);
    const ok = await update({ order_acceptance_mode: v });
    if (!ok) setAcceptanceMode(prev);
  }

  async function handleDeliveryToggle(next: boolean) {
    if (!next && !servicePickup) {
      toast.error("Pelo menos uma forma de pedido deve estar ativa (Delivery ou Retirada).");
      return;
    }
    const prev = serviceDelivery;
    setServiceDelivery(next);
    const ok = await update({ service_delivery: next });
    if (!ok) setServiceDelivery(prev);
  }

  async function handlePickupToggle(next: boolean) {
    if (!next && !serviceDelivery) {
      toast.error("Pelo menos uma forma de pedido deve estar ativa (Delivery ou Retirada).");
      return;
    }
    const prev = servicePickup;
    setServicePickup(next);
    const ok = await update({ service_pickup: next });
    if (!ok) setServicePickup(prev);
  }

  // ===== Taxa de entrega =====
  const addZone = () => setZones((z) => [...z, { radius_km: 0, fee: 0 }]);
  const updateZoneRadius = (i: number, v: string) =>
    setZones((z) => z.map((x, idx) => (idx === i ? { ...x, radius_km: v === "" ? 0 : Number(v) } : x)));
  const updateZoneFee = (i: number, v: string) =>
    setZones((z) => z.map((x, idx) => (idx === i ? { ...x, fee: v === "" ? 0 : Number(v) } : x)));
  const removeZone = (i: number) => setZones((z) => z.filter((_, idx) => idx !== i));

  async function saveFeeConfig() {
    const tMin = timeMin === "" ? null : Number(timeMin);
    const tMax = timeMax === "" ? null : Number(timeMax);
    if (tMin == null || tMax == null || !isFinite(tMin) || !isFinite(tMax)) {
      return toast.error("Informe os tempos mínimo e máximo de entrega");
    }
    if (tMin < 0 || tMax < 0 || tMax < tMin) {
      return toast.error("Tempo máximo deve ser maior ou igual ao mínimo");
    }
    const cleanZones = zones
      .filter((z) => Number(z.radius_km) > 0 && Number(z.fee) >= 0 && Number(z.radius_km) <= 50)
      .map((z) => ({ radius_km: Number(z.radius_km), fee: Number(z.fee) }));
    if (feeMode === "radius" && cleanZones.length === 0) {
      return toast.error("Cadastre ao menos uma faixa de entrega");
    }
    const fixed = Number(fixedFee);
    if (feeMode === "fixed" && (!isFinite(fixed) || fixed < 0)) {
      return toast.error("Informe um valor fixo válido para a taxa de entrega");
    }

    setSavingFee(true);
    const { error } = await supabase
      .from("restaurants")
      .update({
        delivery_fee_mode: feeMode,
        delivery_fixed_fee: feeMode === "fixed" ? fixed : 0,
        delivery_time_min: tMin,
        delivery_time_max: tMax,
        delivery_zones: cleanZones,
      } as any)
      .eq("id", restaurantId);
    setSavingFee(false);
    if (error) return toast.error("Não foi possível salvar as taxas de entrega");
    toast.success("Taxas de entrega salvas");
  }

  if (!loaded) {
    return (
      <div className="space-y-4 max-w-3xl animate-fade-in">
        {[0, 1, 2].map((i) => (
          <Card key={i}>
            <CardHeader><Skeleton className="h-6 w-56" /></CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl animate-fade-in">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-accent text-accent-foreground grid place-items-center">
              <Inbox className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Recebimento de pedidos</CardTitle>
              <CardDescription>Configure por onde recebe e como novos pedidos entram na fila</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="text-sm font-semibold">Aceitar pedidos</div>
            <RadioGroup value={receiveMode} onValueChange={handleReceiveChange} className="gap-3" disabled={saving}>
              <Label
                htmlFor="receive-system"
                className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-accent/40 transition-colors data-[state=checked]:border-primary"
                data-state={receiveMode === "system" ? "checked" : "unchecked"}
              >
                <RadioGroupItem value="system" id="receive-system" className="mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium">Sistema</div>
                  <div className="text-sm text-muted-foreground">Receba os pedidos diretamente pelo painel.</div>
                </div>
              </Label>

              <Label
                htmlFor="receive-system-wpp"
                className="flex items-start gap-3 rounded-lg border p-4 cursor-not-allowed opacity-60"
                aria-disabled
              >
                <RadioGroupItem value="system_whatsapp" id="receive-system-wpp" className="mt-0.5" disabled />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Sistema + WhatsApp</span>
                    <Badge variant="secondary">Em breve</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">Receba pelo painel e também envie/receba notificações via WhatsApp.</div>
                </div>
              </Label>
            </RadioGroup>
          </div>

          <div className="border-t" />

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-muted-foreground" />
              <div className="text-sm font-semibold">Status de entrada de pedidos</div>
            </div>
            <RadioGroup value={acceptanceMode} onValueChange={handleAcceptanceChange} className="gap-3" disabled={saving}>
              <Label
                htmlFor="acc-manual"
                className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-accent/40 transition-colors data-[state=checked]:border-primary"
                data-state={acceptanceMode === "manual" ? "checked" : "unchecked"}
              >
                <RadioGroupItem value="manual" id="acc-manual" className="mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium">Aceitar manualmente</div>
                  <div className="text-sm text-muted-foreground">Cada pedido fica em "pendente" até você aceitar.</div>
                </div>
              </Label>

              <Label
                htmlFor="acc-auto"
                className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-accent/40 transition-colors data-[state=checked]:border-primary"
                data-state={acceptanceMode === "auto" ? "checked" : "unchecked"}
              >
                <RadioGroupItem value="auto" id="acc-auto" className="mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium">Aceitar automaticamente</div>
                  <div className="text-sm text-muted-foreground">Os pedidos entram já confirmados e seguem para o preparo.</div>
                </div>
              </Label>
            </RadioGroup>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-accent text-accent-foreground grid place-items-center">
                <Bike className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Delivery</CardTitle>
                <CardDescription>Quando ativo, os clientes podem solicitar entrega no endereço.</CardDescription>
              </div>
            </div>
            <Switch checked={serviceDelivery} onCheckedChange={handleDeliveryToggle} disabled={saving} aria-label="Ativar delivery" />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {serviceDelivery
              ? "Delivery está ativado e disponível no cardápio do cliente."
              : "Delivery está desativado. A opção não aparecerá no cardápio do cliente."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-accent text-accent-foreground grid place-items-center">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <CardTitle className="text-lg">Retirada</CardTitle>
                <CardDescription>Quando ativo, os clientes podem optar por retirar na loja.</CardDescription>
              </div>
            </div>
            <Switch checked={servicePickup} onCheckedChange={handlePickupToggle} disabled={saving} aria-label="Ativar retirada" />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {servicePickup
              ? "Retirada está ativada e disponível no cardápio do cliente."
              : "Retirada está desativada. A opção não aparecerá no cardápio do cliente."}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-accent text-accent-foreground grid place-items-center">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Configurar taxas de entrega</CardTitle>
              <CardDescription>Defina tempo de entrega e como a taxa será cobrada.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 p-3 rounded-lg border bg-muted/30">
            <div className="space-y-1">
              <Label className="text-xs">Tempo mínimo de entrega (min) *</Label>
              <Input
                type="number"
                min={0}
                step={1}
                value={timeMin}
                onChange={(e) => setTimeMin(e.target.value)}
                placeholder="30"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tempo máximo de entrega (min) *</Label>
              <Input
                type="number"
                min={0}
                step={1}
                value={timeMax}
                onChange={(e) => setTimeMax(e.target.value)}
                placeholder="50"
              />
            </div>
            <p className="text-xs text-muted-foreground col-span-2">Exibido para o cliente como "30-50 min" abaixo do cabeçalho.</p>
          </div>

          <div className="space-y-3">
            <Label className="text-sm font-semibold">Como cobrar a taxa de entrega</Label>
            <RadioGroup
              value={feeMode}
              onValueChange={(v) => setFeeMode(v as FeeMode)}
              className="gap-3"
            >
              <Label
                htmlFor="fee-fixed"
                className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-accent/40 transition-colors data-[state=checked]:border-primary"
                data-state={feeMode === "fixed" ? "checked" : "unchecked"}
              >
                <RadioGroupItem value="fixed" id="fee-fixed" className="mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium">Valor fixo</div>
                  <div className="text-sm text-muted-foreground">Cobra o mesmo valor de entrega para qualquer endereço dentro da sua área de atendimento.</div>
                </div>
              </Label>
              <Label
                htmlFor="fee-radius"
                className="flex items-start gap-3 rounded-lg border p-4 cursor-pointer hover:bg-accent/40 transition-colors data-[state=checked]:border-primary"
                data-state={feeMode === "radius" ? "checked" : "unchecked"}
              >
                <RadioGroupItem value="radius" id="fee-radius" className="mt-0.5" />
                <div className="flex-1">
                  <div className="font-medium">Por raio de entrega</div>
                  <div className="text-sm text-muted-foreground">Define faixas em km e o sistema calcula a taxa pela distância do cliente.</div>
                </div>
              </Label>
            </RadioGroup>
          </div>

          {feeMode === "fixed" ? (
            <div className="space-y-2 p-3 rounded-lg border">
              <Label className="text-xs">Valor fixo da taxa de entrega (R$) *</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={fixedFee}
                onChange={(e) => setFixedFee(e.target.value)}
                placeholder="Ex: 8.00"
              />
              <p className="text-xs text-muted-foreground">
                O valor é exibido para o cliente já no início do checkout, sem precisar digitar o endereço.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Cadastre faixas de raio (em km) e o valor da entrega. O sistema usa a menor faixa cujo raio comporta a distância do cliente.
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
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button type="button" onClick={saveFeeConfig} disabled={savingFee}>
              {savingFee ? "Salvando..." : "Salvar taxas de entrega"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
