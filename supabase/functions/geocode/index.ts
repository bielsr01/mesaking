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
    const { cep, street, number, neighborhood, city, state, lat: rLat, lng: rLng, q, proximity } = body ?? {};
    const searchCity: string | undefined = body?.city;
    const searchState: string | undefined = body?.state;

    // Search autocomplete (q -> lista de sugestões)
    if (typeof q === "string" && q.trim().length >= 3) {
      const normalize = (value?: string) =>
        (value ?? "")
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .trim()
          .toLowerCase();
      const parseTypedAddress = (value: string) => {
        const clean = value.trim().replace(/\s+/g, " ");
        const commaNumber = clean.match(/^(.*?),\s*(\d+[\w\-/]*)\s*$/);
        if (commaNumber) return { street: commaNumber[1].trim(), number: commaNumber[2].trim() };
        const endingNumber = clean.match(/^(.*?)\s+(\d+[\w\-/]*)\s*$/);
        if (endingNumber) return { street: endingNumber[1].trim(), number: endingNumber[2].trim() };
        return { street: clean, number: "" };
      };
      const typed = parseTypedAddress(q);
      const citySuffix = searchCity ? `${searchCity}${searchState ? ` - ${searchState}` : ""}` : "";
      const candidateQueries = Array.from(new Set([
        citySuffix ? `${q.trim()}, ${citySuffix}` : q.trim(),
        typed.number && citySuffix ? `${typed.number} ${typed.street}, ${citySuffix}` : "",
        typed.street && citySuffix ? `${typed.street}, ${citySuffix}` : "",
        q.trim(),
      ].filter(Boolean)));

      const fetchFeatures = async (queryStr: string, types?: string) => {
        const url = new URL(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(queryStr)}.json`,
        );
        url.searchParams.set("access_token", token);
        url.searchParams.set("country", "br");
        url.searchParams.set("language", "pt");
        url.searchParams.set("limit", "8");
        url.searchParams.set("autocomplete", "true");
        // "street" não é um tipo válido neste endpoint e fazia a busca voltar vazia.
        if (types) url.searchParams.set("types", types);
        if (proximity && typeof proximity.lat === "number" && typeof proximity.lng === "number") {
          url.searchParams.set("proximity", `${proximity.lng},${proximity.lat}`);
        }
        console.log("search url", url.toString());
        const r = await fetch(url.toString());
        const data = await r.json();
        if (!r.ok) console.log("search mapbox status", r.status, "body", JSON.stringify(data).slice(0, 500));
        return (data?.features ?? []) as Array<any>;
      };

      const rawFeatures: Array<any> = [];
      for (const queryStr of candidateQueries) {
        // Apenas endereços (rua + nº). Evita sugerir cidade, bairro ou CEP soltos.
        rawFeatures.push(...await fetchFeatures(queryStr, "address"));
        if (rawFeatures.length) break;
      }
      // Filtra ainda no resultado para garantir que só endereços apareçam
      const onlyAddresses = rawFeatures.filter((f) => Array.isArray(f?.place_type) && f.place_type.includes("address"));

      const seen = new Set<string>();
      const suggestions = onlyAddresses.filter((f) => {
        const id = String(f?.id ?? f?.place_name ?? "");
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      }).map((f) => {
        const ctx: any[] = Array.isArray(f.context) ? f.context : [];
        let neigh = "", cityR = "", stateR = "", cepR = "";
        for (const c of ctx) {
          const id = String(c.id ?? "");
          if (id.startsWith("neighborhood") && !neigh) neigh = c.text;
          else if (id.startsWith("locality") && !neigh) neigh = c.text;
          else if (id.startsWith("place") && !cityR) cityR = c.text;
          else if (id.startsWith("region") && !stateR) stateR = (c.short_code ?? c.text ?? "").replace(/^BR-/i, "").toUpperCase();
          else if (id.startsWith("postcode") && !cepR) cepR = c.text;
        }
        const [lng, lat] = f.center ?? [];
        return {
          id: f.id,
          place_name: f.place_name,
          lat, lng,
          street: f.text ?? "",
          number: f.address ?? "",
          neighborhood: neigh,
          city: cityR,
          state: stateR,
          cep: cepR,
        };
      }).sort((a, b) => {
        const cityA = normalize(a.city) === normalize(searchCity) ? 0 : 1;
        const cityB = normalize(b.city) === normalize(searchCity) ? 0 : 1;
        const stateA = normalize(a.state) === normalize(searchState) ? 0 : 1;
        const stateB = normalize(b.state) === normalize(searchState) ? 0 : 1;
        return cityA - cityB || stateA - stateB;
      });

      // Enriquecer bairro via Nominatim (OSM) quando o Mapbox não retornar
      const enrichWithOSM = async (s: any) => {
        if (s.neighborhood || typeof s.lat !== "number" || typeof s.lng !== "number") return s;
        try {
          const url = `https://nominatim.openstreetmap.org/reverse?lat=${s.lat}&lon=${s.lng}&format=json&addressdetails=1&accept-language=pt-BR`;
          const r = await fetch(url, { headers: { "User-Agent": "lovable-geocode/1.0" } });
          if (!r.ok) return s;
          const data = await r.json();
          const addr = data?.address ?? {};
          const neigh = addr.suburb || addr.neighbourhood || addr.hamlet || addr.quarter || addr.city_district || "";
          if (neigh) s.neighborhood = neigh;
          if (!s.cep && addr.postcode) s.cep = addr.postcode;
        } catch (_) { /* ignora */ }
        return s;
      };
      await Promise.all(suggestions.slice(0, 6).map(enrichWithOSM));

      if (!suggestions.length && proximity && typeof proximity.lat === "number" && typeof proximity.lng === "number") {
        suggestions.push({
          id: `manual-${Date.now()}`,
          place_name: [q.trim(), citySuffix || undefined, "Brasil"].filter(Boolean).join(", "),
          lat: proximity.lat,
          lng: proximity.lng,
          street: typed.street,
          number: typed.number,
          neighborhood: "",
          city: searchCity ?? "",
          state: searchState ?? "",
          cep: "",
        });
      }
      return new Response(JSON.stringify({ suggestions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Reverse geocoding (lat/lng -> endereço)
    if (typeof rLat === "number" && typeof rLng === "number") {
      const fetchReverse = async (types?: string) => {
        const url = new URL(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${rLng},${rLat}.json`,
        );
        url.searchParams.set("access_token", token);
        url.searchParams.set("language", "pt");
        if (types) url.searchParams.set("types", types);
        const r = await fetch(url.toString());
        const data = await r.json();
        if (!r.ok) console.log("reverse mapbox status", r.status, "body", JSON.stringify(data).slice(0, 500));
        return (data?.features ?? []) as Array<any>;
      };

      // Busca em paralelo: endereço (rua+nº) e bairro/localidade
      const [addrFeatures, neighFeatures] = await Promise.all([
        fetchReverse(),
        fetchReverse("neighborhood,locality,place,region,postcode"),
      ]);
      const features = [...addrFeatures, ...neighFeatures];
      const f =
        addrFeatures.find((x) => x.place_type?.includes("address")) ??
        addrFeatures.find((x) => x.place_type?.includes("street")) ??
        addrFeatures[0];
      let neigh = "";
      let cityR = "";
      let stateR = "";
      let cepR = "";
      const allCtx: any[] = [];
      for (const x of features) {
        if (Array.isArray(x?.context)) allCtx.push(...x.context);
        const pt = x?.place_type?.[0];
        if ((pt === "neighborhood" || pt === "locality") && !neigh) neigh = x.text;
        if (pt === "place" && !cityR) cityR = x.text;
        if (pt === "region" && !stateR) stateR = (x.properties?.short_code ?? x.text ?? "").replace(/^BR-/i, "").toUpperCase();
        if (pt === "postcode" && !cepR) cepR = x.text;
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
