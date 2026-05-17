import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Volume2, VolumeX, Check } from "lucide-react";
import { SOUND_OPTIONS, SoundId, getSoundChoice, playSound, setSoundChoice } from "@/lib/orderSound";

export function SoundPicker() {
  const [choice, setChoice] = useState<SoundId>("bell");

  useEffect(() => {
    setChoice(getSoundChoice());
  }, []);

  const select = (id: SoundId) => {
    setChoice(id);
    setSoundChoice(id);
    if (id !== "off") playSound(id);
  };

  const Icon = choice === "off" ? VolumeX : Volume2;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" title="Som de novos pedidos">
          <Icon className="w-5 h-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>Som de novos pedidos</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {SOUND_OPTIONS.map((o) => (
          <DropdownMenuItem key={o.id} onClick={() => select(o.id)} className="flex items-center justify-between">
            <span>{o.label}</span>
            {choice === o.id && <Check className="w-4 h-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
