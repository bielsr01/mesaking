// Edge function: geocodifica endereço usando Mapbox (token fica no servidor)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const token = Deno.env.get("MAPBOX_TOKEN");
    if (!token) throw new Error("MAPBOX_TOKEN not configured");

    const body = await req.json().catch(() => ({}));
    const { cep, street, number, neighborhood, city, state, lat: rLat, lng: rLng } = body ?? {};

    // Reverse geocoding (lat/lng -> endereço)
    if (typeof rLat === "number" && typeof rLng === "number") {
      const url = new URL(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${rLng},${rLat}.json`,
      );
      url.searchParams.set("access_token", token);
      url.searchParams.set("language", "pt");
      url.searchParams.set("limit", "5");
      const r = await fetch(url.toString());
      const data = await r.json();
      const features = (data?.features ?? []) as Array<any>;
      // Prioriza address (rua + nº), depois street, depois qualquer
      const f =
        features.find((x) => x.place_type?.includes("address")) ??
        features.find((x) => x.place_type?.includes("street")) ??
        features[0];
      let neigh = "";
      let cityR = "";
      let stateR = "";
      let cepR = "";
      // Procura contexto em todas as features (algumas vezes vem só na primeira)
      const allCtx: any[] = [];
      for (const x of features) {
        if (Array.isArray(x?.context)) allCtx.push(...x.context);
        if (x?.place_type?.[0] === "neighborhood" && !neigh) neigh = x.text;
        if (x?.place_type?.[0] === "place" && !cityR) cityR = x.text;
        if (x?.place_type?.[0] === "region" && !stateR) stateR = (x.properties?.short_code ?? x.text ?? "").replace(/^BR-/i, "").toUpperCase();
        if (x?.place_type?.[0] === "postcode" && !cepR) cepR = x.text;
      }
      for (const c of allCtx) {
        const id = String(c.id ?? "");
        if (id.startsWith("neighborhood") && !neigh) neigh = c.text;
        else if (id.startsWith("locality") && !neigh) neigh = c.text;
        else if (id.startsWith("place") && !cityR) cityR = c.text;
        else if (id.startsWith("region") && !stateR) stateR = (c.short_code ?? c.text ?? "").replace(/^BR-/i, "").toUpperCase();
        else if (id.startsWith("postcode") && !cepR) cepR = c.text;
      }
      const streetR = f?.text ?? "";
      const numberR = f?.address ?? "";
      return new Response(JSON.stringify({
        lat: rLat,
        lng: rLng,
        place_name: f?.place_name ?? "",
        street: streetR,
        number: numberR,
        neighborhood: neigh,
        city: cityR,
        state: stateR,
        cep: cepR,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const cleanCep = typeof cep === "string" ? cep.replace(/\D/g, "") : "";

    // Mapbox aceita query livre + parâmetros country/proximity/types
    // Estratégia: query "número rua, bairro, cidade, UF" — Mapbox no Brasil retorna address com número
    const buildQuery = (withNumber: boolean) =>
      [
        withNumber && number ? `${number} ${street ?? ""}`.trim() : street,
        neighborhood,
        city,
        state,
        cleanCep.length === 8 ? cleanCep : null,
        "Brasil",
      ]
        .filter(Boolean)
        .join(", ");

    const tryGeocode = async (q: string, types?: string) => {
      const url = new URL(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json`,
      );
      url.searchParams.set("access_token", token);
      url.searchParams.set("country", "br");
      url.searchParams.set("language", "pt");
      url.searchParams.set("limit", "5");
      if (types) url.searchParams.set("types", types);
      const r = await fetch(url.toString());
      if (!r.ok) return null;
      const data = await r.json();
      const features = data?.features as Array<any> | undefined;
      if (!features || !features.length) return null;
      // prioriza feature do tipo "address" (rua + número)
      const address = features.find((f) => f.place_type?.includes("address")) ?? features[0];
      const [lng, lat] = address.center ?? [];
      if (typeof lat !== "number" || typeof lng !== "number") return null;
      return { lat, lng, place_name: address.place_name as string, type: address.place_type?.[0] };
    };

    // 1) Tentativa com número (address)
    if (street && city) {
      const r = await tryGeocode(buildQuery(true), "address");
      if (r) {
        return new Response(JSON.stringify(r), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 2) Tentativa sem tipo restrito
    if (street && city) {
      const r = await tryGeocode(buildQuery(true));
      if (r) {
        return new Response(JSON.stringify(r), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 3) Apenas rua + cidade
    if (street && city) {
      const r = await tryGeocode(buildQuery(false));
      if (r) {
        return new Response(JSON.stringify(r), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 4) CEP
    if (cleanCep.length === 8) {
      const r = await tryGeocode(`${cleanCep}, Brasil`, "postcode");
      if (r) {
        return new Response(JSON.stringify(r), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 5) Cidade
    if (city) {
      const r = await tryGeocode([city, state, "Brasil"].filter(Boolean).join(", "), "place");
      if (r) {
        return new Response(JSON.stringify(r), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
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
