import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { MessageCircle } from "lucide-react";

export type OrderSuccessPopupData = {
  open: boolean;
  text: string;
  whatsappUrl: string;
};

export function OrderSuccessWhatsAppDialog({
  open,
  onOpenChange,
  text,
  whatsappUrl,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  text: string;
  whatsappUrl: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto w-14 h-14 rounded-full bg-green-500/10 grid place-items-center mb-2">
            <MessageCircle className="w-7 h-7 text-green-600" />
          </div>
          <DialogTitle className="text-center">Pedido enviado!</DialogTitle>
          <DialogDescription className="text-center whitespace-pre-line text-base text-foreground/90">
            {text}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col sm:flex-col gap-2">
          <Button
            className="w-full bg-green-600 hover:bg-green-700 text-white"
            size="lg"
            onClick={() => {
              window.open(whatsappUrl, "_blank", "noopener,noreferrer");
              onOpenChange(false);
            }}
          >
            <MessageCircle className="w-5 h-5 mr-2" />
            Abrir WhatsApp
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function buildWhatsappUrl(phoneRaw: string | null | undefined, message: string): string | null {
  if (!phoneRaw) return null;
  let digits = phoneRaw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length <= 11) digits = "55" + digits;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function renderTemplate(tpl: string, vars: { nome?: string; pedido?: string | number; total?: string }): string {
  return (tpl || "")
    .replace(/\{\{\s*nome\s*\}\}/g, vars.nome ?? "")
    .replace(/\{\{\s*pedido\s*\}\}/g, String(vars.pedido ?? ""))
    .replace(/\{\{\s*total\s*\}\}/g, vars.total ?? "");
}
