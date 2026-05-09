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
import { Loader2, CheckCircle2, Copy, Utensils, Link2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

const sb = supabase as any;
const WEBHOOK_URL = "https://kcjrrnxsqdcgjqplgiku.supabase.co/functions/v1/ihub-webhook";

export function IhubIntegrationCard({ restaurantId }: { restaurantId: string }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["ihub-integration", restaurantId],
    queryFn: async () => {
      const { data } = await sb
        .from("ihub_integrations")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      return data ?? null;
    },
  });

  const [token, setToken] = useState("");
  const [domain, setDomain] = useState("");
  const [merchantId, setMerchantId] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [linking, setLinking] = useState(false);
  const [userCodeData, setUserCodeData] = useState<any>(null);
  const [authCode, setAuthCode] = useState("");

  const handleGenerateUserCode = async () => {
    if (!data?.secret_token) {
      toast.error("Salve o token primeiro");
      return;
    }
    setLinking(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("ihub-link", {
        body: { action: "generate-user-code", restaurantId },
      });
      if (error) throw error;
      if (!res?.ok) throw new Error(res?.error || "Falha ao gerar código");
      setUserCodeData(res);
      toast.success("Código gerado! Autorize no portal do iFood.");
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    } finally {
      setLinking(false);
    }
  };

  const handleLinkMerchant = async () => {
    if (!authCode.trim() || !userCodeData?.authorizationCodeVerifier) {
      toast.error("Cole o authorizationCode retornado pelo iFood");
      return;
    }
    setLinking(true);
    try {
      const { data: res, error } = await supabase.functions.invoke("ihub-link", {
        body: {
          action: "link-merchant",
          restaurantId,
          authorizationCode: authCode.trim(),
          authorizationCodeVerifier: userCodeData.authorizationCodeVerifier,
        },
      });
      if (error) throw error;
      if (!res?.ok) throw new Error(res?.error || "Falha ao vincular");
      toast.success(`Loja vinculada: ${res.merchantName ?? res.merchantId}`);
      setUserCodeData(null);
      setAuthCode("");
      qc.invalidateQueries({ queryKey: ["ihub-integration", restaurantId] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    } finally {
      setLinking(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setToken(data?.secret_token ?? "");
    setDomain(data?.domain ?? "ihub.arcn.com.br");
    setMerchantId(data?.merchant_id ?? "");
    setEnabled(data?.enabled ?? true);
  }, [open, data]);

  const isConfigured = !!data?.secret_token;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  };

  const handleSave = async () => {
    if (!token.trim()) {
      toast.error("Cole o token secreto do iHub");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        restaurant_id: restaurantId,
        secret_token: token.trim(),
        domain: domain.trim() || "ihub.arcn.com.br",
        merchant_id: merchantId.trim() || null,
        enabled,
      };
      const { error } = await sb
        .from("ihub_integrations")
        .upsert(payload, { onConflict: "restaurant_id" });
      if (error) throw error;
      toast.success("Integração iHub salva");
      qc.invalidateQueries({ queryKey: ["ihub-integration", restaurantId] });
      setOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setOpen(true)}>
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center">
            <Utensils className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">iHub (iFood)</CardTitle>
            <CardDescription className="text-xs">Receber pedidos do iFood via iHub</CardDescription>
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
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Integração iHub (iFood)</DialogTitle>
            <DialogDescription>
              O token é da sua conta iHub (mesmo para todos os restaurantes). O <strong>Merchant ID</strong> identifica este restaurante específico no iFood.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>URL do Webhook (configure no painel do iHub)</Label>
              <div className="flex gap-2">
                <Input value={WEBHOOK_URL} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={() => copy(WEBHOOK_URL, "URL")}>
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Token Secreto da conta iHub</Label>
              <Input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Cole o token UUID gerado pelo iHub"
                type="password"
              />
              <p className="text-xs text-muted-foreground">
                Mesmo token para todos os seus restaurantes. Recebido no header <code>X-iFood-Hub-Signature</code>.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Merchant ID (iFood) deste restaurante</Label>
              <Input
                value={merchantId}
                onChange={(e) => setMerchantId(e.target.value)}
                placeholder="Ex: abcd-1234-efgh-5678 — obtido ao vincular a loja no iHub"
              />
              <p className="text-xs text-muted-foreground">
                Se deixar vazio, será preenchido automaticamente no 1º evento recebido — desde que esta seja a única integração sem merchant.
                Para múltiplos restaurantes na mesma conta iHub, preencha manualmente.
              </p>
            </div>

            <div className="space-y-2 rounded-md border border-dashed p-3">
              <Label className="text-sm">Vincular loja iFood (via iHub)</Label>
              <p className="text-xs text-muted-foreground">
                Salve o token primeiro. Depois gere o código, autorize no iFood e cole o <code>authorizationCode</code>.
              </p>

              {!userCodeData ? (
                <Button type="button" variant="outline" size="sm" onClick={handleGenerateUserCode} disabled={linking || !isConfigured}>
                  {linking ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Link2 className="w-4 h-4 mr-1" />}
                  Gerar User Code
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="rounded bg-muted p-2 text-xs space-y-1">
                    <div><strong>userCode:</strong> <code>{userCodeData.userCode}</code></div>
                    {userCodeData.verificationUrlComplete && (
                      <a href={userCodeData.verificationUrlComplete} target="_blank" rel="noreferrer"
                         className="inline-flex items-center gap-1 text-primary underline">
                        Abrir portal iFood <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                  <Input
                    value={authCode}
                    onChange={(e) => setAuthCode(e.target.value)}
                    placeholder="Cole o authorizationCode retornado pelo iFood"
                  />
                  <div className="flex gap-2">
                    <Button type="button" size="sm" onClick={handleLinkMerchant} disabled={linking}>
                      {linking ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                      Vincular merchant
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => { setUserCodeData(null); setAuthCode(""); }}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Domínio iHub</Label>
              <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="ihub.arcn.com.br" />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label className="cursor-pointer">Integração ativa</Label>
                <p className="text-xs text-muted-foreground">Importar pedidos automaticamente</p>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            {data?.last_event_at && (
              <p className="text-xs text-muted-foreground">
                Último evento: {new Date(data.last_event_at).toLocaleString("pt-BR")}
                {data.last_event_code ? ` — ${data.last_event_code}` : ""}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
