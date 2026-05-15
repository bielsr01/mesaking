import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const sb = supabase as any;
const WIDGET_ID = "284db617-bef1-473f-8fb0-f4fb529ee6de";
const SCRIPT_SRC = "https://widgets.ifood.com.br/widget.js";

declare global {
  interface Window {
    iFoodWidget?: {
      init: (opts: { widgetId: string; merchantIds: string[]; autoShow?: boolean }) => void | Promise<void>;
      show?: () => void;
      hide?: () => void;
    };
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

function hideIfoodWidgetFallback() {
  try {
    const sels = [
      ".embeddables-iframe",
      ".embeddables-focus-wrapper",
      '[data-embdd-hit-region-id]',
      'iframe[src*="widgets.ifood"]',
      'iframe[src*="ifood"]',
      '[data-ifood]',
      '[data-ifood-widget]',
    ];
    sels.forEach((s) => {
      try {
        document.querySelectorAll<HTMLElement>(s).forEach((el) => {
          el.style.display = "none";
          el.style.pointerEvents = "none";
        });
      } catch {}
    });
  } catch {}
}

function showIfoodWidgetFallback() {
  try {
    [".embeddables-iframe", ".embeddables-focus-wrapper", '[data-embdd-hit-region-id]'].forEach((s) => {
      document.querySelectorAll<HTMLElement>(s).forEach((el) => {
        el.style.display = "";
        el.style.pointerEvents = "";
      });
    });
  } catch {}
}

// IMPORTANTE: NUNCA remover iframe/script nem limpar cache/cookies do iFood.
// O cache (accessToken/refreshToken) fica em localStorage/cookies do domínio
// e é compartilhado entre usuários do mesmo navegador. Apenas escondemos.
export function cleanupIfoodWidgetDom() {
  try { window.iFoodWidget?.hide?.(); } catch {}
  hideIfoodWidgetFallback();
}

export function IfoodWidgetMount({ restaurantId }: { restaurantId?: string }) {
  const { data } = useQuery({
    queryKey: ["ifood-widget-cfg", restaurantId],
    enabled: !!restaurantId,
    staleTime: 0,
    refetchOnMount: "always",
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

  // Carrega o script uma única vez, independente de estar logado, para
  // manter a sessão/cache do widget aquecida em qualquer página.
  useEffect(() => {
    ensureScript();
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !merchantId) {
      cleanupIfoodWidgetDom();
      return;
    }

    (async () => {
      await ensureScript();
      if (cancelled) return;
      const tryInit = (attempts = 0) => {
        if (!window.iFoodWidget?.init) {
          if (attempts < 40) setTimeout(() => tryInit(attempts + 1), 200);
          return;
        }
        // Se já está inicializado para esse merchant, só mostra (preserva cache)
        if (window.__ifoodWidgetInitedFor === merchantId) {
          showIfoodWidgetFallback();
          try { window.iFoodWidget.show?.(); } catch {}
          return;
        }
        try {
          // Trocar merchant: re-init SEM reload, sem limpar cache.
          window.iFoodWidget.init({
            widgetId: WIDGET_ID,
            merchantIds: [merchantId],
            autoShow: true,
          });
          window.__ifoodWidgetInitedFor = merchantId;
          showIfoodWidgetFallback();
          try { window.iFoodWidget.show?.(); } catch {}
        } catch (e) {
          console.warn("iFood widget init error", e);
        }
      };
      tryInit();
    })();

    return () => {
      cancelled = true;
      // Apenas esconde ao desmontar — NUNCA destrói nem limpa cache.
      cleanupIfoodWidgetDom();
    };
  }, [enabled, merchantId]);

  return null;
}
