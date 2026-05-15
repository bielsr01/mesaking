import { useState, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

export type IntegrationStatus = "connected" | "disabled" | "not_configured" | "loading";

export function IntegrationStatusCard({
  title,
  description,
  icon,
  iconBgClassName = "bg-primary/10",
  status,
  statusLabel,
  onVerify,
  extraContent,
  dialogClassName,
}: {
  title: string;
  description: string;
  icon: ReactNode;
  iconBgClassName?: string;
  status: IntegrationStatus;
  statusLabel?: string;
  onVerify: () => Promise<{ ok: boolean; message: string }>;
  extraContent?: ReactNode;
  dialogClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleVerify = async () => {
    setVerifying(true);
    setResult(null);
    try {
      const r = await onVerify();
      setResult(r);
    } catch (e: any) {
      setResult({ ok: false, message: e?.message ?? "Erro ao verificar" });
    } finally {
      setVerifying(false);
    }
  };

  const badge =
    status === "loading" ? (
      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
    ) : status === "connected" ? (
      <Badge>{statusLabel ?? "Conectado"}</Badge>
    ) : status === "disabled" ? (
      <Badge variant="secondary">{statusLabel ?? "Desativado"}</Badge>
    ) : (
      <Badge variant="outline">{statusLabel ?? "Não configurado"}</Badge>
    );

  return (
    <>
      <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setOpen(true); setResult(null); }}>
        <CardHeader className="flex flex-row items-center gap-3 pb-2">
          <div className={`w-12 h-12 rounded-md grid place-items-center ${iconBgClassName}`}>{icon}</div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="text-xs">{description}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>{badge}</CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">{icon}{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="flex items-center justify-between rounded-md border p-3">
              <span className="text-sm text-muted-foreground">Status atual</span>
              {badge}
            </div>

            <p className="text-xs text-muted-foreground">
              A configuração desta integração (chaves, tokens e detalhes) é gerenciada pelo administrador.
              Aqui você pode apenas verificar se a conexão está funcionando.
            </p>

            {result && (
              <div className={`flex items-start gap-2 rounded-md border p-3 text-sm ${result.ok ? "border-green-500/50 text-green-700 dark:text-green-400" : "border-destructive/50 text-destructive"}`}>
                {result.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                <span className="break-all">{result.message}</span>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Fechar</Button>
            <Button
              onClick={handleVerify}
              disabled={verifying || status === "not_configured" || status === "disabled"}
              className={status === "disabled" ? "opacity-50" : undefined}
            >
              {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Verificar conexão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
