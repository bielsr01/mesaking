import { useEffect, useRef, useState } from "react";
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

  // Modo de duração para abrir/fechar manualmente
  const [closeMode, setCloseMode] = useState<"minutes" | "until" | "today">("minutes");
  const [minutes, setMinutes] = useState("30");
  const [untilTime, setUntilTime] = useState("23:00");

  const [openMode, setOpenMode] = useState<"minutes" | "until" | "today">("minutes");
  const [openMinutes, setOpenMinutes] = useState("30");
  const [openUntilTime, setOpenUntilTime] = useState("23:00");

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
        setOpenMode("minutes");
        setOpenMinutes("30");
        setOpenDialog(true);
      }
    } else {
      // Tentando fechar
      setCloseMode("minutes");
      setMinutes("30");
      setCloseDialog(true);
    }
  };

  const computeUntil = (mode: "minutes" | "until" | "today", mins: string, time: string): string => {
    const now = new Date();
    if (mode === "minutes") {
      const m = Math.max(1, parseInt(mins) || 0);
      return new Date(now.getTime() + m * 60_000).toISOString();
    }
    if (mode === "until") {
      const [h, mi] = time.split(":").map(Number);
      const d = new Date(now);
      d.setHours(h, mi, 0, 0);
      if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
      return d.toISOString();
    }
    const d = new Date(now);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  };

  const confirmOpen = async () => {
    const until = computeUntil(openMode, openMinutes, openUntilTime);
    await persist({ type: "open", until });
    setOpenDialog(false);
    toast.success("Loja aberta manualmente");
  };

  const confirmClose = async () => {
    const until = computeUntil(closeMode, minutes, untilTime);
    await persist({ type: "closed", until });
    setCloseDialog(false);
    toast.success("Loja fechada");
  };

  // Auto-sync: quando override expira ou a janela de horário muda, atualiza is_open no banco
  const lastSyncedRef = useRef<boolean>(open);
  useEffect(() => { lastSyncedRef.current = open; }, []);
  useEffect(() => {
    const tick = async () => {
      const computed = isOpenNow(openingHours, manualOverride);
      const ovNow = getEffectiveOverride(manualOverride);
      // Se o override expirou (ainda existe no banco mas já passou), limpar
      if (manualOverride && !ovNow) {
        await supabase
          .from("restaurants")
          .update({ manual_override: null, is_open: isWithinSchedule(openingHours) })
          .eq("id", restaurantId);
        onChanged();
        return;
      }
      if (computed !== lastSyncedRef.current) {
        lastSyncedRef.current = computed;
        await supabase.from("restaurants").update({ is_open: computed }).eq("id", restaurantId);
        onChanged();
      }
    };
    const id = setInterval(tick, 30_000);
    tick();
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, JSON.stringify(openingHours), JSON.stringify(manualOverride)]);

  const ovLabel = () => {
    if (!ov) return null;
    if (ov.type === "open" && !withinSchedule) {
      if (!ov.until) return "Aberto manualmente";
      const d = new Date(ov.until);
      return `Aberto até ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
    }
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

      {/* Opções de abertura fora do horário */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir fora do horário</DialogTitle>
            <DialogDescription>
              O restaurante está fora do horário de funcionamento configurado. Por quanto tempo deseja manter aberto? Ao expirar, o sistema fecha automaticamente.
            </DialogDescription>
          </DialogHeader>

          <RadioGroup value={openMode} onValueChange={(v) => setOpenMode(v as any)} className="space-y-3 py-2">
            <div className="flex items-center gap-3">
              <RadioGroupItem value="minutes" id="om" />
              <Label htmlFor="om" className="flex-1">Por alguns minutos</Label>
              <Input
                type="number" min={1} className="w-24"
                value={openMinutes}
                onChange={(e) => setOpenMinutes(e.target.value)}
                onFocus={() => setOpenMode("minutes")}
              />
              <span className="text-sm text-muted-foreground">min</span>
            </div>
            <div className="flex items-center gap-3">
              <RadioGroupItem value="until" id="ou" />
              <Label htmlFor="ou" className="flex-1">Até um horário específico</Label>
              <Input
                type="time" className="w-32"
                value={openUntilTime}
                onChange={(e) => setOpenUntilTime(e.target.value)}
                onFocus={() => setOpenMode("until")}
              />
            </div>
            <div className="flex items-center gap-3">
              <RadioGroupItem value="today" id="ot" />
              <Label htmlFor="ot" className="flex-1">Abrir pelo resto do dia</Label>
            </div>
          </RadioGroup>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
            <Button onClick={confirmOpen} disabled={busy}>Confirmar abertura</Button>
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
