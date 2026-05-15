import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MessageCircle, CheckCircle2, XCircle } from "lucide-react";
import { WhatsAppConnectionCard } from "./WhatsAppConnectionCard";

const sb = supabase as any;

export function EvolutionIntegrationCard({
  scope,
  restaurantId,
}: {
  scope: "restaurant" | "admin";
  restaurantId?: string;
}) {
  // For restaurant scope, just delegate to the new connection card
  if (scope === "restaurant" && restaurantId) {
    return <WhatsAppConnectionCard restaurantId={restaurantId} />;
  }
  return <AdminEnvCard />;
}

function AdminEnvCard() {
  const [open, setOpen] = useState(false);

  const { data: envStatus, isLoading } = useQuery({
    queryKey: ["evolution-env-status"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("evolution-instance", { body: { action: "env_status" } });
      return data as { ok: boolean; configured: boolean; apiUrl: string | null };
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["evolution-instances-count"],
    queryFn: async () => {
      const { count: total } = await sb.from("evolution_integrations")
        .select("id", { count: "exact", head: true })
        .not("instance_name", "is", null);
      const { count: connected } = await sb.from("evolution_integrations")
        .select("id", { count: "exact", head: true })
        .eq("last_status", "open");
      return { total: total ?? 0, connected: connected ?? 0 };
    },
  });

  const configured = !!envStatus?.configured;

  return (
    <>
      <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setOpen(true)}>
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <div className="w-12 h-12 rounded-lg bg-green-500/10 grid place-items-center">
            <MessageCircle className="w-6 h-6 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">Evolution API (WhatsApp)</CardTitle>
            <CardDescription className="text-xs">Conexão automática via env</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          ) : configured ? (
            <Badge className="bg-green-600 hover:bg-green-600">Configurada</Badge>
          ) : (
            <Badge variant="destructive">Env faltando</Badge>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-600" />
              Evolution API <Badge variant="secondary">Admin</Badge>
            </DialogTitle>
            <DialogDescription>
              A integração agora é totalmente automática. Cada restaurante cria sua própria
              instância pelo painel dele e conecta via QR code.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-sm">
            <div className="flex items-center justify-between rounded-md border p-3">
              <span className="text-muted-foreground">Variáveis de ambiente</span>
              {configured ? (
                <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="w-4 h-4" /> OK
                </span>
              ) : (
                <span className="flex items-center gap-1 text-destructive">
                  <XCircle className="w-4 h-4" /> Faltando
                </span>
              )}
            </div>
            {envStatus?.apiUrl && (
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">API URL</div>
                <div className="font-mono text-xs break-all">{envStatus.apiUrl}</div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Instâncias criadas</div>
                <div className="text-2xl font-semibold">{stats?.total ?? "—"}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">Conectadas</div>
                <div className="text-2xl font-semibold text-green-600">{stats?.connected ?? "—"}</div>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Para alterar URL ou API Key, atualize os secrets <code className="font-mono">EVOLUTION_API_URL</code>{" "}
              e <code className="font-mono">EVOLUTION_API_KEY</code> no Lovable Cloud.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
