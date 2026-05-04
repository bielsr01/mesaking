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

type NominatimResult = {
  lat: string;
  lon: string;
  osm_type?: string;
  class?: string;
  type?: string;
  address?: { house_number?: string; road?: string };
};

export async function geocodeAddress(addr: GeocodeAddress): Promise<GeoPoint | null> {
  const cleanCep = addr.cep ? addr.cep.replace(/\D/g, "") : "";
  const num = (addr.number ?? "").trim();

  // Estratégia 1: query livre com número primeiro — costuma retornar o ponto exato (house_number)
  if (addr.street && addr.city) {
    const q = [
      num ? `${addr.street}, ${num}` : addr.street,
      addr.neighborhood,
      addr.city,
      addr.state,
      "Brasil",
    ].filter(Boolean).join(", ");
    const results = await tryFetchAll(`${NOMINATIM}?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1`);
    const best = pickBest(results, num);
    if (best) return best;
  }

  // Estratégia 2: estruturado (rua + número)
  if (addr.street && addr.city) {
    const params = new URLSearchParams({
      street: [num, addr.street].filter(Boolean).join(" "),
      city: addr.city,
      country: "Brazil",
      format: "json",
      limit: "5",
      addressdetails: "1",
    });
    if (addr.state) params.set("state", addr.state);
    if (cleanCep.length === 8) params.set("postalcode", cleanCep);
    const results = await tryFetchAll(`${NOMINATIM}?${params.toString()}`);
    const best = pickBest(results, num);
    if (best) return best;
  }

  // Estratégia 3: rua + cidade + UF (sem número — pega a rua inteira)
  if (addr.street && addr.city) {
    const ruaOnly = [addr.street, addr.city, addr.state, "Brasil"].filter(Boolean).join(", ");
    const r = await tryFetch(`${NOMINATIM}?q=${encodeURIComponent(ruaOnly)}&format=json&limit=1`);
    if (r) return r;
  }

  // Estratégia 4: bairro + cidade
  if (addr.neighborhood && addr.city) {
    const bairro = [addr.neighborhood, addr.city, addr.state, "Brasil"].filter(Boolean).join(", ");
    const r = await tryFetch(`${NOMINATIM}?q=${encodeURIComponent(bairro)}&format=json&limit=1`);
    if (r) return r;
  }

  // Estratégia 5: CEP isolado
  if (cleanCep.length === 8) {
    const r = await tryFetch(`${NOMINATIM}?postalcode=${cleanCep}&country=Brazil&format=json&limit=1`);
    if (r) return r;
  }

  // Estratégia 6: cidade + UF
  if (addr.city) {
    const cidade = [addr.city, addr.state, "Brasil"].filter(Boolean).join(", ");
    const r = await tryFetch(`${NOMINATIM}?q=${encodeURIComponent(cidade)}&format=json&limit=1`);
    if (r) return r;
  }

  return null;
}

function pickBest(results: NominatimResult[], number: string): GeoPoint | null {
  if (!results.length) return null;
  // 1) match exato de house_number
  if (number) {
    const exact = results.find((r) => r.address?.house_number === number);
    if (exact) return toPoint(exact);
  }
  // 2) qualquer resultado com house_number (ponto/edifício específico)
  const withNumber = results.find((r) => r.address?.house_number);
  if (withNumber) return toPoint(withNumber);
  // 3) resultado tipo "place" (node) — geralmente endereço pontual interpolado
  const node = results.find((r) => r.osm_type === "node" && r.class !== "highway");
  if (node) return toPoint(node);
  // 4) fallback: primeiro resultado
  return toPoint(results[0]);
}

function toPoint(r: NominatimResult): GeoPoint | null {
  const lat = parseFloat(r.lat);
  const lng = parseFloat(r.lon);
  if (!isFinite(lat) || !isFinite(lng)) return null;
  return { lat, lng };
}

async function tryFetchAll(url: string): Promise<NominatimResult[]> {
  try {
    const res = await fetch(url, { headers: { "Accept": "application/json", "Accept-Language": "pt-BR" } });
    if (!res.ok) return [];
    const arr = await res.json();
    return Array.isArray(arr) ? (arr as NominatimResult[]) : [];
  } catch {
    return [];
  }
}

async function tryFetch(url: string): Promise<GeoPoint | null> {
  const arr = await tryFetchAll(url);
  return arr.length ? toPoint(arr[0]) : null;
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
