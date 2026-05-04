// Edge function: autocomplete + geocoding usando Google Maps Platform.
// APIs usadas (server-side, via GOOGLE_MAPS_SERVER_KEY):
//   - Places API (New) /v1/places:autocomplete    -> sugestões
//   - Places API (New) /v1/places/{id}             -> detalhes (lat/lng + components)
//   - Geocoding API    /maps/api/geocode/json      -> reverse + geocode estruturado

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PLACES_BASE = "https://places.googleapis.com/v1";
const GEOCODE_BASE = "https://maps.googleapis.com/maps/api/geocode/json";

const digitsOnly = (v?: string) => (v ?? "").replace(/\D/g, "");

type AddrOut = {
  id: string;
  place_name: string;
  lat?: number;
  lng?: number;
  street: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  cep: string;
};

function parseGoogleAddressComponents(components: any[] = [], formatted = ""): Omit<AddrOut, "id" | "lat" | "lng"> {
  const get = (type: string, short = false) => {
    const c = components.find((x: any) => (x.types || []).includes(type));
    if (!c) return "";
    return short ? (c.short_name ?? c.shortText ?? "") : (c.long_name ?? c.longText ?? "");
  };
  const street = get("route");
  const number = get("street_number");
  const neighborhood =
    get("sublocality_level_1") || get("sublocality") || get("political") || get("neighborhood") || "";
  const city =
    get("administrative_area_level_2") ||
    get("locality") ||
    get("administrative_area_level_3") ||
    "";
  const state = get("administrative_area_level_1", true).replace(/^BR-/i, "").toUpperCase();
  const cep = digitsOnly(get("postal_code"));
  return { place_name: formatted, street, number, neighborhood, city, state, cep };
}

// Places API (New) usa addressComponents com longText/shortText/types
function parsePlacesNewComponents(components: any[] = [], formatted = ""): Omit<AddrOut, "id" | "lat" | "lng"> {
  const get = (type: string, short = false) => {
    const c = components.find((x: any) => (x.types || []).includes(type));
    if (!c) return "";
    return short ? (c.shortText ?? "") : (c.longText ?? "");
  };
  const street = get("route");
  const number = get("street_number");
  const neighborhood =
    get("sublocality_level_1") || get("sublocality") || get("neighborhood") || get("political") || "";
  const city =
    get("administrative_area_level_2") ||
    get("locality") ||
    get("administrative_area_level_3") ||
    "";
  const state = get("administrative_area_level_1", true).replace(/^BR-/i, "").toUpperCase();
  const cep = digitsOnly(get("postal_code"));
  return { place_name: formatted, street, number, neighborhood, city, state, cep };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("GOOGLE_MAPS_SERVER_KEY");
    if (!apiKey) throw new Error("GOOGLE_MAPS_SERVER_KEY not configured");

    const body = await req.json().catch(() => ({}));
    const { cep, street, number, neighborhood, city, state, lat: rLat, lng: rLng, q, proximity } = body ?? {};

    // ---------- AUTOCOMPLETE (Places API New) ----------
    if (typeof q === "string" && q.trim().length >= 3) {
      const reqBody: any = {
        input: q.trim(),
        languageCode: "pt-BR",
        regionCode: "BR",
        includedRegionCodes: ["br"],
      };
      if (proximity && typeof proximity.lat === "number") {
        reqBody.locationBias = {
          circle: {
            center: { latitude: proximity.lat, longitude: proximity.lng },
            radius: 50000,
          },
        };
      }

      const r = await fetch(`${PLACES_BASE}/places:autocomplete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
        },
        body: JSON.stringify(reqBody),
      });
      const data = await r.json();
      if (!r.ok) console.log("Google autocomplete", r.status, JSON.stringify(data).slice(0, 500));

      const preds: any[] = data?.suggestions ?? [];
      // Cada sugestão precisa ser resolvida pra lat/lng via Place Details (paralelizado).
      const detailFields = "id,formattedAddress,location,addressComponents";
      const details = await Promise.all(
        preds.slice(0, 8).map(async (s) => {
          const placeId = s?.placePrediction?.placeId;
          if (!placeId) return null;
          try {
            const dr = await fetch(`${PLACES_BASE}/places/${placeId}`, {
              headers: {
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask": detailFields,
              },
            });
            const dd = await dr.json();
            if (!dr.ok) return null;
            const loc = dd?.location;
            const parsed = parsePlacesNewComponents(dd?.addressComponents ?? [], dd?.formattedAddress ?? "");
            const out: AddrOut = {
              id: placeId,
              lat: typeof loc?.latitude === "number" ? loc.latitude : undefined,
              lng: typeof loc?.longitude === "number" ? loc.longitude : undefined,
              ...parsed,
            };
            return out;
          } catch {
            return null;
          }
        }),
      );

      let suggestions = details
        .filter((d): d is AddrOut => !!d && typeof d.lat === "number" && typeof d.lng === "number");

      // Se a Places API (New) ainda estiver bloqueada no projeto Google, usa Geocoding como fallback
      // para não deixar a busca de endereço completamente vazia.
      if (suggestions.length === 0) {
        const fallbackQuery = [q.trim(), city && state ? `${city} - ${state}` : city, "Brasil"].filter(Boolean).join(", ");
        const url = new URL(GEOCODE_BASE);
        url.searchParams.set("address", fallbackQuery);
        url.searchParams.set("language", "pt-BR");
        url.searchParams.set("region", "br");
        url.searchParams.set("components", "country:BR");
        url.searchParams.set("key", apiKey);
        const gr = await fetch(url.toString());
        const gd = await gr.json();
        if (gd?.status === "OK") {
          suggestions = (gd?.results ?? []).slice(0, 5).map((item: any, idx: number) => {
            const parsed = parseGoogleAddressComponents(item.address_components ?? [], item.formatted_address ?? "");
            return {
              id: item.place_id ?? `geocode-${idx}`,
              lat: item.geometry?.location?.lat,
              lng: item.geometry?.location?.lng,
              ...parsed,
            };
          }).filter((d: AddrOut) => typeof d.lat === "number" && typeof d.lng === "number");
        } else {
          console.log("Google autocomplete fallback geocode", gd?.status, (gd?.error_message ?? "").slice(0, 200));
        }
      }

      return new Response(JSON.stringify({ suggestions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- REVERSE GEOCODE ----------
    if (typeof rLat === "number" && typeof rLng === "number") {
      const url = new URL(GEOCODE_BASE);
      url.searchParams.set("latlng", `${rLat},${rLng}`);
      url.searchParams.set("language", "pt-BR");
      url.searchParams.set("region", "br");
      url.searchParams.set("key", apiKey);
      const r = await fetch(url.toString());
      const data = await r.json();
      if (data?.status !== "OK") console.log("Google revgeocode", data?.status, (data?.error_message ?? "").slice(0, 200));
      const item = (data?.results ?? [])[0];
      if (!item) {
        return new Response(JSON.stringify({ lat: rLat, lng: rLng }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const parsed = parseGoogleAddressComponents(item.address_components ?? [], item.formatted_address ?? "");
      return new Response(JSON.stringify({ ...parsed, lat: rLat, lng: rLng }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- GEOCODE ESTRUTURADO ----------
    const cleanCep = digitsOnly(cep);
    const qualified = [
      number && street ? `${street}, ${number}` : street,
      neighborhood,
      city && state ? `${city} - ${state}` : city,
      cleanCep.length === 8 ? cleanCep : null,
      "Brasil",
    ].filter(Boolean).join(", ");

    const tryGeocode = async (queryString: string) => {
      const url = new URL(GEOCODE_BASE);
      url.searchParams.set("address", queryString);
      url.searchParams.set("language", "pt-BR");
      url.searchParams.set("region", "br");
      url.searchParams.set("components", "country:BR");
      url.searchParams.set("key", apiKey);
      const r = await fetch(url.toString());
      const data = await r.json();
      if (data?.status !== "OK") {
        console.log("Google geocode", data?.status, (data?.error_message ?? "").slice(0, 200));
        return null;
      }
      const item = (data?.results ?? [])[0];
      if (!item?.geometry?.location) return null;
      const parsed = parseGoogleAddressComponents(item.address_components ?? [], item.formatted_address ?? "");
      return {
        lat: item.geometry.location.lat,
        lng: item.geometry.location.lng,
        ...parsed,
      };
    };

    if (qualified) {
      const r1 = await tryGeocode(qualified);
      if (r1) return new Response(JSON.stringify(r1), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (cleanCep.length === 8) {
      const r2 = await tryGeocode(`${cleanCep}, Brasil`);
      if (r2) return new Response(JSON.stringify(r2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (city) {
      const r3 = await tryGeocode([city, state, "Brasil"].filter(Boolean).join(", "));
      if (r3) return new Response(JSON.stringify(r3), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "not_found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
