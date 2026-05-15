import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Utensils, Truck } from "lucide-react";
import { IntegrationStatusCard, IntegrationStatus } from "./IntegrationStatusCard";
import { WhatsAppConnectionCard } from "./WhatsAppConnectionCard";

const sb = supabase as any;

export function IntegrationsPanel({ restaurantId }: { restaurantId: string }) {
  // iHub
  const ihub = useQuery({
    queryKey: ["ihub-integration", restaurantId],
    queryFn: async () => {
      const { data } = await sb.from("ihub_integrations").select("id,enabled,secret_token,merchant_id,merchant_name,domain").eq("restaurant_id", restaurantId).maybeSingle();
      return data ?? null;
    },
  });
  const ihubStatus: IntegrationStatus = ihub.isLoading
    ? "loading"
    : !ihub.data?.secret_token || !ihub.data?.merchant_id
    ? "not_configured"
    : ihub.data.enabled ? "connected" : "disabled";

  // Quero
  const quero = useQuery({
    queryKey: ["quero-integration", restaurantId],
    queryFn: async () => {
      const { data } = await sb.from("quero_integrations").select("id,enabled,token,place_id,last_status").eq("restaurant_id", restaurantId).maybeSingle();
      return data ?? null;
    },
  });
  const queroStatus: IntegrationStatus = quero.isLoading
    ? "loading"
    : !quero.data?.token || !quero.data?.place_id
    ? "not_configured"
    : quero.data.enabled ? "connected" : "disabled";

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Conecte aqui o WhatsApp da sua loja e veja o status das integrações com iFood e Quero Delivery.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <WhatsAppConnectionCard restaurantId={restaurantId} />

        <IntegrationStatusCard
          title="iHub (iFood)"
          description="Receber pedidos do iFood via iHub"
          icon={<Utensils className="w-6 h-6 text-primary" />}
          status={ihubStatus}
          statusLabel={ihubStatus === "connected" ? `Conectado · ${ihub.data?.merchant_name ?? "loja vinculada"}` : undefined}
          onVerify={async () => {
            if (!ihub.data?.secret_token) return { ok: false, message: "Token não configurado" };
            if (!ihub.data?.merchant_id) return { ok: false, message: "Loja iFood não vinculada" };
            if (!ihub.data?.enabled) return { ok: false, message: "Integração desativada" };
            return { ok: true, message: `Configuração OK. Loja: ${ihub.data.merchant_name ?? ihub.data.merchant_id}` };
          }}
        />

        <IntegrationStatusCard
          title="Quero Delivery"
          description="Receber pedidos do Quero Delivery"
          icon={<Truck className="w-6 h-6 text-primary" />}
          status={queroStatus}
          statusLabel={queroStatus === "connected" && quero.data?.last_status && quero.data.last_status !== "ok" ? `Conectado · ${quero.data.last_status}` : undefined}
          onVerify={async () => {
            if (!quero.data?.token || !quero.data?.place_id) return { ok: false, message: "Não configurado" };
            const { data, error } = await supabase.functions.invoke("quero-poll", { body: { restaurantId } });
            if (error) return { ok: false, message: error.message };
            const r = (data as any)?.results?.[0];
            quero.refetch();
            if (r?.error) return { ok: false, message: `Quero: ${r.error}` };
            return { ok: true, message: `Polling OK — ${r?.events ?? 0} evento(s)` };
          }}
        />
      </div>
    </div>
  );
}
