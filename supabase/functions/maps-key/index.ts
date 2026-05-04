// Devolve a Google Maps Browser Key (restrita por HTTP referrer no Console).
// É segura para expor ao frontend porque o Google bloqueia uso fora dos referrers permitidos.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const apiKey = Deno.env.get("GOOGLE_MAPS_SERVER_KEY") ?? "";
  return new Response(JSON.stringify({ apiKey }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
