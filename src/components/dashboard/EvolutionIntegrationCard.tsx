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
import { Loader2, RefreshCw, CheckCircle2, XCircle, MessageCircle } from "lucide-react";
import { toast } from "sonner";

const sb = supabase as any;

export function EvolutionIntegrationCard({
  scope,
  restaurantId,
}: {
  scope: "restaurant" | "admin";
  restaurantId?: string;
}) {
  const [open, setOpen] = useState(false);
  const queryKey = ["evolution-integration", scope, restaurantId ?? "admin"];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = sb.from("evolution_integrations").select("*");
      q = scope === "admin" ? q.eq("is_admin", true) : q.eq("restaurant_id", restaurantId);
      const { data } = await q.maybeSingle();
      return data ?? null;
    },
  });

  const isConfigured = !!data?.api_url && !!data?.api_key && !!data?.instance_name;

  return (
    <>
      <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setOpen(true)}>
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <div className="w-12 h-12 rounded-lg bg-green-500/10 grid place-items-center">
            <MessageCircle className="w-6 h-6 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">Evolution API (WhatsApp)</CardTitle>
            <CardDescription className="text-xs">Envio de mensagens em massa</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : isConfigured ? (
            <Badge variant={data?.enabled ? "default" : "secondary"}>
              {data?.enabled ? `Conectado · ${data?.last_status ?? "ok"}` : "Desativado"}
            </Badge>
          ) : (
            <Badge variant="outline">Não configurado</Badge>
          )}
        </CardContent>
      </Card>

      <EvolutionDialog
        open={open}
        onOpenChange={setOpen}
        scope={scope}
        restaurantId={restaurantId}
        existing={data ?? null}
        queryKey={queryKey}
      />
    </>
  );
}

function EvolutionDialog({
  open, onOpenChange, scope, restaurantId, existing, queryKey,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  scope: "restaurant" | "admin";
  restaurantId?: string;
  existing: any;
  queryKey: any[];
}) {
  const qc = useQueryClient();
  const [apiUrl, setApiUrl] = useState(existing?.api_url ?? "");
  const [apiKey, setApiKey] = useState(existing?.api_key ?? "");
  const [instance, setInstance] = useState(existing?.instance_name ?? "");
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    setApiUrl(existing?.api_url ?? "");
    setApiKey(existing?.api_key ?? "");
    setInstance(existing?.instance_name ?? "");
    setEnabled(existing?.enabled ?? true);
  }, [existing, open]);

  const handleVerify = async () => {
    if (!apiUrl || !apiKey || !instance) return toast.error("Preencha todos os campos");
    setVerifying(true); setVerifyResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("evolution-send", {
        body: { action: "verify", apiUrl, apiKey, instance },
      });
      if (error) throw error;
      if (data?.ok) { setVerifyResult({ ok: true, msg: `Estado: ${data?.data?.instance?.state ?? "ok"}` }); toast.success("Conectado"); }
      else { setVerifyResult({ ok: false, msg: `Falha (${data?.status ?? "?"})` }); toast.error("Falha ao conectar"); }
    } catch (e: any) {
      setVerifyResult({ ok: false, msg: e.message || "Erro" });
    } finally { setVerifying(false); }
  };

  const handleSave = async () => {
    if (!apiUrl || !apiKey || !instance) return toast.error("Preencha todos os campos");
    setSaving(true);
    try {
      const payload: any = {
        api_url: apiUrl, api_key: apiKey, instance_name: instance, enabled,
        is_admin: scope === "admin",
        restaurant_id: scope === "admin" ? null : restaurantId,
      };
      if (existing?.id) {
        const { error } = await sb.from("evolution_integrations").update(payload).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await sb.from("evolution_integrations").insert(payload);
        if (error) throw error;
      }
      toast.success("Integração salva");
      qc.invalidateQueries({ queryKey });
      onOpenChange(false);
    } catch (e: any) { toast.error(e.message || "Erro"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-600" />
            Evolution API {scope === "admin" && <Badge variant="secondary">Admin</Badge>}
          </DialogTitle>
          <DialogDescription>
            Configure URL, API Key e Instance Name da sua instância Evolution.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>URL da API</Label>
            <Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://evo.suaempresa.com" />
          </div>
          <div className="space-y-2">
            <Label>API Key</Label>
            <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} type="password" />
          </div>
          <div className="space-y-2">
            <Label>Instance Name</Label>
            <Input value={instance} onChange={(e) => setInstance(e.target.value)} placeholder="minha-instancia" />
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="cursor-pointer">Integração ativa</Label>
              <p className="text-xs text-muted-foreground">Permitir envios em massa</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          {verifyResult && (
            <div className={`flex items-start gap-2 rounded-md border p-3 text-sm ${verifyResult.ok ? "border-green-500/50 text-green-700 dark:text-green-400" : "border-destructive/50 text-destructive"}`}>
              {verifyResult.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5" /> : <XCircle className="w-4 h-4 mt-0.5" />}
              <span className="break-all">{verifyResult.msg}</span>
            </div>
          )}
          {existing?.last_check_at && (
            <p className="text-xs text-muted-foreground">Última verificação: {new Date(existing.last_check_at).toLocaleString("pt-BR")}</p>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleVerify} disabled={verifying}>
            {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            Verificar conexão
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
