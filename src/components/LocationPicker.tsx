import { useEffect, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, LocateFixed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { reverseGeocode, ReverseGeocodeResult, GeoPoint } from "@/lib/delivery";

declare global {
  interface Window {
    google: any;
    __gmapsLoading?: Promise<void>;
  }
}

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

async function loadGoogleMaps(apiKey: string): Promise<void> {
  if (typeof window !== "undefined" && window.google?.maps?.Map) return;
  if (window.__gmapsLoading) return window.__gmapsLoading;
  window.__gmapsLoading = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-gmaps="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("gmaps load failed")));
      return;
    }
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&language=pt-BR&region=BR&v=weekly&loading=async`;
    s.async = true;
    s.defer = true;
    s.dataset.gmaps = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("gmaps load failed"));
    document.head.appendChild(s);
  });
  await window.__gmapsLoading;
  if (window.google?.maps?.importLibrary) {
    await window.google.maps.importLibrary("maps");
  }
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

// Espera o container ter dimensões reais antes de inicializar o mapa.
function waitForSize(el: HTMLElement, timeoutMs = 2000): Promise<void> {
  return new Promise((resolve) => {
    if (el.clientWidth > 0 && el.clientHeight > 0) return resolve();
    const start = performance.now();
    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0 && el.clientHeight > 0) {
        ro.disconnect();
        resolve();
      } else if (performance.now() - start > timeoutMs) {
        ro.disconnect();
        resolve();
      }
    });
    ro.observe(el);
    setTimeout(() => {
      ro.disconnect();
      resolve();
    }, timeoutMs);
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

  // Reverse geocode debounced sempre que o ponto mudar
  useEffect(() => {
    if (!point || !open) return;
    setResolving(true);
    const t = setTimeout(async () => {
      const r = await reverseGeocode(point);
      setInfo(r);
      setResolving(false);
    }, 350);
    return () => clearTimeout(t);
  }, [point, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      setPermissionError(false);
      setInfo(null);

      const validInitial =
        initialPoint &&
        typeof initialPoint.lat === "number" &&
        typeof initialPoint.lng === "number" &&
        isFinite(initialPoint.lat) &&
        isFinite(initialPoint.lng)
          ? initialPoint
          : null;

      const [apiKey, geo] = await Promise.all([
        getGoogleApiKey(),
        validInitial ? Promise.resolve(validInitial) : getCurrentPosition(),
      ]);

      if (cancelled) return;
      if (!apiKey) {
        setLoading(false);
        return;
      }

      try {
        await loadGoogleMaps(apiKey);
      } catch {
        setLoading(false);
        return;
      }
      if (cancelled) return;

      const pt: GeoPoint = geo ?? { lat: -14.235, lng: -51.9253 };
      if (!geo && !initialPoint) setPermissionError(true);
      setPoint(pt);

      // Espera 2 frames + container ter tamanho real (corrige mapa em branco no mobile)
      await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
      if (cancelled) return;
      const container = containerRef.current;
      if (!container) {
        setLoading(false);
        return;
      }
      await waitForSize(container);
      if (cancelled) return;

      const google = window.google;
      const map = new google.maps.Map(container, {
        center: { lat: pt.lat, lng: pt.lng },
        zoom: geo || initialPoint ? 17 : 4,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        clickableIcons: false,
      });

      // Atualiza ponto após cada arraste/zoom
      map.addListener("idle", () => {
        const c = map.getCenter();
        if (!c) return;
        const next = { lat: c.lat(), lng: c.lng() };
        setPoint((prev) => {
          if (prev && Math.abs(prev.lat - next.lat) < 1e-7 && Math.abs(prev.lng - next.lng) < 1e-7) {
            return prev;
          }
          return next;
        });
      });

      mapRef.current = { map };

      // Garante o redraw quando o dialog termina a animação
      setTimeout(() => {
        google.maps.event.trigger(map, "resize");
        map.setCenter({ lat: pt.lat, lng: pt.lng });
      }, 250);

      setLoading(false);
    };

    init();
    return () => {
      cancelled = true;
      mapRef.current = null;
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const recenterOnMe = useCallback(async () => {
    const geo = await getCurrentPosition();
    if (!geo) {
      setPermissionError(true);
      return;
    }
    setPermissionError(false);
    const ref = mapRef.current;
    if (ref?.map) {
      ref.map.setCenter({ lat: geo.lat, lng: geo.lng });
      ref.map.setZoom(17);
    } else {
      setPoint(geo);
    }
  }, []);

  const summary = resolving
    ? null
    : info?.street
      ? `${info.street}${info.number ? `, ${info.number}` : ""}${info.neighborhood ? ` — ${info.neighborhood}` : ""}`
      : info?.place_name ?? null;

  const handleConfirm = () => {
    // Sempre usa o centro atual do mapa para a confirmação
    const map = mapRef.current?.map;
    let finalPoint = point;
    if (map) {
      const c = map.getCenter();
      if (c) finalPoint = { lat: c.lat(), lng: c.lng() };
    }
    if (!finalPoint) return;
    const result: ReverseGeocodeResult = { ...(info ?? {}), lat: finalPoint.lat, lng: finalPoint.lng };
    onConfirm(result);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 flex flex-col overflow-hidden max-w-full w-screen h-[100dvh] sm:max-w-full rounded-none">
        <DialogHeader className="shrink-0 px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="w-5 h-5" /> Confirme sua localização
          </DialogTitle>
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
            <MapPin
              className="w-10 h-10 text-primary drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] fill-primary/30"
              strokeWidth={2.5}
            />
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
                <span className="text-muted-foreground inline-flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Buscando endereço...
                </span>
              ) : summary ? (
                <span className="font-medium break-words">{summary}</span>
              ) : (
                <span className="text-muted-foreground">Movimente o mapa para ajustar o pino.</span>
              )}
              {permissionError && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Não conseguimos sua localização — arraste o mapa manualmente.
                </p>
              )}
            </div>
          </div>
          <Button type="button" className="w-full" disabled={!point || resolving} onClick={handleConfirm}>
            Confirmar localização
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
