import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, LocateFixed, Search } from "lucide-react";
import { AddressSuggestion, GeoPoint, searchAddresses } from "@/lib/delivery";

export function AddressSearchDialog({
  open,
  onOpenChange,
  proximity,
  onPickSuggestion,
  onUseCurrentLocation,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  proximity?: GeoPoint | null;
  onPickSuggestion: (s: AddressSuggestion) => void;
  onUseCurrentLocation: () => void;
}) {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) {
      setQ("");
      setSuggestions([]);
      return;
    }
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      const r = await searchAddresses(q, proximity ?? undefined);
      setSuggestions(r);
      setLoading(false);
    }, 350);
    return () => clearTimeout(t);
  }, [q, open, proximity]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 flex flex-col overflow-hidden max-w-full w-screen h-[100dvh] sm:max-w-lg sm:h-auto sm:max-h-[80vh] sm:rounded-lg rounded-none">
        <DialogHeader className="shrink-0 px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2"><MapPin className="w-5 h-5" /> Cadastre seu endereço</DialogTitle>
          <DialogDescription>Digite sua rua e número ou use sua localização atual.</DialogDescription>
        </DialogHeader>

        <div className="shrink-0 px-6 py-3 border-b space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ex: Rua das Flores, 123"
              className="pl-9"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            className="w-full justify-start gap-2"
            onClick={onUseCurrentLocation}
          >
            <LocateFixed className="w-4 h-4" />
            Usar minha localização atual
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="px-6 py-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Buscando endereços...
            </div>
          )}
          {!loading && q.trim().length >= 3 && suggestions.length === 0 && (
            <div className="px-6 py-6 text-sm text-muted-foreground">
              Nenhum endereço encontrado.
            </div>
          )}
          {!loading && q.trim().length < 3 && (
            <div className="px-6 py-6 text-sm text-muted-foreground">
              Digite ao menos 3 caracteres para buscar.
            </div>
          )}
          <ul className="divide-y">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="w-full text-left px-6 py-3 hover:bg-muted/60 flex items-start gap-3"
                  onClick={() => onPickSuggestion(s)}
                >
                  <MapPin className="w-4 h-4 mt-0.5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium break-words">
                      {s.street ? `${s.street}${s.number ? `, ${s.number}` : ""}` : s.place_name}
                    </p>
                    <p className="text-xs text-muted-foreground break-words">
                      {[s.neighborhood, s.city && s.state ? `${s.city}/${s.state}` : s.city, s.cep]
                        .filter(Boolean)
                        .join(" • ")}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
