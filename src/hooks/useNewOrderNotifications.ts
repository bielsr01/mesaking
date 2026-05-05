import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ordersKey } from "@/components/dashboard/OrdersPanel";

export type NotificationItem = {
  id: string;
  orderId: string;
  orderNumber?: number | null;
  customerName?: string | null;
  total?: number | null;
  source?: string | null;
  createdAt: number;
  read: boolean;
};

/**
 * Global listener for new orders. Stays subscribed across all tabs of the dashboard.
 * - Maintains a list of notifications
 * - Tracks unread count
 * - Triggers a "pulse" flag whenever a new order arrives (auto-clears after a moment)
 */
export function useNewOrderNotifications(restaurantId: string | undefined, isOnOrdersTab: boolean) {
  const qc = useQueryClient();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [pulse, setPulse] = useState(false);
  const pulseTimer = useRef<number | null>(null);

  // Auto-mark as read when user navigates to Orders tab
  useEffect(() => {
    if (isOnOrdersTab && notifications.some((n) => !n.read)) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  }, [isOnOrdersTab, notifications]);

  useEffect(() => {
    if (!restaurantId) return;
    const ch = supabase
      .channel(`global-orders-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        async (payload) => {
          const row = payload.new as any;
          // Refresh the orders cache so OrdersPanel picks it up immediately when opened
          qc.invalidateQueries({ queryKey: ordersKey(restaurantId) });

          // PDV orders are created in the dashboard itself — never notify/pulse
          if (row?.order_type === "pdv") return;

          // Auto-accept new orders if configured
          try {
            const { data: rest } = await supabase
              .from("restaurants")
              .select("order_acceptance_mode")
              .eq("id", restaurantId)
              .maybeSingle();
            if ((rest as any)?.order_acceptance_mode === "auto" && row.status === "pending") {
              await supabase.from("orders").update({ status: "accepted" }).eq("id", row.id);
              qc.invalidateQueries({ queryKey: ordersKey(restaurantId) });
            }
          } catch {}

          try {
            new Audio("data:audio/wav;base64,UklGRl9vAAA=").play().catch(() => {});
          } catch {}

          setNotifications((prev) => [
            {
              id: `${row.id}-${Date.now()}`,
              orderId: row.id,
              orderNumber: row.order_number,
              customerName: row.customer_name,
              total: row.total ? Number(row.total) : null,
              source: row.external_source ?? null,
              createdAt: Date.now(),
              read: isOnOrdersTab,
            },
            ...prev,
          ].slice(0, 30));

          // pulse animation
          setPulse(true);
          if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
          pulseTimer.current = window.setTimeout(() => setPulse(false), 4000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
      if (pulseTimer.current) window.clearTimeout(pulseTimer.current);
    };
  }, [restaurantId, qc, isOnOrdersTab]);

  const stopPulse = () => {
    if (pulseTimer.current) {
      window.clearTimeout(pulseTimer.current);
      pulseTimer.current = null;
    }
    setPulse(false);
  };
  const unreadCount = notifications.filter((n) => !n.read).length;
  const markAllRead = () => {
    stopPulse();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };
  const clear = () => {
    stopPulse();
    setNotifications([]);
  };

  return { notifications, unreadCount, pulse, markAllRead, clear };
}
