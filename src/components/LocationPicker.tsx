import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, LocateFixed } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { reverseGeocode, ReverseGeocodeResult, GeoPoint } from "@/lib/delivery";

// HERE Maps JS SDK loader (carregado via CDN sob demanda)
declare global { interface Window { H: any } }

let cachedKey: string | null = null;
async function getHereApiKey(): Promise<string | null> {
  if (cachedKey) return cachedKey;
  try {
    const { data, error } = await supabase.functions.invoke("here-token");
    if (error) return null;
    const k = (data as any)?.apiKey as string | undefined;
    if (k) cachedKey = k;
    return k ?? null;
  } catch {
    return null;
  }
}

let hereLoadPromise: Promise<void> | null = null;
function loadHereMaps(): Promise<void> {
  if (typeof window !== "undefined" && window.H?.Map) return Promise.resolve();
  if (hereLoadPromise) return hereLoadPromise;
  hereLoadPromise = new Promise((resolve, reject) => {
    const urls = [
      "https://js.api.here.com/v3/3.1/mapsjs-core.js",
      "https://js.api.here.com/v3/3.1/mapsjs-service.js",
      "https://js.api.here.com/v3/3.1/mapsjs-mapevents.js",
      "https://js.api.here.com/v3/3.1/mapsjs-ui.js",
    ];
    const cssId = "here-maps-ui-css";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https://js.api.here.com/v3/3.1/mapsjs-ui.css";
      document.head.appendChild(link);
    }
    const loadOne = (src: string) => new Promise<void>((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) return res();
      const s = document.createElement("script");
      s.src = src; s.async = false;
      s.onload = () => res();
      s.onerror = () => rej(new Error(`Failed to load ${src}`));
      document.head.appendChild(s);
    });
    (async () => {
      try {
        for (const u of urls) await loadOne(u);
        resolve();
      } catch (e) { reject(e); }
    })();
  });
  return hereLoadPromise;
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
        getHereApiKey(),
        initialPoint ? Promise.resolve(initialPoint) : getCurrentPosition(),
      ]);

      if (cancelled) return;
      if (!apiKey) { setLoading(false); return; }

      try { await loadHereMaps(); } catch { setLoading(false); return; }
      if (cancelled) return;

      const pt: GeoPoint = geo ?? { lat: -14.235, lng: -51.9253 };
      if (!geo && !initialPoint) setPermissionError(true);
      setPoint(pt);
      setLoading(false);

      setTimeout(() => {
        if (!containerRef.current || cancelled) return;
        const H = window.H;
        const platform = new H.service.Platform({ apikey: apiKey });
        const layers = platform.createDefaultLayers({ lg: "pt-BR" });
        const map = new H.Map(
          containerRef.current,
          layers.vector.normal.map,
          { center: { lat: pt.lat, lng: pt.lng }, zoom: geo ? 17 : 4, pixelRatio: window.devicePixelRatio || 1 },
        );
        const behavior = new H.mapevents.Behavior(new H.mapevents.MapEvents(map));
        H.ui.UI.createDefault(map, layers, "pt-BR");
        // Atualiza ponto quando o usuário arrasta
        map.addEventListener("mapviewchangeend", () => {
          const c = map.getCenter();
          setPoint({ lat: c.lat, lng: c.lng });
        });
        const onResize = () => map.getViewPort().resize();
        window.addEventListener("resize", onResize);
        mapRef.current = { map, platform, behavior, onResize };
        setTimeout(() => map.getViewPort().resize(), 250);
      }, 50);
    };

    init();
    return () => {
      cancelled = true;
      const ref = mapRef.current;
      if (ref?.map) {
        try { window.removeEventListener("resize", ref.onResize); } catch { /* noop */ }
        try { ref.map.dispose(); } catch { /* noop */ }
      }
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
      ref.map.setCenter({ lat: geo.lat, lng: geo.lng }, true);
      ref.map.setZoom(17, true);
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
