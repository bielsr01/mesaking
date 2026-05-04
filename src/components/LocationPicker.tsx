import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin } from "lucide-react";

import { geocodeAddress, GeocodeAddress, GeoPoint } from "@/lib/delivery";

// Fix Leaflet default marker icon paths (Vite/bundler workaround)
const DefaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

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
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [loading, setLoading] = useState(false);
  const [point, setPoint] = useState<GeoPoint | null>(initialPoint ?? null);

  // Init map when dialog opens
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      let pt: GeoPoint | null = initialPoint ?? null;
      if (!pt) pt = await geocodeAddress(address);
      if (!pt) pt = { lat: -14.235, lng: -51.9253 }; // Brasil centro como fallback
      if (cancelled) return;
      setPoint(pt);
      setLoading(false);

      // Wait next tick for container to mount
      setTimeout(() => {
        if (!containerRef.current || cancelled) return;
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
        const map = L.map(containerRef.current, { zoomControl: true }).setView([pt!.lat, pt!.lng], 17);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "© OpenStreetMap",
          maxZoom: 19,
        }).addTo(map);
        map.on("move", () => {
          const c = map.getCenter();
          setPoint({ lat: c.lat, lng: c.lng });
        });
        map.on("moveend", () => {
          const c = map.getCenter();
          setPoint({ lat: c.lat, lng: c.lng });
        });
        mapRef.current = map;
        // Fix size after dialog animation
        setTimeout(() => map.invalidateSize(), 250);
      }, 50);
    };

    init();
    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 gap-0 flex flex-col overflow-hidden max-w-full w-screen h-[100dvh] sm:max-w-full rounded-none">
        <DialogHeader className="shrink-0 px-6 py-4 border-b">
          <DialogTitle className="flex items-center gap-2"><MapPin className="w-5 h-5" /> Confirme o local exato</DialogTitle>
          <DialogDescription>Arraste o pino ou toque no mapa para marcar a porta da sua casa.</DialogDescription>
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
          {point && (
            <div className="text-xs text-muted-foreground tabular-nums text-center">
              {point.lat.toFixed(6)}, {point.lng.toFixed(6)}
            </div>
          )}
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
