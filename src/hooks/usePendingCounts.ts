import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Conta pedidos delivery/retirada com status pending (não inclui PDV). */
export function usePendingOrdersCount(restaurantId: string | undefined) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!restaurantId) return;
    let cancelled = false;
    const refresh = async () => {
      const { count: c } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("restaurant_id", restaurantId)
        .eq("status", "pending")
        .neq("order_type", "pdv");
      if (!cancelled) setCount(c ?? 0);
    };
    refresh();
    const ch = supabase
      .channel(`pending-orders-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        () => refresh()
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [restaurantId]);

  return count;
}

/** Conta pedidos de insumos com status pending (admin: todos os restaurantes). */
export function usePendingSupplyOrdersCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      const { count: c } = await supabase
        .from("supply_orders")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      if (!cancelled) setCount(c ?? 0);
    };
    refresh();
    const ch = supabase
      .channel("pending-supply-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "supply_orders" },
        () => refresh()
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, []);

  return count;
}
