import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { RefreshCw, CheckCircle2, AlertCircle, Inbox } from "lucide-react";
import { toast } from "sonner";

interface IhubEvent {
  id: string;
  event_id: string | null;
  code: string | null;
  full_code: string | null;
  order_id: string | null;
  merchant_id: string | null;
  processed: boolean;
  error: string | null;
  payload: any;
  created_at: string;
}

interface Props {
  restaurantId: string;
}

export function IfoodEventsTab({ restaurantId }: Props) {
  const qc = useQueryClient();
  const queryKey = ["ihub_events", restaurantId];

  const { data: events = [], isLoading, refetch, isFetching } = useQuery<IhubEvent[]>({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ihub_events")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as IhubEvent[];
    },
    refetchInterval: 5000,
  });

  const { data: integration } = useQuery({
    queryKey: ["ihub_integration", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ihub_integrations")
        .select("enabled, merchant_id, merchant_name, last_event_at, last_event_code")
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel(`ihub-events-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ihub_events", filter: `restaurant_id=eq.${restaurantId}` },
        () => {
          qc.invalidateQueries({ queryKey });
          toast.success("📥 Novo evento iFood recebido!");
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [restaurantId, qc]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-sm font-medium">Status da integração iHub/iFood</div>
            <div className="text-xs text-muted-foreground">
              {integration?.enabled ? (
                <>
                  ✅ Conectada · Merchant:{" "}
                  <span className="font-mono">
                    {integration.merchant_name ?? integration.merchant_id ?? "—"}
                  </span>
                </>
              ) : (
                "❌ Não configurada"
              )}
            </div>
            {integration?.last_event_at && (
              <div className="text-xs text-muted-foreground">
                Último evento: {new Date(integration.last_event_at).toLocaleString("pt-BR")}{" "}
                {integration.last_event_code && (
                  <Badge variant="outline" className="ml-1">
                    {integration.last_event_code}
                  </Badge>
                )}
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </CardContent>
      </Card>

      <div>
        <div className="text-sm text-muted-foreground mb-2">
          Webhooks recebidos ({events.length}) — atualiza automaticamente a cada 5s
        </div>

        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : events.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground space-y-2">
              <Inbox className="w-10 h-10 mx-auto opacity-50" />
              <div className="font-medium">Nenhum webhook recebido ainda</div>
              <div className="text-xs">
                Envie um pedido teste pelo iFood. Quando o webhook chegar, ele aparece aqui em tempo real.
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {events.map((ev) => (
              <Card key={ev.id} className="shadow-soft">
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      {ev.processed ? (
                        <Badge variant="default" className="gap-1 bg-success text-success-foreground">
                          <CheckCircle2 className="w-3 h-3" /> Processado
                        </Badge>
                      ) : ev.error ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertCircle className="w-3 h-3" /> Erro
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Pendente</Badge>
                      )}
                      {ev.code && <Badge variant="outline">{ev.full_code ?? ev.code}</Badge>}
                      <span className="text-xs text-muted-foreground">
                        {new Date(ev.created_at).toLocaleString("pt-BR")}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs grid grid-cols-2 gap-x-3 gap-y-1">
                    {ev.order_id && (
                      <div>
                        <span className="text-muted-foreground">order_id:</span>{" "}
                        <span className="font-mono">{ev.order_id}</span>
                      </div>
                    )}
                    {ev.merchant_id && (
                      <div>
                        <span className="text-muted-foreground">merchant_id:</span>{" "}
                        <span className="font-mono">{ev.merchant_id}</span>
                      </div>
                    )}
                    {ev.event_id && (
                      <div>
                        <span className="text-muted-foreground">event_id:</span>{" "}
                        <span className="font-mono">{ev.event_id}</span>
                      </div>
                    )}
                  </div>
                  {ev.error && (
                    <div className="text-xs bg-destructive/10 text-destructive p-2 rounded">
                      {ev.error}
                    </div>
                  )}
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                      Ver payload
                    </summary>
                    <pre className="mt-2 p-2 bg-muted rounded overflow-auto max-h-64 text-[10px]">
                      {JSON.stringify(ev.payload, null, 2)}
                    </pre>
                  </details>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
