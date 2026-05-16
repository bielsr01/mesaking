import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Loader2, QrCode, LogOut, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { EvolutionMessagesPanel } from "./EvolutionMessagesPanel";

const sb = supabase as any;

export function WhatsAppConnectionCard({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  const queryKey = ["evolution-integration", "restaurant", restaurantId];
  const { data, isLoading, refetch } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data } = await sb.from("evolution_integrations")
        .select("id,enabled,instance_name,instance_token,last_status,qrcode,phone_number")
        .eq("restaurant_id", restaurantId).maybeSingle();
      return data ?? null;
    },
  });

  const hasInstance = !!data?.instance_name;
  const state = data?.last_status as string | undefined;
  const isConnected = state === "open";

  const badge = isLoading ? (
    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
  ) : !hasInstance ? (
    <Badge variant="outline">Não configurado</Badge>
  ) : isConnected ? (
    <Badge className="bg-green-600 hover:bg-green-600">Conectado</Badge>
  ) : (
    <Badge variant="secondary">Desconectado</Badge>
  );

  async function call(action: string) {
    setBusy(action);
    try {
      const { data: r, error } = await supabase.functions.invoke("evolution-instance", {
        body: { action, restaurantId },
      });
      if (error) throw error;
      if (!(r as any)?.ok) throw new Error((r as any)?.error || "Falha");
      return r as any;
    } finally {
      setBusy(null);
    }
  }

  function stopPoll() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  function startPoll() {
    stopPoll();
    const startedAt = Date.now();
    pollRef.current = window.setInterval(async () => {
      // Stop after 3 minutes
      if (Date.now() - startedAt > 180_000) { stopPoll(); return; }
      try {
        const r: any = await supabase.functions.invoke("evolution-instance", {
          body: { action: "state", restaurantId },
        });
        const st = r?.data?.state;
        if (st === "open") {
          stopPoll();
          setQrOpen(false);
          setQr(null);
          toast.success("WhatsApp conectado!");
          qc.invalidateQueries({ queryKey });
        }
      } catch { /* keep polling */ }
    }, 3000);
  }

  useEffect(() => () => stopPoll(), []);

  async function handleConnect() {
    try {
      // Make sure an instance exists
      if (!hasInstance) {
        await call("create");
        await refetch();
      }
      const r = await call("connect");
      setQr(r.qrcode || null);
      setQrOpen(true);
      startPoll();
    } catch (e: any) {
      toast.error(e.message || "Erro ao iniciar conexão");
    }
  }

  async function handleLogout() {
    try {
      await call("logout");
      toast.success("WhatsApp desconectado");
      qc.invalidateQueries({ queryKey });
    } catch (e: any) {
      toast.error(e.message || "Erro");
    }
  }

  async function handleReset() {
    if (!confirm("Apagar a instância atual e criar uma nova? Você vai precisar escanear o QR de novo.")) return;
    try {
      await call("delete");
      await call("create");
      qc.invalidateQueries({ queryKey });
      toast.success("Nova instância criada");
    } catch (e: any) {
      toast.error(e.message || "Erro");
    }
  }

  return (
    <>
      <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setOpen(true)}>
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <div className="w-12 h-12 rounded-lg bg-green-500/10 grid place-items-center">
            <MessageCircle className="w-6 h-6 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">WhatsApp</CardTitle>
            <CardDescription className="text-xs">Conectar via QR Code</CardDescription>
          </div>
        </CardHeader>
        <CardContent>{badge}</CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-600" />
              WhatsApp
            </DialogTitle>
            <DialogDescription>
              Conecte o WhatsApp da sua loja para enviar mensagens automáticas e em massa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md border p-3">
              <span className="text-sm text-muted-foreground">Status</span>
              {badge}
            </div>

            {!isConnected ? (
              <Button
                size="lg"
                className="w-full h-14 text-base bg-green-600 hover:bg-green-700"
                onClick={handleConnect}
                disabled={!!busy}
              >
                {busy ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <QrCode className="w-5 h-5 mr-2" />}
                Conectar WhatsApp
              </Button>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="outline" className="flex-1" onClick={handleLogout} disabled={!!busy}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Desconectar
                </Button>
                <Button variant="outline" className="flex-1" onClick={handleReset} disabled={!!busy}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Recriar instância
                </Button>
              </div>
            )}

            {hasInstance && (
              <div className="pt-2">
                <EvolutionMessagesPanel restaurantId={restaurantId} />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={qrOpen} onOpenChange={(v) => { setQrOpen(v); if (!v) stopPoll(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Escaneie o QR Code</DialogTitle>
            <DialogDescription>
              Abra o WhatsApp no celular → Aparelhos conectados → Conectar aparelho.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {qr ? (
              <img src={qr} alt="QR Code WhatsApp" className="w-[304px] max-w-full h-auto rounded-md border bg-white" style={{ imageRendering: "pixelated", filter: "none" }} />
            ) : (
              <div className="w-64 h-64 grid place-items-center border rounded-md">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            )}
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Aguardando conexão...
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
