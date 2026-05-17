import { calcIfoodReceivable, IfoodFeeSettings } from "@/lib/ifoodFees";
import { calcQueroReceivable, QueroFeeSettings } from "@/lib/queroFees";

export type OrderLike = {
  id: string;
  order_number?: number | null;
  created_at: string;
  status: string;
  payment_method: string | null;
  external_source: string | null;
  order_type: string | null;
  total: number;
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  discount: number;
  merchant_subsidy: number;
  ifood_subsidy: number;
  change_for: number | null;
  coupon_code: string | null;
  customer_name: string | null;
};

export type CashMovement = {
  id: string;
  session_id: string | null;
  order_id: string | null;
  type: "order_cash" | "change_out" | "withdrawal" | "supply" | "adjustment" | "opening";
  amount: number;
  description: string | null;
  created_at: string;
};

export type Platform = "pdv" | "ifood" | "quero" | "delivery";

export function detectPlatform(o: OrderLike): Platform {
  if (o.external_source === "ifood") return "ifood";
  if (o.external_source === "quero") return "quero";
  if (o.order_type === "pdv") return "pdv";
  return "delivery";
}

export function normalizeMethod(m: string | null): string {
  const v = (m ?? "").toLowerCase();
  if (v === "cash" || v === "dinheiro") return "cash";
  if (v === "pix") return "pix";
  if (v === "credit" || v === "credit_card" || v === "cartao_credito") return "credit";
  if (v === "debit" || v === "debit_card" || v === "cartao_debito") return "debit";
  if (v === "online") return "online";
  return v || "other";
}

export const METHOD_LABEL: Record<string, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  credit: "Crédito",
  debit: "Débito",
  online: "Online",
  other: "Outro",
};

export type SessionTotals = {
  ordersCount: number;
  gross: number;
  byMethod: Record<string, number>;
  byPlatform: Record<Platform, number>;
  fees: number;
  net: number;
  cashFromOrders: number; // entrada líquida em dinheiro (valor do pedido em dinheiro; troco já considerado)
  changeOut: number; // saída de troco
  withdrawals: number;
  supplies: number;
  opening: number;
  expectedCash: number; // dinheiro que deve ter no caixa físico agora
};

export function computeTotals(
  orders: OrderLike[],
  movements: CashMovement[],
  ifoodSettings?: IfoodFeeSettings | null,
  queroSettings?: QueroFeeSettings | null,
): SessionTotals {
  const t: SessionTotals = {
    ordersCount: 0,
    gross: 0,
    byMethod: {},
    byPlatform: { pdv: 0, ifood: 0, quero: 0, delivery: 0 },
    fees: 0,
    net: 0,
    cashFromOrders: 0,
    changeOut: 0,
    withdrawals: 0,
    supplies: 0,
    opening: 0,
    expectedCash: 0,
  };
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    t.ordersCount++;
    t.gross += Number(o.total || 0);
    const plat = detectPlatform(o);
    t.byPlatform[plat] += Number(o.total || 0);
    const m = normalizeMethod(o.payment_method);
    t.byMethod[m] = (t.byMethod[m] ?? 0) + Number(o.total || 0);

    if (plat === "ifood") {
      const r = calcIfoodReceivable(o as any, ifoodSettings as any);
      t.fees += r.totalFees;
      t.net += r.net;
    } else if (plat === "quero") {
      const r = calcQueroReceivable(o as any, queroSettings as any);
      t.fees += r.totalFees;
      t.net += r.net;
    } else {
      t.net += Number(o.total || 0) - Number(o.discount || 0);
    }
  }
  for (const mv of movements) {
    const a = Number(mv.amount || 0);
    if (mv.type === "opening") t.opening += a;
    else if (mv.type === "order_cash") t.cashFromOrders += a;
    else if (mv.type === "change_out") t.changeOut += a; // negative
    else if (mv.type === "withdrawal") t.withdrawals += a; // negative
    else if (mv.type === "supply") t.supplies += a;
  }
  t.expectedCash =
    t.opening + t.cashFromOrders + t.changeOut + t.withdrawals + t.supplies;
  return t;
}

export function changeNeeded(o: OrderLike): number {
  if (normalizeMethod(o.payment_method) !== "cash") return 0;
  const cf = Number(o.change_for ?? 0);
  if (!cf || cf <= Number(o.total ?? 0)) return 0;
  return cf - Number(o.total);
}
