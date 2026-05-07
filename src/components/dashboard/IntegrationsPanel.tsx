import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { toast } from "sonner";
import queroLogo from "@/assets/quero-delivery-logo.png";
import { EvolutionIntegrationCard } from "./EvolutionIntegrationCard";

type Integration = {
  id?: string;
  restaurant_id: string;
  api_url: string;
  place_id: string;
  auth_token: string;
  enabled: boolean;
  last_sync_at: string | null;
  last_status: string | null;
};

export function IntegrationsPanel({ restaurantId }: { restaurantId: string }) {
  const [open, setOpen] = useState(false);

  const { data: quero, isLoading } = useQuery({
    queryKey: ["quero-integration", restaurantId],
    queryFn: async () => {
      const { data } = await supabase
        .from("quero_integrations")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      return data as Integration | null;
    },
  });

  const isConfigured = !!quero?.place_id && !!quero?.auth_token;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          className="cursor-pointer hover:shadow-md transition-shadow"
          onClick={() => setOpen(true)}
        >
          <CardHeader className="flex flex-row items-center gap-3 pb-2">
            <img
              src={queroLogo}
              alt="Quero Delivery"
              loading="lazy"
              width={48}
              height={48}
              className="w-12 h-12 object-contain"
            />
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base">Quero Delivery</CardTitle>
              <CardDescription className="text-xs">Importação automática de pedidos</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            ) : isConfigured ? (
              <Badge variant={quero?.enabled ? "default" : "secondary"}>
                {quero?.enabled ? "Conectado" : "Desativado"}
              </Badge>
            ) : (
              <Badge variant="outline">Não configurado</Badge>
            )}
          </CardContent>
        </Card>
        <EvolutionIntegrationCard scope="restaurant" restaurantId={restaurantId} />
      </div>

      <QueroDialog
        open={open}
        onOpenChange={setOpen}
        restaurantId={restaurantId}
        existing={quero ?? null}
      />
    </div>
  );
}

function QueroDialog({
  open,
  onOpenChange,
  restaurantId,
  existing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  restaurantId: string;
  existing: Integration | null;
}) {
  const qc = useQueryClient();
  const [apiUrl, setApiUrl] = useState(existing?.api_url ?? "https://api.quero.io");
  const [placeId, setPlaceId] = useState(existing?.place_id ?? "");
  const [token, setToken] = useState(existing?.auth_token ?? "");
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setApiUrl(existing?.api_url ?? "https://api.quero.io");
    setPlaceId(existing?.place_id ?? "");
    setToken(existing?.auth_token ?? "");
    setEnabled(existing?.enabled ?? true);
    setVerifyResult(null);
  }, [open, existing?.api_url, existing?.place_id, existing?.auth_token, existing?.enabled]);

  const handleVerify = async () => {
    if (!placeId || !token) {
      toast.error("Preencha Place ID e Token");
      return;
    }
    setVerifying(true);
    setVerifyResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("quero-delivery", {
        body: { action: "verify", restaurantId, apiUrl, placeId, token },
      });
      if (error) throw error;
      if (data?.ok) {
        setVerifyResult({ ok: true, msg: "Conexão bem-sucedida" });
        toast.success("Conexão verificada");
      } else {
        setVerifyResult({ ok: false, msg: data?.message || `Falha (${data?.status ?? "?"})` });
        toast.error("Falha ao conectar");
      }
    } catch (e: any) {
      setVerifyResult({ ok: false, msg: e.message || "Erro" });
      toast.error("Erro ao verificar");
    } finally {
      setVerifying(false);
    }
  };

  const handleSave = async () => {
    if (!placeId || !token) {
      toast.error("Preencha Place ID e Token");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        api_url: apiUrl,
        place_id: placeId,
        auth_token: token,
        enabled,
      };
      const { error } = await supabase
        .from("quero_integrations")
        .upsert(payload, { onConflict: "restaurant_id" });
      if (error) throw error;
      toast.success("Integração salva");
      qc.invalidateQueries({ queryKey: ["quero-integration", restaurantId] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("quero-delivery", {
        body: { action: "sync", restaurantId },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success(`${data.imported ?? 0} pedido(s) importado(s)`);
        qc.invalidateQueries();
      } else {
        toast.error(data?.message || "Falha ao sincronizar");
      }
    } catch (e: any) {
      toast.error(e.message || "Erro");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <img src={queroLogo} alt="" width={32} height={32} className="w-8 h-8 object-contain" />
            Quero Delivery
          </DialogTitle>
          <DialogDescription>
            Configure os códigos da API para importar pedidos automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>API URL</Label>
            <Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://api.quero.io" />
          </div>
          <div className="space-y-2">
            <Label>Place ID</Label>
            <Input value={placeId} onChange={(e) => setPlaceId(e.target.value)} placeholder="ObjectId do place" />
          </div>
          <div className="space-y-2">
            <Label>Token (Authorization)</Label>
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Token Basic"
              type="password"
            />
            <p className="text-xs text-muted-foreground">
              Cole o token completo. Se não começar com "Basic" ou "Bearer", "Basic " será adicionado.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="cursor-pointer">Integração ativa</Label>
              <p className="text-xs text-muted-foreground">Importar pedidos automaticamente</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {verifyResult && (
            <div
              className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
                verifyResult.ok ? "border-green-500/50 text-green-700 dark:text-green-400" : "border-destructive/50 text-destructive"
              }`}
            >
              {verifyResult.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <XCircle className="w-4 h-4 mt-0.5" />}
              <span className="break-all">{verifyResult.msg}</span>
            </div>
          )}

          {existing?.last_sync_at && (
            <p className="text-xs text-muted-foreground">
              Última sincronização: {new Date(existing.last_sync_at).toLocaleString("pt-BR")}
              {existing.last_status ? ` — ${existing.last_status}` : ""}
            </p>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleVerify} disabled={verifying}>
            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Verificar conexão
          </Button>
          {existing && (
            <Button variant="outline" onClick={handleSync} disabled={syncing}>
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Sincronizar agora
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
