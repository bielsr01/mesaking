// Geolocalização gratuita via Nominatim (OpenStreetMap) e cálculo Haversine.
// Política de uso do Nominatim exige um User-Agent identificável; o navegador adiciona o seu próprio.

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

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

export async function geocodeAddress(addr: GeocodeAddress): Promise<GeoPoint | null> {
  const cleanCep = addr.cep ? addr.cep.replace(/\D/g, "") : "";

  // Estratégia 1: Endereço estruturado completo (mais preciso)
  if (addr.street && addr.city) {
    const params = new URLSearchParams({
      street: [addr.number, addr.street].filter(Boolean).join(" "),
      city: addr.city,
      country: "Brazil",
      format: "json",
      limit: "1",
      addressdetails: "0",
    });
    if (addr.state) params.set("state", addr.state);
    if (cleanCep.length === 8) params.set("postalcode", cleanCep);
    const r = await tryFetch(`${NOMINATIM}?${params.toString()}`);
    if (r) return r;
  }

  // Estratégia 2: rua + número + bairro + cidade + UF como query livre
  const fullParts = [
    addr.street && addr.number ? `${addr.street}, ${addr.number}` : addr.street,
    addr.neighborhood,
    addr.city,
    addr.state,
    "Brasil",
  ].filter(Boolean).join(", ");
  if (fullParts) {
    const r = await tryFetch(`${NOMINATIM}?q=${encodeURIComponent(fullParts)}&format=json&limit=1`);
    if (r) return r;
  }

  // Estratégia 3: rua + cidade + UF (sem número, sem bairro — pega a rua inteira)
  if (addr.street && addr.city) {
    const ruaOnly = [addr.street, addr.city, addr.state, "Brasil"].filter(Boolean).join(", ");
    const r = await tryFetch(`${NOMINATIM}?q=${encodeURIComponent(ruaOnly)}&format=json&limit=1`);
    if (r) return r;
  }

  // Estratégia 4: bairro + cidade + UF (aproximação por bairro)
  if (addr.neighborhood && addr.city) {
    const bairro = [addr.neighborhood, addr.city, addr.state, "Brasil"].filter(Boolean).join(", ");
    const r = await tryFetch(`${NOMINATIM}?q=${encodeURIComponent(bairro)}&format=json&limit=1`);
    if (r) return r;
  }

  // Estratégia 5: CEP isolado (Nominatim aceita postalcode)
  if (cleanCep.length === 8) {
    const r = await tryFetch(`${NOMINATIM}?postalcode=${cleanCep}&country=Brazil&format=json&limit=1`);
    if (r) return r;
  }

  // Estratégia 6: cidade + UF (último recurso, aproximação grosseira pelo centro da cidade)
  if (addr.city) {
    const cidade = [addr.city, addr.state, "Brasil"].filter(Boolean).join(", ");
    const r = await tryFetch(`${NOMINATIM}?q=${encodeURIComponent(cidade)}&format=json&limit=1`);
    if (r) return r;
  }

  return null;
}

async function tryFetch(url: string): Promise<GeoPoint | null> {
  try {
    const res = await fetch(url, { headers: { "Accept": "application/json", "Accept-Language": "pt-BR" } });
    if (!res.ok) return null;
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) return null;
    const lat = parseFloat(arr[0].lat);
    const lng = parseFloat(arr[0].lon);
    if (!isFinite(lat) || !isFinite(lng)) return null;
    return { lat, lng };
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
