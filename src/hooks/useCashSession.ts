import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CashMovement, OrderLike } from "@/lib/cashFlow";

export function useOpenSession(restaurantId?: string) {
  return useQuery({
    queryKey: ["cashSession", restaurantId],
    enabled: !!restaurantId,
    staleTime: 10_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("cash_register_sessions")
        .select("*")
        .eq("restaurant_id", restaurantId!)
        .eq("status", "open")
        .maybeSingle();
      return data;
    },
  });
}

export function useSessionMovements(sessionId?: string | null) {
  return useQuery({
    queryKey: ["cashMovements", sessionId],
    enabled: !!sessionId,
    staleTime: 5_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("cash_movements")
        .select("*")
        .eq("session_id", sessionId!)
        .order("created_at", { ascending: true });
      return (data ?? []) as CashMovement[];
    },
  });
}

export function useSessionOrders(restaurantId?: string, openedAt?: string | null) {
  return useQuery({
    queryKey: ["cashOrders", restaurantId, openedAt],
    enabled: !!restaurantId && !!openedAt,
    staleTime: 5_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select(
          "id,order_number,created_at,status,payment_method,external_source,order_type,total,subtotal,delivery_fee,service_fee,discount,merchant_subsidy,ifood_subsidy,change_for,coupon_code,customer_name",
        )
        .eq("restaurant_id", restaurantId!)
        .gte("created_at", openedAt!)
        .order("created_at", { ascending: false });
      return (data ?? []) as OrderLike[];
    },
  });
}

export function useCashRealtime(restaurantId?: string, sessionId?: string | null) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!restaurantId) return;
    const ch = supabase
      .channel(`cashflow-${restaurantId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["cashOrders", restaurantId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cash_movements", filter: `restaurant_id=eq.${restaurantId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["cashMovements", sessionId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cash_register_sessions", filter: `restaurant_id=eq.${restaurantId}` },
        () => {
          qc.invalidateQueries({ queryKey: ["cashSession", restaurantId] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [restaurantId, sessionId, qc]);
}
