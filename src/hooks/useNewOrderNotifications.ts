import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { ordersKey } from "@/components/dashboard/OrdersPanel";
import { playSound } from "@/lib/orderSound";

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
 * - Notifies for ALL non-PDV orders (delivery, retirada, ifood)
 * - Pulse continues while there are pending (not yet accepted) orders
 * - Pulse stops automatically when the order is accepted/cancelled/etc.
 */
export function useNewOrderNotifications(restaurantId: string | undefined, isOnOrdersTab: boolean) {
  const qc = useQueryClient();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const pendingIdsRef = useRef(pendingIds);
  pendingIdsRef.current = pendingIds;

  // Auto-mark as read when user navigates to Orders tab
  useEffect(() => {
    if (isOnOrdersTab && notifications.some((n) => !n.read)) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    }
  }, [isOnOrdersTab, notifications]);

  // Initial load: find existing pending non-PDV orders so the bell pulses on mount if needed
  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("id")
        .eq("restaurant_id", restaurantId)
        .eq("status", "pending")
        .neq("order_type", "pdv");
      if (cancelled || !data) return;
      setPendingIds(new Set(data.map((r: any) => r.id)));
    })();
    return () => {
      cancelled = true;
    };
  }, [restaurantId]);

  useEffect(() => {
    if (!restaurantId) return;
    const ch = supabase
      .channel(`global-orders-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        async (payload) => {
          const row = payload.new as any;
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
              return;
            }
          } catch {}

          try {
            playSound();
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

          if (row.status === "pending") {
            setPendingIds((prev) => {
              const next = new Set(prev);
              next.add(row.id);
              return next;
            });
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          // Once an order is no longer pending, stop pulsing for it
          if (row.status && row.status !== "pending") {
            if (pendingIdsRef.current.has(row.id)) {
              setPendingIds((prev) => {
                const next = new Set(prev);
                next.delete(row.id);
                return next;
              });
            }
          }
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          const row = payload.old as any;
          if (!row) return;
          if (pendingIdsRef.current.has(row.id)) {
            setPendingIds((prev) => {
              const next = new Set(prev);
              next.delete(row.id);
              return next;
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [restaurantId, qc, isOnOrdersTab]);

  const pulse = pendingIds.size > 0;

  // Repeat the notification sound while there are pending orders not yet accepted
  useEffect(() => {
    if (pendingIds.size === 0) return;
    const interval = setInterval(() => {
      try {
        playSound();
      } catch {}
    }, 5000);
    return () => clearInterval(interval);
  }, [pendingIds]);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };
  const clear = () => {
    setNotifications([]);
  };

  return { notifications, unreadCount, pulse, markAllRead, clear };
}
