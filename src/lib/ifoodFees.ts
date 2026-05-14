// Cálculo de taxas e recebimento iFood por pedido
//
// Regras:
// - Base = subtotal + delivery_fee - merchant_subsidy (subsídio loja em cupons)
// - Subsídio do iFood mantém a base (o iFood paga essa diferença para a loja)
// - service_fee (taxa de uso da plataforma cobrada do cliente, ex.: R$0,99) NÃO entra no
//   cálculo: o cliente paga ao iFood e ele não repassa.
// - Cada taxa configurada (comissão, cartão, antecipação) é um % aplicado sobre a base.
// - Recebimento líquido = Base - soma das taxas.

export type IfoodFeeSettings = {
  commission_enabled: boolean;
  commission_pct: number;
  card_enabled: boolean;
  card_pct: number;
  anticipation_enabled: boolean;
  anticipation_pct: number;
};

export const DEFAULT_IFOOD_FEES: IfoodFeeSettings = {
  commission_enabled: true,
  commission_pct: 0,
  card_enabled: true,
  card_pct: 0,
  anticipation_enabled: false,
  anticipation_pct: 2,
};

export type IfoodOrderForCalc = {
  subtotal?: number | null;
  delivery_fee?: number | null;
  merchant_subsidy?: number | null;
  ifood_subsidy?: number | null;
  payment_method?: string | null;
};

export type IfoodFeeBreakdownItem = {
  key: "commission" | "card" | "anticipation";
  label: string;
  pct: number;
  value: number;
};

export type IfoodFeeBreakdown = {
  base: number;
  fees: IfoodFeeBreakdownItem[];
  totalFees: number;
  net: number;
  merchantSubsidy: number;
  ifoodSubsidy: number;
};

export function calcIfoodReceivable(
  order: IfoodOrderForCalc,
  settings: IfoodFeeSettings | null | undefined,
): IfoodFeeBreakdown {
  const subtotal = Number(order.subtotal ?? 0);
  const delivery = Number(order.delivery_fee ?? 0);
  const merchantSubsidy = Number(order.merchant_subsidy ?? 0);
  const ifoodSubsidy = Number(order.ifood_subsidy ?? 0);
  const base = Math.max(0, subtotal + delivery - merchantSubsidy);

  const s = settings ?? DEFAULT_IFOOD_FEES;
  const fees: IfoodFeeBreakdownItem[] = [];
  if (s.commission_enabled && s.commission_pct > 0) {
    fees.push({ key: "commission", label: "Comissão da plataforma", pct: s.commission_pct, value: (base * s.commission_pct) / 100 });
  }
  if (s.card_enabled && s.card_pct > 0) {
    fees.push({ key: "card", label: "Taxa de uso do cartão", pct: s.card_pct, value: (base * s.card_pct) / 100 });
  }
  if (s.anticipation_enabled && s.anticipation_pct > 0) {
    fees.push({ key: "anticipation", label: "Taxa de antecipação", pct: s.anticipation_pct, value: (base * s.anticipation_pct) / 100 });
  }
  const totalFees = fees.reduce((a, f) => a + f.value, 0);
  const net = base - totalFees;
  return { base, fees, totalFees, net, merchantSubsidy, ifoodSubsidy };
}
