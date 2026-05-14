import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Bike, Save, LayoutGrid } from "lucide-react";
import { DEFAULT_IFOOD_FEES, type IfoodFeeSettings } from "@/lib/ifoodFees";

interface WidgetSettings { widget_enabled: boolean; widget_merchant_id: string; }
const DEFAULT_WIDGET: WidgetSettings = { widget_enabled: false, widget_merchant_id: "" };

const sb = supabase as any;

interface RestaurantOption { id: string; name: string }

export function AdminIfoodFeesPanel() {
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [restaurantId, setRestaurantId] = useState<string>("");
  const [settings, setSettings] = useState<IfoodFeeSettings>(DEFAULT_IFOOD_FEES);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("restaurants").select("id,name").order("name");
      setRestaurants((data ?? []) as any);
      if (data && data.length && !restaurantId) setRestaurantId((data as any)[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!restaurantId) return;
    (async () => {
      setLoading(true);
      const { data } = await sb.from("ifood_fee_settings").select("*").eq("restaurant_id", restaurantId).maybeSingle();
      if (data) {
        setSettings({
          enabled: data.enabled !== false,
          commission_enabled: !!data.commission_enabled,
          commission_pct: Number(data.commission_pct ?? 0),
          card_enabled: !!data.card_enabled,
          card_pct: Number(data.card_pct ?? 0),
          anticipation_enabled: !!data.anticipation_enabled,
          anticipation_pct: Number(data.anticipation_pct ?? 0),
        });
      } else {
        setSettings(DEFAULT_IFOOD_FEES);
      }
      setLoading(false);
    })();
  }, [restaurantId]);

  const save = async () => {
    if (!restaurantId) return;
    setSaving(true);
    const { error } = await sb.from("ifood_fee_settings").upsert({
      restaurant_id: restaurantId,
      ...settings,
    }, { onConflict: "restaurant_id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Taxas do iFood salvas");
  };

  type FeeKey = "commission" | "card" | "anticipation";
  const feeRows: { key: FeeKey; label: string; description: string }[] = [
    { key: "commission", label: "Comissão da plataforma", description: "Comissão percentual sobre cada pedido (ex.: 12%, 23%)." },
    { key: "card", label: "Taxa de uso do cartão", description: "Percentual cobrado pela transação no cartão (ex.: 3,2%)." },
    { key: "anticipation", label: "Taxa de antecipação", description: "Percentual cobrado quando o repasse é antecipado (padrão 2%)." },
  ];

  const update = (k: FeeKey, field: "enabled" | "pct", v: boolean | number) => {
    setSettings((s) => ({
      ...s,
      [`${k}_${field}`]: v,
    } as IfoodFeeSettings));
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bike className="w-5 h-5" /> Configurações iFood</CardTitle>
          <p className="text-sm text-muted-foreground">
            Defina as taxas que o iFood cobra para que o sistema calcule o valor recebido em cada pedido.
            <br />
            Regra do cálculo: a base é <strong>subtotal + entrega − cupons subsidiados pela loja</strong>.
            Cupons subsidiados pelo iFood entram na base. A taxa de uso da plataforma (R$0,99) é paga pelo cliente e não entra no cálculo.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Restaurante</Label>
            <Select value={restaurantId} onValueChange={setRestaurantId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {restaurants.map((r) => (<SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="text-sm text-muted-foreground">Carregando...</div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border p-3 flex items-center justify-between gap-3 bg-muted/30">
                <div>
                  <div className="font-medium">Ativar Detalhamento de Taxas</div>
                  <div className="text-xs text-muted-foreground">
                    Quando desativado, o sistema não mostra a tabela de detalhamento e não desconta as taxas no faturamento líquido (líquido = faturado).
                  </div>
                </div>
                <Switch checked={settings.enabled} onCheckedChange={(v) => setSettings((s) => ({ ...s, enabled: v }))} />
              </div>
              {feeRows.map((row) => {
                const enabledKey = `${row.key}_enabled` as keyof IfoodFeeSettings;
                const pctKey = `${row.key}_pct` as keyof IfoodFeeSettings;
                const enabled = !!settings[enabledKey];
                const pct = Number(settings[pctKey] ?? 0);
                return (
                  <div key={row.key} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium">{row.label}</div>
                        <div className="text-xs text-muted-foreground">{row.description}</div>
                      </div>
                      <Switch checked={enabled} onCheckedChange={(v) => update(row.key, "enabled", v)} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        disabled={!enabled}
                        value={Number.isFinite(pct) ? pct : 0}
                        onChange={(e) => update(row.key, "pct", Number(e.target.value))}
                        className="max-w-[140px]"
                      />
                      <span className="text-sm text-muted-foreground">%</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button onClick={save} disabled={saving || loading || !restaurantId}>
              <Save className="w-4 h-4 mr-2" />{saving ? "Salvando..." : "Salvar taxas"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
