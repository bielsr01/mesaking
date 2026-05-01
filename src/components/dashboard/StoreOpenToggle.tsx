import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import {
  isOpenNow, isWithinSchedule, ManualOverride, OpeningHours, getEffectiveOverride,
} from "@/lib/hours";

interface Props {
  restaurantId: string;
  openingHours: OpeningHours | null | undefined;
  manualOverride: ManualOverride;
  onChanged: () => void;
}

export function StoreOpenToggle({ restaurantId, openingHours, manualOverride, onChanged }: Props) {
  const ov = getEffectiveOverride(manualOverride);
  const open = isOpenNow(openingHours, ov);
  const withinSchedule = isWithinSchedule(openingHours);

  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [busy, setBusy] = useState(false);

  // Close-options state
  const [closeMode, setCloseMode] = useState<"minutes" | "until" | "today">("minutes");
  const [minutes, setMinutes] = useState("30");
  const [untilTime, setUntilTime] = useState("23:00");

  const persist = async (override: ManualOverride) => {
    setBusy(true);
    const { error } = await supabase
      .from("restaurants")
      .update({ manual_override: override as any, is_open: override?.type === "open" ? true : override?.type === "closed" ? false : isWithinSchedule(openingHours) })
      .eq("id", restaurantId);
    setBusy(false);
    if (error) return toast.error(error.message);
    onChanged();
  };

  const handleToggle = (next: boolean) => {
    if (next) {
      // Tentando abrir
      if (withinSchedule) {
        // Dentro do horário: limpar override (volta ao automático aberto)
        persist(null).then(() => toast.success("Loja aberta"));
      } else {
        setOpenDialog(true);
      }
    } else {
      // Tentando fechar
      setCloseMode("minutes");
      setMinutes("30");
      setCloseDialog(true);
    }
  };

  const confirmOpen = async () => {
    await persist({ type: "open", until: null });
    setOpenDialog(false);
    toast.success("Loja aberta manualmente");
  };

  const confirmClose = async () => {
    let until: string | null = null;
    const now = new Date();
    if (closeMode === "minutes") {
      const m = Math.max(1, parseInt(minutes) || 0);
      until = new Date(now.getTime() + m * 60_000).toISOString();
    } else if (closeMode === "until") {
      const [h, mi] = untilTime.split(":").map(Number);
      const d = new Date(now);
      d.setHours(h, mi, 0, 0);
      if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
      until = d.toISOString();
    } else {
      // dia todo: até 23:59:59 de hoje
      const d = new Date(now);
      d.setHours(23, 59, 59, 999);
      until = d.toISOString();
    }
    await persist({ type: "closed", until });
    setCloseDialog(false);
    toast.success("Loja fechada");
  };

  const ovLabel = () => {
    if (!ov) return null;
    if (ov.type === "open" && !withinSchedule) return "Aberto manualmente";
    if (ov.type === "closed") {
      if (!ov.until) return "Fechado";
      const d = new Date(ov.until);
      return `Fechado até ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    }
    return null;
  };

  return (
    <>
      <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted">
        <Badge className={open ? "bg-success text-success-foreground" : ""} variant={open ? "default" : "secondary"}>
          {open ? "Aberto" : "Fechado"}
        </Badge>
        {ovLabel() && <span className="text-xs text-muted-foreground">{ovLabel()}</span>}
        <Switch checked={open} onCheckedChange={handleToggle} disabled={busy} />
      </div>

      {/* Confirmar abertura fora do horário */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir fora do horário?</DialogTitle>
            <DialogDescription>
              No momento o restaurante está fora do horário de funcionamento configurado.
              Deseja abrir a loja mesmo assim? Ela ficará aberta até você fechar manualmente.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
            <Button onClick={confirmOpen} disabled={busy}>Sim, abrir agora</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Opções de fechamento */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fechar restaurante</DialogTitle>
            <DialogDescription>Por quanto tempo deseja fechar?</DialogDescription>
          </DialogHeader>

          <RadioGroup value={closeMode} onValueChange={(v) => setCloseMode(v as any)} className="space-y-3 py-2">
            <div className="flex items-center gap-3">
              <RadioGroupItem value="minutes" id="m" />
              <Label htmlFor="m" className="flex-1">Por alguns minutos</Label>
              <Input
                type="number" min={1} className="w-24"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                onFocus={() => setCloseMode("minutes")}
              />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
            <div className="flex items-center gap-3">
              <RadioGroupItem value="until" id="u" />
              <Label htmlFor="u" className="flex-1">Até um horário específico</Label>
              <Input
                type="time" className="w-32"
                value={untilTime}
                onChange={(e) => setUntilTime(e.target.value)}
                onFocus={() => setCloseMode("until")}
              />
            </div>
            <div className="flex items-center gap-3">
              <RadioGroupItem value="today" id="t" />
              <Label htmlFor="t" className="flex-1">Fechar pelo resto do dia</Label>
            </div>
          </RadioGroup>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialog(false)}>Cancelar</Button>
            <Button onClick={confirmClose} disabled={busy} variant="destructive">Confirmar fechamento</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
