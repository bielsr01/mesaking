import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;
const WIDGET_ID = "284db617-bef1-473f-8fb0-f4fb529ee6de";
const SCRIPT_SRC = "https://widgets.ifood.com.br/widget.js";

declare global {
  interface Window {
    iFoodWidget?: { init: (opts: { widgetId: string; merchantIds: string[] }) => void };
    __ifoodWidgetInitedFor?: string | null;
  }
}

function ensureScript(): Promise<void> {
  return new Promise((resolve) => {
    if (document.querySelector(`script[src="${SCRIPT_SRC}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
}

export function IfoodWidgetMount({ restaurantId }: { restaurantId?: string }) {
  const { data } = useQuery({
    queryKey: ["ifood-widget-cfg", restaurantId],
    enabled: !!restaurantId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await sb
        .from("ifood_fee_settings")
        .select("widget_enabled,widget_merchant_id")
        .eq("restaurant_id", restaurantId)
        .maybeSingle();
      return data ?? null;
    },
  });

  const enabled = !!data?.widget_enabled;
  const merchantId = (data?.widget_merchant_id ?? "").trim();

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !merchantId) return;
    // Sessão do widget é mantida pela própria iFood (cookies/localStorage do
    // domínio widgets.ifood.com.br). Para não derrubar a sessão a cada
    // remount/login, só chamamos init() uma vez por merchantId no ciclo da página.
    if (window.__ifoodWidgetInitedFor === merchantId) return;
    (async () => {
      await ensureScript();
      if (cancelled) return;
      const tryInit = (attempts = 0) => {
        if (window.__ifoodWidgetInitedFor === merchantId) return;
        if (window.iFoodWidget?.init) {
          try {
            window.iFoodWidget.init({ widgetId: WIDGET_ID, merchantIds: [merchantId] });
            window.__ifoodWidgetInitedFor = merchantId;
          } catch (e) {
            console.warn("iFood widget init error", e);
          }
        } else if (attempts < 30) {
          setTimeout(() => tryInit(attempts + 1), 200);
        }
      };
      tryInit();
    })();
    return () => { cancelled = true; };
  }, [enabled, merchantId]);

  return null;
}
