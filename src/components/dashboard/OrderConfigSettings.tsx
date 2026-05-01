import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Inbox, Zap, Bike, Store } from "lucide-react";

type ReceiveMode = "system" | "system_whatsapp";
type AcceptanceMode = "auto" | "manual";

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("order_receive_mode, order_acceptance_mode, service_delivery, service_pickup")
        .eq("id", restaurantId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        toast.error("Erro ao carregar configurações");
      } else if (data) {
        setReceiveMode(((data as any).order_receive_mode ?? "system") as ReceiveMode);
        setAcceptanceMode(((data as any).order_acceptance_mode ?? "manual") as AcceptanceMode);
        setServiceDelivery(Boolean((data as any).service_delivery ?? true));
        setServicePickup(Boolean((data as any).service_pickup ?? false));
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [restaurantId]);

  async function update(patch: Partial<{ order_receive_mode: ReceiveMode; order_acceptance_mode: AcceptanceMode; service_delivery: boolean; service_pickup: boolean }>) {
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
      // Temporariamente desativado
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

  if (!loaded) {
    return (
      <div className="space-y-4 max-w-3xl animate-fade-in">
        {[0, 1].map((i) => (
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
    </div>
  );
}
