// Edge function de endereços usando Google Maps Platform.
// APIs (server-side, via GOOGLE_MAPS_SERVER_KEY):
//   - Places API (New)  POST /v1/places:autocomplete       -> sugestões
//   - Places API (New)  GET  /v1/places/{id}                -> detalhes (lat/lng + components)
//   - Geocoding API     GET  /maps/api/geocode/json         -> reverse + geocode estruturado

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

// Geocoding API (clássica): address_components com long_name/short_name
function parseGoogleComponents(components: any[] = [], formatted = ""): Omit<AddrOut, "id" | "lat" | "lng"> {
  const get = (type: string, short = false) => {
    const c = components.find((x: any) => (x.types || []).includes(type));
    if (!c) return "";
    return short ? (c.short_name ?? "") : (c.long_name ?? "");
  };
  const street = get("route");
  const number = get("street_number");
  const neighborhood =
    get("sublocality_level_1") || get("sublocality") || get("neighborhood") || get("political") || "";
  const city = get("administrative_area_level_2") || get("locality") || "";
  const state = get("administrative_area_level_1", true).replace(/^BR-/i, "").toUpperCase();
  const cep = digitsOnly(get("postal_code"));
  return { place_name: formatted, street, number, neighborhood, city, state, cep };
}

// Places API (New): addressComponents com longText/shortText/types
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
  const city = get("administrative_area_level_2") || get("locality") || "";
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
    const { cep, street, number, neighborhood, city, state, lat: rLat, lng: rLng, q, proximity, placeId } = body ?? {};

    // ---------- PLACE DETAILS (resolver 1 placeId em lat/lng + components) ----------
    if (typeof placeId === "string" && placeId.length > 0) {
      const detailFields = "id,formattedAddress,location,addressComponents";
      const dr = await fetch(`${PLACES_BASE}/places/${placeId}`, {
        headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": detailFields },
      });
      const dd = await dr.json();
      if (!dr.ok) {
        console.log("places.details", dr.status, JSON.stringify(dd).slice(0, 300));
        return new Response(JSON.stringify({ error: "place_details_failed" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const loc = dd?.location;
      const parsed = parsePlacesNewComponents(dd?.addressComponents ?? [], dd?.formattedAddress ?? "");
      return new Response(
        JSON.stringify({
          id: placeId,
          lat: typeof loc?.latitude === "number" ? loc.latitude : undefined,
          lng: typeof loc?.longitude === "number" ? loc.longitude : undefined,
          ...parsed,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ---------- AUTOCOMPLETE (Places API New) - rápido, sem detalhes ----------
    if (typeof q === "string" && q.trim().length >= 2) {
      // Acrescenta cidade/UF ao input para priorizar resultados na cidade do restaurante
      const cityHint = [city, state].filter(Boolean).join(" ");
      const input = cityHint && !q.toLowerCase().includes(String(city).toLowerCase())
        ? `${q.trim()}, ${cityHint}`
        : q.trim();

      const reqBody: any = {
        input,
        languageCode: "pt-BR",
        regionCode: "BR",
        includedRegionCodes: ["br"],
      };
      if (proximity && typeof proximity.lat === "number" && typeof proximity.lng === "number") {
        // locationRestriction força resultados dentro do raio (cidade do restaurante)
        reqBody.locationRestriction = {
          circle: {
            center: { latitude: proximity.lat, longitude: proximity.lng },
            radius: 30000,
          },
        };
      }

      const r = await fetch(`${PLACES_BASE}/places:autocomplete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey },
        body: JSON.stringify(reqBody),
      });
      const data = await r.json();
      if (!r.ok) console.log("places:autocomplete", r.status, JSON.stringify(data).slice(0, 400));

      const preds: any[] = data?.suggestions ?? [];
      const suggestions = preds
        .map((s) => {
          const p = s?.placePrediction;
          if (!p?.placeId) return null;
          const main = p?.structuredFormat?.mainText?.text ?? "";
          const secondary = p?.structuredFormat?.secondaryText?.text ?? "";
          const full = p?.text?.text ?? [main, secondary].filter(Boolean).join(", ");
          return {
            id: p.placeId,
            place_name: full,
            main_text: main,
            secondary_text: secondary,
            street: "",
            number: "",
            neighborhood: "",
            city: "",
            state: "",
            cep: "",
          };
        })
        .filter(Boolean)
        .slice(0, 8);

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
      if (data?.status !== "OK") {
        console.log("revgeocode", data?.status, (data?.error_message ?? "").slice(0, 200));
      }
      const item = (data?.results ?? [])[0];
      if (!item) {
        return new Response(JSON.stringify({ lat: rLat, lng: rLng }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const parsed = parseGoogleComponents(item.address_components ?? [], item.formatted_address ?? "");
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
        console.log("geocode", data?.status, (data?.error_message ?? "").slice(0, 200));
        return null;
      }
      const item = (data?.results ?? [])[0];
      if (!item?.geometry?.location) return null;
      const parsed = parseGoogleComponents(item.address_components ?? [], item.formatted_address ?? "");
      return { lat: item.geometry.location.lat, lng: item.geometry.location.lng, ...parsed };
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
