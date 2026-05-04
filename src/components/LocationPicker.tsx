import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import { geocodeAddress, GeocodeAddress, GeoPoint } from "@/lib/delivery";

let cachedToken: string | null = null;
async function getMapboxToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  try {
    const { data, error } = await supabase.functions.invoke("mapbox-token");
    if (error) return null;
    const t = (data as any)?.token as string | undefined;
    if (t) cachedToken = t;
    return t ?? null;
  } catch {
    return null;
  }
}

export function LocationPicker({
  open,
  onOpenChange,
  address,
  initialPoint,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  address: GeocodeAddress;
  initialPoint?: GeoPoint | null;
  onConfirm: (pt: GeoPoint) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [loading, setLoading] = useState(false);
  const [point, setPoint] = useState<GeoPoint | null>(initialPoint ?? null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      const [token, geocoded] = await Promise.all([
        getMapboxToken(),
        initialPoint ? Promise.resolve(initialPoint) : geocodeAddress(address),
      ]);
      if (cancelled) return;

      if (!token) {
        setLoading(false);
        return;
      }

      const pt: GeoPoint = geocoded ?? { lat: -14.235, lng: -51.9253 };
      setPoint(pt);
      setLoading(false);

      setTimeout(() => {
        if (!containerRef.current || cancelled) return;
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
        mapboxgl.accessToken = token;
        const map = new mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/streets-v12",
          center: [pt.lng, pt.lat],
          zoom: 17,
        });
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
        map.on("move", () => {
          const c = map.getCenter();
          setPoint({ lat: c.lat, lng: c.lng });
        });
        mapRef.current = map;
        setTimeout(() => map.resize(), 250);
      }, 50);
    };

    init();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 flex flex-col overflow-hidden max-w-full w-screen h-[100dvh] sm:max-w-full rounded-none">
        <DialogHeader className="shrink-0 px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2"><MapPin className="w-5 h-5" /> Confirme o local exato</DialogTitle>
          <DialogDescription>Arraste o mapa para posicionar o pino na porta da sua casa.</DialogDescription>
        </DialogHeader>
        <div className="flex-1 relative bg-muted">
          {loading && (
            <div className="absolute inset-0 grid place-items-center z-[1000] bg-background/60">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          )}
          <div ref={containerRef} className="absolute inset-0" />
          {/* Pino fixo no centro */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 z-[500] -translate-x-1/2 -translate-y-full">
            <MapPin className="w-10 h-10 text-primary drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] fill-primary/30" strokeWidth={2.5} />
          </div>
        </div>
        <div className="shrink-0 border-t bg-background px-6 py-3 space-y-2">
          <Button
            type="button"
            className="w-full"
            disabled={!point}
            onClick={() => { if (point) { onConfirm(point); onOpenChange(false); } }}
          >
            Confirmar localização
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
