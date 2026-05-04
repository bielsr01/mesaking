import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, LocateFixed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { reverseGeocode, ReverseGeocodeResult, GeoPoint } from "@/lib/delivery";

declare global { interface Window { google: any; __gmapsLoading?: Promise<void> } }

let cachedKey: string | null = null;
async function getGoogleApiKey(): Promise<string | null> {
  if (cachedKey) return cachedKey;
  try {
    const { data, error } = await supabase.functions.invoke("maps-key");
    if (error) return null;
    const k = (data as any)?.apiKey as string | undefined;
    if (k) cachedKey = k;
    return k ?? null;
  } catch {
    return null;
  }
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window !== "undefined" && window.google?.maps) return Promise.resolve();
  if (window.__gmapsLoading) return window.__gmapsLoading;
  window.__gmapsLoading = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-gmaps="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("gmaps load failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&language=pt-BR&region=BR&loading=async`;
    s.async = true;
    s.defer = true;
    s.dataset.gmaps = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("gmaps load failed"));
    document.head.appendChild(s);
  });
  return window.__gmapsLoading;
}

function getCurrentPosition(): Promise<GeoPoint | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  });
}

export function LocationPicker({
  open,
  onOpenChange,
  initialPoint,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialPoint?: GeoPoint | null;
  onConfirm: (result: ReverseGeocodeResult) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const [loading, setLoading] = useState(false);
  const [point, setPoint] = useState<GeoPoint | null>(initialPoint ?? null);
  const [info, setInfo] = useState<ReverseGeocodeResult | null>(null);
  const [resolving, setResolving] = useState(false);
  const [permissionError, setPermissionError] = useState(false);

  // Reverse geocode debounced
  useEffect(() => {
    if (!point || !open) return;
    setResolving(true);
    const t = setTimeout(async () => {
      const r = await reverseGeocode(point);
      setInfo(r);
      setResolving(false);
    }, 400);
    return () => clearTimeout(t);
  }, [point, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      setPermissionError(false);

      const [apiKey, geo] = await Promise.all([
        getGoogleApiKey(),
        initialPoint ? Promise.resolve(initialPoint) : getCurrentPosition(),
      ]);

      if (cancelled) return;
      if (!apiKey) { setLoading(false); return; }

      try { await loadGoogleMaps(apiKey); } catch { setLoading(false); return; }
      if (cancelled) return;

      const pt: GeoPoint = geo ?? { lat: -14.235, lng: -51.9253 };
      if (!geo && !initialPoint) setPermissionError(true);
      setPoint(pt);
      setLoading(false);

      setTimeout(() => {
        if (!containerRef.current || cancelled) return;
        const google = window.google;
        const map = new google.maps.Map(containerRef.current, {
          center: { lat: pt.lat, lng: pt.lng },
          zoom: geo ? 17 : 4,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: "greedy",
          clickableIcons: false,
        });
        // Atualiza ponto quando o usuário arrasta
        map.addListener("idle", () => {
          const c = map.getCenter();
          if (!c) return;
          setPoint({ lat: c.lat(), lng: c.lng() });
        });
        mapRef.current = { map };
      }, 50);
    };

    init();
    return () => {
      cancelled = true;
      mapRef.current = null;
      setInfo(null);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const recenterOnMe = async () => {
    const geo = await getCurrentPosition();
    if (!geo) { setPermissionError(true); return; }
    setPermissionError(false);
    const ref = mapRef.current;
    if (ref?.map) {
      ref.map.setCenter({ lat: geo.lat, lng: geo.lng });
      ref.map.setZoom(17);
    }
  };

  const summary = info?.street
    ? `${info.street}${info.number ? `, ${info.number}` : ""}${info.neighborhood ? ` — ${info.neighborhood}` : ""}`
    : info?.place_name ?? "Movimente o mapa para ajustar o pino";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 flex flex-col overflow-hidden max-w-full w-screen h-[100dvh] sm:max-w-full rounded-none">
        <DialogHeader className="shrink-0 px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2"><MapPin className="w-5 h-5" /> Confirme sua localização</DialogTitle>
          <DialogDescription>Arraste o mapa para posicionar o pino na porta da sua casa.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 relative bg-muted">
          {loading && (
            <div className="absolute inset-0 grid place-items-center z-[1000] bg-background/60">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
          <div ref={containerRef} className="absolute inset-0" />
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-full">
            <MapPin className="w-10 h-10 text-primary drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] fill-primary/30" strokeWidth={2.5} />
          </div>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute bottom-4 right-4 z-[600] shadow-lg"
            onClick={recenterOnMe}
            title="Minha localização"
          >
            <LocateFixed className="w-4 h-4" />
          </Button>
        </div>
        <div className="shrink-0 border-t bg-background px-6 py-3 space-y-2">
          <div className="min-h-[2.5rem] flex items-start gap-2 text-sm">
            <MapPin className="w-4 h-4 mt-0.5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              {resolving ? (
                <span className="text-muted-foreground inline-flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Buscando endereço...</span>
              ) : (
                <span className="font-medium break-words">{summary}</span>
              )}
              {permissionError && (
                <p className="text-xs text-muted-foreground mt-0.5">Não conseguimos sua localização — arraste o mapa manualmente.</p>
              )}
            </div>
          </div>
          <Button
            type="button"
            className="w-full"
            disabled={!point || resolving}
            onClick={() => {
              if (!point) return;
              const result: ReverseGeocodeResult = info ?? { lat: point.lat, lng: point.lng };
              onConfirm({ ...result, lat: point.lat, lng: point.lng });
              onOpenChange(false);
            }}
          >
            Confirmar localização
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
