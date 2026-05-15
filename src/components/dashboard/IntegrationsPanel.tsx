import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MessageCircle, Utensils, Truck } from "lucide-react";
import { IntegrationStatusCard, IntegrationStatus } from "./IntegrationStatusCard";
import { EvolutionMessagesPanel } from "./EvolutionMessagesPanel";

const sb = supabase as any;

export function IntegrationsPanel({ restaurantId }: { restaurantId: string }) {
  // Evolution
  const evolution = useQuery({
    queryKey: ["evolution-integration", "restaurant", restaurantId],
    queryFn: async () => {
      const { data } = await sb.from("evolution_integrations").select("id,enabled,api_url,api_key,instance_name,last_status").eq("restaurant_id", restaurantId).maybeSingle();
      return data ?? null;
    },
  });
  const evoStatus: IntegrationStatus = evolution.isLoading
    ? "loading"
    : !evolution.data || !evolution.data.api_url || !evolution.data.api_key || !evolution.data.instance_name
    ? "not_configured"
    : evolution.data.enabled ? "connected" : "disabled";
  const evoLabel = evoStatus === "connected" ? `Conectado · ${evolution.data?.last_status ?? "ok"}` : undefined;

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
        As configurações destas integrações são feitas pelo administrador. Aqui você pode verificar se a conexão está funcionando.
      </p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <IntegrationStatusCard
          title="Evolution API (WhatsApp)"
          description="Envio de mensagens em massa"
          icon={<MessageCircle className="w-6 h-6 text-green-600" />}
          iconBgClassName="bg-green-500/10"
          status={evoStatus}
          statusLabel={evoLabel}
          dialogClassName="max-w-3xl max-h-[90vh] overflow-y-auto"
          extraContent={evoStatus !== "not_configured" ? <EvolutionMessagesPanel restaurantId={restaurantId} /> : null}
          onVerify={async () => {
            if (!evolution.data?.id) return { ok: false, message: "Não configurado" };
            const { data, error } = await supabase.functions.invoke("evolution-send", {
              body: { action: "verify", integrationId: evolution.data.id },
            });
            if (error) return { ok: false, message: error.message };
            if ((data as any)?.ok) {
              const state = (data as any)?.data?.instance?.state ?? "ok";
              evolution.refetch();
              return { ok: true, message: `Conectado — estado: ${state}` };
            }
            return { ok: false, message: `Falha (${(data as any)?.status ?? "?"})` };
          }}
        />

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
