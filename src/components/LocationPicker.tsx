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
  const p = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-gmaps="1"]');
    if (existing) {
      if (window.google?.maps?.Map) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("gmaps load failed")));
      return;
    }
    const s = document.createElement("script");
    // Sem `loading=async` para evitar deferimento que quebra o primeiro render no mobile.
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&language=pt-BR&region=BR&v=weekly`;
    s.async = true;
    s.defer = true;
    s.dataset.gmaps = "1";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("gmaps load failed"));
    document.head.appendChild(s);
  }).catch((err) => {
    window.__gmapsLoading = undefined;
    throw err;
  });
  window.__gmapsLoading = p;
  return p;
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
  const myLocationMarkerRef = useRef<any>(null);
  const myLocationWatchRef = useRef<number | null>(null);
  const initialPointRef = useRef<GeoPoint | null>(null);
  const manuallyMovedRef = useRef(false);
  const [loading, setLoading] = useState(false);
  const [point, setPoint] = useState<GeoPoint | null>(initialPoint ?? null);
  const [info, setInfo] = useState<ReverseGeocodeResult | null>(null);
  const [resolving, setResolving] = useState(false);
  const [permissionError, setPermissionError] = useState(false);

  // Reverse geocode debounced sempre que o ponto mudar
  useEffect(() => {
    if (!point || !open) return;
    let cancelled = false;
    setResolving(true);
    const t = setTimeout(async () => {
      const r = await reverseGeocode(point);
      if (cancelled) return;
      setInfo(r);
      setResolving(false);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [point, open]);

  // Atualiza o pontinho azul "minha localização" continuamente
  const updateMyLocationMarker = useCallback((pos: GeoPoint) => {
    const google = window.google;
    const map = mapRef.current?.map;
    if (!google || !map) return;
    if (!myLocationMarkerRef.current) {
      myLocationMarkerRef.current = new google.maps.Marker({
        map,
        position: pos,
        clickable: false,
        zIndex: 1,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: "#4285F4",
          fillOpacity: 1,
          strokeColor: "#ffffff",
          strokeWeight: 2,
        },
      });
    } else {
      myLocationMarkerRef.current.setPosition(pos);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      // cleanup quando fecha
      if (myLocationWatchRef.current != null && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(myLocationWatchRef.current);
        myLocationWatchRef.current = null;
      }
      myLocationMarkerRef.current?.setMap?.(null);
      myLocationMarkerRef.current = null;
      mapRef.current = null;
      setLoading(false);
      setResolving(false);
      return;
    }

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
      initialPointRef.current = validInitial;
      manuallyMovedRef.current = false;

      const apiKey = await getGoogleApiKey();
      if (cancelled) return;
      if (!apiKey) {
        setLoading(false);
        return;
      }

      try {
        await loadGoogleMaps(apiKey);
      } catch {
        if (!cancelled) setLoading(false);
        return;
      }
      if (cancelled) return;

      // Se não tem initialPoint, tenta geolocalizar
      const geo = validInitial ?? (await getCurrentPosition());
      if (cancelled) return;

      const pt: GeoPoint = geo ?? { lat: -14.235, lng: -51.9253 };
      if (!geo) setPermissionError(true);
      setPoint(pt);

      // Espera o container existir e ter tamanho
      let tries = 0;
      while (
        !cancelled &&
        (!containerRef.current ||
          containerRef.current.clientWidth === 0 ||
          containerRef.current.clientHeight === 0) &&
        tries < 40
      ) {
        await new Promise((r) => setTimeout(r, 50));
        tries++;
      }
      if (cancelled || !containerRef.current) {
        if (!cancelled) setLoading(false);
        return;
      }

      const google = window.google;
      const map = new google.maps.Map(containerRef.current, {
        center: { lat: pt.lat, lng: pt.lng },
        zoom: geo ? 17 : 4,
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: "greedy",
        clickableIcons: false,
      });

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
      map.addListener("dragstart", () => {
        manuallyMovedRef.current = true;
      });

      mapRef.current = { map };

      // Pontinho azul inicial se já temos geo
      if (geo) updateMyLocationMarker(geo);

      // Watch contínuo da localização para manter o pontinho azul atualizado
      if ("geolocation" in navigator && myLocationWatchRef.current == null) {
        try {
          myLocationWatchRef.current = navigator.geolocation.watchPosition(
            (pos) => {
              updateMyLocationMarker({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            },
            () => {},
            { enableHighAccuracy: true, maximumAge: 30000, timeout: 15000 },
          );
        } catch {
          // ignora
        }
      }

      // Força redraw após o dialog abrir totalmente
      setTimeout(() => {
        if (cancelled || !mapRef.current?.map) return;
        google.maps.event.trigger(mapRef.current.map, "resize");
        mapRef.current.map.setCenter({ lat: pt.lat, lng: pt.lng });
      }, 300);

      setLoading(false);
    };

    init();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const recenterOnMe = useCallback(async () => {
    const geo = await getCurrentPosition();
    if (!geo) {
      setPermissionError(true);
      return;
    }
    manuallyMovedRef.current = true;
    setPermissionError(false);
    updateMyLocationMarker(geo);
    const ref = mapRef.current;
    if (ref?.map) {
      ref.map.setCenter({ lat: geo.lat, lng: geo.lng });
      ref.map.setZoom(17);
    } else {
      setPoint(geo);
    }
  }, [updateMyLocationMarker]);

  const summary = resolving
    ? null
    : info?.street
      ? `${info.street}${info.number ? `, ${info.number}` : ""}${info.neighborhood ? ` — ${info.neighborhood}` : ""}`
      : info?.place_name ?? null;

  const handleConfirm = () => {
    const map = mapRef.current?.map;
    let finalPoint = point;
    if (map) {
      const c = map.getCenter();
      if (c) finalPoint = { lat: c.lat(), lng: c.lng() };
    }
    if (!finalPoint) return;
    const initial = initialPointRef.current;
    const movedByDistance = initial
      ? Math.abs(initial.lat - finalPoint.lat) > 0.00003 || Math.abs(initial.lng - finalPoint.lng) > 0.00003
      : false;
    const result: ReverseGeocodeResult = {
      ...(info ?? {}),
      lat: finalPoint.lat,
      lng: finalPoint.lng,
      mapMoved: manuallyMovedRef.current || movedByDistance,
    };
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
            className="absolute bottom-4 left-4 z-[600] shadow-lg"
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
