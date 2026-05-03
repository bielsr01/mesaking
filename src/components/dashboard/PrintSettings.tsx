import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Printer } from "lucide-react";

export interface PrintSettings {
  logo: boolean;
  business_name: boolean;
  business_address: boolean;
  order_type_date: boolean;
  customer_name: boolean;
  customer_address: boolean;
  customer_phone: boolean;
  products_with_prices: boolean;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  logo: true,
  business_name: true,
  business_address: true,
  order_type_date: true,
  customer_name: true,
  customer_address: true,
  customer_phone: true,
  products_with_prices: true,
};

const FIELDS: { key: keyof PrintSettings; label: string; description: string }[] = [
  { key: "logo", label: "Logo", description: "Imagem da logo no topo do ticket" },
  { key: "business_name", label: "Nome da empresa", description: "Exibe o nome do estabelecimento" },
  { key: "business_address", label: "Endereço do negócio", description: "Endereço completo da loja" },
  { key: "order_type_date", label: "Tipo de pedido e datas", description: "Delivery/Retirada, número e horário" },
  { key: "customer_name", label: "Nome do cliente", description: "Nome de quem fez o pedido" },
  { key: "customer_address", label: "Endereço do cliente", description: "Endereço de entrega" },
  { key: "customer_phone", label: "Telefone do cliente", description: "Telefone de contato" },
  { key: "products_with_prices", label: "Produtos com valores", description: "Lista de itens, valores e total" },
];

export function PrintSettingsCard({ restaurantId }: { restaurantId: string }) {
  const [settings, setSettings] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("print_settings")
        .eq("id", restaurantId)
        .maybeSingle();
      if (data?.print_settings) {
        setSettings({ ...DEFAULT_PRINT_SETTINGS, ...(data.print_settings as any) });
      }
      setLoading(false);
    })();
  }, [restaurantId]);

  const toggle = (key: keyof PrintSettings) =>
    setSettings((s) => ({ ...s, [key]: !s[key] }));

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("restaurants")
      .update({ print_settings: settings as any })
      .eq("id", restaurantId);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Configurações de impressão salvas");
  };

  if (loading) return <Skeleton className="h-96 w-full" />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <Printer className="w-5 h-5" /> Configurar impressões
        </CardTitle>
        <CardDescription>
          Escolha quais informações devem aparecer no ticket de impressão dos pedidos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {FIELDS.map((f) => (
          <div
            key={f.key}
            className="flex items-center justify-between gap-4 p-3 rounded-md border bg-card"
          >
            <div className="min-w-0">
              <Label className="font-medium">{f.label}</Label>
              <p className="text-xs text-muted-foreground">{f.description}</p>
            </div>
            <Switch checked={settings[f.key]} onCheckedChange={() => toggle(f.key)} />
          </div>
        ))}
        <div className="pt-2 flex justify-end">
          <Button onClick={save} disabled={saving}>
            {saving ? "Salvando..." : "Salvar configurações"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
