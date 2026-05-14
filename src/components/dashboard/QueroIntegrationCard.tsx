import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Truck, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const sb = supabase as any;

export function QueroIntegrationCard({ restaurantId }: { restaurantId: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["quero-integration", restaurantId],
    queryFn: async () => {
      const { data } = await sb.from("quero_integrations").select("*").eq("restaurant_id", restaurantId).maybeSingle();
      return data ?? null;
    },
  });

  const [token, setToken] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!open) return;
    setToken(data?.token ?? "");
    setPlaceId(data?.place_id ?? "");
    setEnabled(data?.enabled ?? true);
  }, [open, data]);

  const save = async () => {
    if (!token.trim()) return toast.error("Informe o token Basic do Quero");
    if (!placeId.trim()) return toast.error("Informe o placeId");
    setSaving(true);
    const { error } = await sb.from("quero_integrations").upsert({
      restaurant_id: restaurantId,
      token: token.trim(),
      place_id: placeId.trim(),
      enabled,
    }, { onConflict: "restaurant_id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Integração Quero Delivery salva");
    qc.invalidateQueries({ queryKey: ["quero-integration", restaurantId] });
  };

  const testNow = async () => {
    setPolling(true);
    const { data: res, error } = await supabase.functions.invoke("quero-poll", { body: { restaurantId } });
    setPolling(false);
    if (error) return toast.error(error.message);
    const r = (res as any)?.results?.[0];
    if (r?.error) toast.error(`Quero: ${r.error}`);
    else toast.success(`Polling executado — ${r?.events ?? 0} eventos`);
    qc.invalidateQueries({ queryKey: ["quero-integration", restaurantId] });
    qc.invalidateQueries({ queryKey: ["quero-events", restaurantId] });
  };

  const isConfigured = !!data?.token && !!data?.place_id;

  return (
    <>
      <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setOpen(true)}>
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
            <Truck className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">Quero Delivery</CardTitle>
            <CardDescription className="text-xs">Receber pedidos do Quero Delivery automaticamente</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : isConfigured ? (
            <Badge variant={data?.enabled ? "default" : "secondary"}>
              {data?.enabled ? "Conectado" : "Desativado"}
            </Badge>
          ) : (
            <Badge variant="outline">Não configurado</Badge>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Integração Quero Delivery</DialogTitle>
            <DialogDescription>
              Cole o token Basic gerado no painel do Quero e o placeId da sua loja.
              O sistema buscará e sincronizará pedidos automaticamente a cada 5 segundos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Token Basic</Label>
              <Input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="cole o token (com ou sem prefixo Basic)"
                type="password"
              />
              <p className="text-xs text-muted-foreground">
                Use o token de autenticação fornecido pela equipe Quero Delivery.
              </p>
            </div>

            <div className="space-y-2">
              <Label>placeId</Label>
              <Input
                value={placeId}
                onChange={(e) => setPlaceId(e.target.value)}
                placeholder="ObjectId do place (ex: 6634a8...)"
                className="font-mono text-xs"
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="cursor-pointer">Integração ativa</Label>
                <p className="text-xs text-muted-foreground">Importar pedidos automaticamente</p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            {data?.last_poll_at && (
              <div className="text-xs text-muted-foreground space-y-0.5 rounded-md border p-2 bg-muted/30">
                <div>Última checagem: {new Date(data.last_poll_at).toLocaleString("pt-BR")}</div>
                {data.last_event_at && <div>Último evento: {new Date(data.last_event_at).toLocaleString("pt-BR")} {data.last_event_code ? `— ${data.last_event_code}` : ""}</div>}
                {data.last_status && data.last_status !== "ok" && <div className="text-destructive">Erro: {data.last_status}</div>}
              </div>
            )}

            <QueroEventsViewer restaurantId={restaurantId} />
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={testNow} disabled={polling || !isConfigured}>
              {polling ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              Testar polling agora
            </Button>
            <Button onClick={save} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function QueroEventsViewer({ restaurantId }: { restaurantId: string }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { data: events, isFetching, refetch } = useQuery({
    queryKey: ["quero-events", restaurantId],
    queryFn: async () => {
      const { data } = await sb.from("quero_events").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }).limit(50);
      return data ?? [];
    },
  });

  return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm">Eventos recebidos do polling</Label>
        <Button type="button" variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          <span className="ml-1 text-xs">Atualizar</span>
        </Button>
      </div>

      {!events || events.length === 0 ? (
        <p className="text-xs text-muted-foreground italic py-2">Nenhum evento recebido ainda.</p>
      ) : (
        <div className="space-y-1 max-h-[320px] overflow-y-auto">
          {events.map((ev: any) => {
            const isOpen = expandedId === ev.id;
            return (
              <div key={ev.id} className="rounded border bg-muted/30 text-xs">
                <button type="button" onClick={() => setExpandedId(isOpen ? null : ev.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/60">
                  {isOpen ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronRight className="w-3 h-3 shrink-0" />}
                  <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                    {new Date(ev.created_at).toLocaleString("pt-BR")}
                  </span>
                  <Badge variant={ev.processed ? "default" : ev.error ? "destructive" : "secondary"} className="text-[10px] py-0 h-4">
                    {ev.status || "?"}
                  </Badge>
                  {ev.order_code && <span className="font-mono text-[10px] truncate">#{ev.order_code}</span>}
                  {ev.error && <span className="text-destructive truncate">{ev.error}</span>}
                </button>
                {isOpen && (
                  <div className="border-t p-2 space-y-1">
                    <pre className="bg-background border rounded p-2 overflow-x-auto text-[10px] max-h-64">
{JSON.stringify(ev.payload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
