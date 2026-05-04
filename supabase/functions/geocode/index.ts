// Edge function: geocodifica endereço usando HERE Geocoding & Search v7
// Endpoints HERE usados:
//   - /v1/autosuggest        -> busca / autocomplete
//   - /v1/geocode            -> endereço estruturado -> lat/lng
//   - /v1/revgeocode         -> lat/lng -> endereço
//   - /v1/discover           -> busca livre fallback

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HERE_BASE = "https://geocode.search.hereapi.com";
const HERE_AUTOSUGGEST = "https://autosuggest.search.hereapi.com";

const digitsOnly = (v?: string) => (v ?? "").replace(/\D/g, "");

function extractAddress(item: any) {
  const a = item?.address ?? {};
  const pos = item?.position ?? {};
  const stateCode = (a.stateCode ?? a.state ?? "").replace(/^BR-/i, "").toUpperCase();
  return {
    id: item?.id ?? `${pos.lat},${pos.lng}`,
    place_name: a.label ?? item?.title ?? "",
    lat: typeof pos.lat === "number" ? pos.lat : undefined,
    lng: typeof pos.lng === "number" ? pos.lng : undefined,
    street: a.street ?? "",
    number: a.houseNumber ?? "",
    neighborhood: a.district ?? a.subdistrict ?? "",
    city: a.city ?? "",
    state: stateCode,
    cep: a.postalCode ?? "",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("HERE_API_KEY");
    if (!apiKey) throw new Error("HERE_API_KEY not configured");

    const body = await req.json().catch(() => ({}));
    const { cep, street, number, neighborhood, city, state, lat: rLat, lng: rLng, q, proximity } = body ?? {};
    const searchCity: string | undefined = city;
    const searchState: string | undefined = state;

    // ---------- AUTOCOMPLETE ----------
    if (typeof q === "string" && q.trim().length >= 3) {
      const at = proximity && typeof proximity.lat === "number"
        ? `${proximity.lat},${proximity.lng}`
        : "-14.235,-51.9253"; // centro do Brasil como fallback

      const url = new URL(`${HERE_AUTOSUGGEST}/v1/autosuggest`);
      url.searchParams.set("apiKey", apiKey);
      url.searchParams.set("q", q.trim());
      url.searchParams.set("at", at);
      url.searchParams.set("in", "countryCode:BRA");
      url.searchParams.set("lang", "pt-BR");
      url.searchParams.set("limit", "10");
      // Apenas resultados de endereço (rua/numero)
      url.searchParams.set("resultTypes", "houseNumber,street,address");

      const r = await fetch(url.toString());
      const data = await r.json();
      if (!r.ok) console.log("HERE autosuggest", r.status, JSON.stringify(data).slice(0, 500));
      let items: any[] = Array.isArray(data?.items) ? data.items : [];

      // Fallback: discover (mais permissivo) caso autosuggest venha vazio
      if (!items.length) {
        const dUrl = new URL(`${HERE_BASE}/v1/discover`);
        dUrl.searchParams.set("apiKey", apiKey);
        dUrl.searchParams.set("q", q.trim());
        dUrl.searchParams.set("at", at);
        dUrl.searchParams.set("in", "countryCode:BRA");
        dUrl.searchParams.set("lang", "pt-BR");
        dUrl.searchParams.set("limit", "10");
        const dr = await fetch(dUrl.toString());
        const dd = await dr.json();
        if (!dr.ok) console.log("HERE discover", dr.status, JSON.stringify(dd).slice(0, 500));
        items = Array.isArray(dd?.items) ? dd.items : [];
      }

      // Mantém só endereços com rua, ignora cidade/admin sozinhos
      const filteredItems = items.filter((it) => {
        const t = it?.resultType ?? "";
        return t === "houseNumber" || t === "street" || t === "address";
      });

      const suggestions = filteredItems
        .map(extractAddress)
        .filter((s) => typeof s.lat === "number" && typeof s.lng === "number")
        .sort((a, b) => {
          const ca = (a.city ?? "").toLowerCase() === (searchCity ?? "").toLowerCase() ? 0 : 1;
          const cb = (b.city ?? "").toLowerCase() === (searchCity ?? "").toLowerCase() ? 0 : 1;
          return ca - cb;
        });

      return new Response(JSON.stringify({ suggestions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---------- REVERSE GEOCODE ----------
    if (typeof rLat === "number" && typeof rLng === "number") {
      const url = new URL(`${HERE_BASE}/v1/revgeocode`);
      url.searchParams.set("apiKey", apiKey);
      url.searchParams.set("at", `${rLat},${rLng}`);
      url.searchParams.set("lang", "pt-BR");
      url.searchParams.set("limit", "1");
      const r = await fetch(url.toString());
      const data = await r.json();
      if (!r.ok) console.log("HERE revgeocode", r.status, JSON.stringify(data).slice(0, 500));
      const item = (data?.items ?? [])[0];
      if (!item) {
        return new Response(JSON.stringify({ lat: rLat, lng: rLng }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const out = extractAddress(item);
      return new Response(JSON.stringify({ ...out, lat: rLat, lng: rLng }), {
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
      const url = new URL(`${HERE_BASE}/v1/geocode`);
      url.searchParams.set("apiKey", apiKey);
      url.searchParams.set("q", queryString);
      url.searchParams.set("in", "countryCode:BRA");
      url.searchParams.set("lang", "pt-BR");
      url.searchParams.set("limit", "1");
      const r = await fetch(url.toString());
      if (!r.ok) {
        const t = await r.text();
        console.log("HERE geocode", r.status, t.slice(0, 300));
        return null;
      }
      const data = await r.json();
      const item = (data?.items ?? [])[0];
      if (!item?.position) return null;
      const out = extractAddress(item);
      return { lat: item.position.lat, lng: item.position.lng, place_name: out.place_name, type: item.resultType };
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
