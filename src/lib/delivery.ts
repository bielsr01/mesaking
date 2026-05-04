// Geocoding via Mapbox (edge function geocode) e cálculo Haversine.
import { supabase } from "@/integrations/supabase/client";

export type DeliveryZone = { radius_km: number; fee: number };

export type GeoPoint = { lat: number; lng: number };

export type GeocodeAddress = {
  cep?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
};



export type ReverseGeocodeResult = GeoPoint & {
  place_name?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
};

export async function geocodeAddress(addr: GeocodeAddress): Promise<GeoPoint | null> {
  try {
    const { data, error } = await supabase.functions.invoke("geocode", { body: addr });
    if (error || !data) return null;
    const lat = Number((data as any).lat);
    const lng = Number((data as any).lng);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat, lng };
  } catch {
    return null;
  }
}

export async function reverseGeocode(pt: GeoPoint): Promise<ReverseGeocodeResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke("geocode", { body: { lat: pt.lat, lng: pt.lng } });
    if (error || !data) return null;
    return data as ReverseGeocodeResult;
  } catch {
    return null;
  }
}

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Encontra a taxa de entrega para uma distância. As zonas representam o RAIO MÁXIMO.
 * Ex: zonas = [{radius_km:5, fee:7}, {radius_km:10, fee:12}]
 *     - distância 3km  -> R$7  (cabe na zona de 5km)
 *     - distância 7km  -> R$12 (cabe na zona de 10km)
 *     - distância 12km -> null (fora de área)
 */
export function findDeliveryFee(distanceKm: number, zones: DeliveryZone[]): { fee: number; zone: DeliveryZone } | null {
  const sorted = [...zones].filter((z) => z.radius_km > 0).sort((a, b) => a.radius_km - b.radius_km);
  for (const z of sorted) {
    if (distanceKm <= z.radius_km) return { fee: Number(z.fee), zone: z };
  }
  return null;
}
