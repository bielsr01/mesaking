import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Printer, ChefHat } from "lucide-react";

export interface PrintSettings {
  logo: boolean;
  business_name: boolean;
  business_address: boolean;
  order_type_date: boolean;
  customer_name: boolean;
  customer_address: boolean;
  customer_phone: boolean;
  products: boolean;
  prices: boolean;
  payment_method: boolean;
  /** @deprecated kept for backwards-compat with old DB rows */
  products_with_prices?: boolean;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  logo: true,
  business_name: true,
  business_address: true,
  order_type_date: true,
  customer_name: true,
  customer_address: true,
  customer_phone: true,
  products: true,
  prices: true,
  payment_method: true,
};

export const DEFAULT_KITCHEN_PRINT_SETTINGS: PrintSettings = {
  logo: true,
  business_name: true,
  business_address: false,
  order_type_date: true,
  customer_name: true,
  customer_address: true,
  customer_phone: true,
  products: true,
  prices: false,
  payment_method: false,
};

/** Normalize legacy `products_with_prices` into split fields */
export function normalizePrintSettings(
  raw: Partial<PrintSettings> | null | undefined,
  defaults: PrintSettings,
): PrintSettings {
  const merged: PrintSettings = { ...defaults, ...(raw ?? {}) };
  if (raw && "products_with_prices" in raw && raw.products_with_prices !== undefined) {
    if (raw.products === undefined) merged.products = !!raw.products_with_prices;
    if (raw.prices === undefined) merged.prices = !!raw.products_with_prices;
  }
  return merged;
}

const FIELDS: { key: keyof PrintSettings; label: string; description: string }[] = [
  { key: "logo", label: "Logo", description: "Imagem da logo no topo do ticket" },
  { key: "business_name", label: "Nome da empresa", description: "Exibe o nome do estabelecimento" },
  { key: "business_address", label: "Endereço do negócio", description: "Endereço completo da loja" },
  { key: "order_type_date", label: "Tipo de pedido e datas", description: "Delivery/Retirada, número e horário" },
  { key: "customer_name", label: "Nome do cliente", description: "Nome de quem fez o pedido" },
  { key: "customer_address", label: "Endereço do cliente", description: "Endereço de entrega" },
  { key: "customer_phone", label: "Telefone do cliente", description: "Telefone de contato" },
  { key: "products", label: "Produtos", description: "Lista de itens do pedido" },
  { key: "prices", label: "Valores", description: "Preços, subtotal, taxa e total" },
  { key: "payment_method", label: "Forma de pagamento", description: "Como o cliente vai pagar" },
];

function SettingsCard({
  title,
  icon,
  description,
  settings,
  onChange,
  onSave,
  saving,
}: {
  title: string;
  icon: React.ReactNode;
  description: string;
  settings: PrintSettings;
  onChange: (s: PrintSettings) => void;
  onSave: () => void;
  saving: boolean;
}) {
  const toggle = (key: keyof PrintSettings) =>
    onChange({ ...settings, [key]: !settings[key] });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          {icon} {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
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
            <Switch checked={!!settings[f.key]} onCheckedChange={() => toggle(f.key)} />
          </div>
        ))}
        <div className="pt-2 flex justify-end">
          <Button onClick={onSave} disabled={saving}>
            {saving ? "Salvando..." : "Salvar configurações"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function PrintSettingsCard({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const [customer, setCustomer] = useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [kitchen, setKitchen] = useState<PrintSettings>(DEFAULT_KITCHEN_PRINT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [savingKitchen, setSavingKitchen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("print_settings,kitchen_print_settings")
        .eq("id", restaurantId)
        .maybeSingle();
      setCustomer(normalizePrintSettings(data?.print_settings as any, DEFAULT_PRINT_SETTINGS));
      setKitchen(normalizePrintSettings((data as any)?.kitchen_print_settings, DEFAULT_KITCHEN_PRINT_SETTINGS));
      setLoading(false);
    })();
  }, [restaurantId]);

  const saveCustomer = async () => {
    setSavingCustomer(true);
    // Strip legacy field so it never overrides the new split toggles
    const { products_with_prices: _legacy, ...clean } = customer as any;
    const { error } = await supabase
      .from("restaurants")
      .update({ print_settings: clean })
      .eq("id", restaurantId);
    setSavingCustomer(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["restaurant-print-info", restaurantId] });
    toast.success("Configurações do ticket do cliente salvas");
  };

  const saveKitchen = async () => {
    setSavingKitchen(true);
    const { products_with_prices: _legacy, ...clean } = kitchen as any;
    const { error } = await supabase
      .from("restaurants")
      .update({ kitchen_print_settings: clean } as any)
      .eq("id", restaurantId);
    setSavingKitchen(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["restaurant-print-info", restaurantId] });
    toast.success("Configurações do ticket da cozinha salvas");
  };

  if (loading) return <Skeleton className="h-96 w-full" />;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <SettingsCard
        title="Ticket do cliente"
        icon={<Printer className="w-5 h-5" />}
        description="Informações que aparecem no ticket entregue ao cliente."
        settings={customer}
        onChange={setCustomer}
        onSave={saveCustomer}
        saving={savingCustomer}
      />
      <SettingsCard
        title="Ticket da cozinha"
        icon={<ChefHat className="w-5 h-5" />}
        description="Informações que aparecem no ticket usado pela cozinha."
        settings={kitchen}
        onChange={setKitchen}
        onSave={saveKitchen}
        saving={savingKitchen}
      />
    </div>
  );
}
