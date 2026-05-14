// Cálculo de taxas e recebimento Quero Delivery por pedido
//
// Regras (oficiais Quero Delivery):
// - Valor bruto = subtotal (itens) + delivery_fee
// - Taxa fixa da plataforma (service_fee) NÃO entra em nada: é cobrada do
//   cliente pela Quero e não compõe nem reduz repasse nem base de cálculo.
// - Cupom do estabelecimento (merchant_subsidy):
//     * Reduz o repasse final ao restaurante
//     * NÃO reduz a base de cálculo das taxas
// - Cupom da Quero Delivery (quero_subsidy, armazenado em ifood_subsidy):
//     * NÃO reduz o repasse diretamente
//     * REDUZ a base de cálculo das taxas
// - Base = max(0, valor bruto - cupom Quero)
// - Taxas = soma dos percentuais habilitados aplicados sobre a base
// - Repasse líquido = valor bruto - taxas - cupom estabelecimento

export type QueroFeeSettings = {
  enabled: boolean;
  commission_enabled: boolean;
  commission_pct: number;
  online_payment_enabled: boolean;
  online_payment_pct: number;
};

export const DEFAULT_QUERO_FEES: QueroFeeSettings = {
  enabled: true,
  commission_enabled: true,
  commission_pct: 8,
  online_payment_enabled: true,
  online_payment_pct: 4.99,
};

export type QueroOrderForCalc = {
  subtotal?: number | null;
  delivery_fee?: number | null;
  service_fee?: number | null;
  merchant_subsidy?: number | null;
  ifood_subsidy?: number | null; // reutilizado como cupom Quero
  payment_method?: string | null;
};

export type QueroFeeBreakdownItem = {
  key: "commission" | "online_payment";
  label: string;
  pct: number;
  value: number;
};

export type QueroFeeBreakdown = {
  itemsTotal: number;
  deliveryFee: number;
  platformFee: number;        // taxa fixa da plataforma (informativa)
  gross: number;              // valor bruto sem taxa plataforma
  merchantSubsidy: number;    // cupom estabelecimento
  queroSubsidy: number;       // cupom Quero Delivery
  base: number;               // base de cálculo das taxas
  fees: QueroFeeBreakdownItem[];
  totalFees: number;
  net: number;                // repasse líquido
};

const r2 = (v: number) => Math.round(v * 100) / 100;

export function calcQueroReceivable(
  order: QueroOrderForCalc,
  settings: QueroFeeSettings | null | undefined,
): QueroFeeBreakdown {
  const itemsTotal = Number(order.subtotal ?? 0);
  const deliveryFee = Number(order.delivery_fee ?? 0);
  const platformFee = Number(order.service_fee ?? 0);
  const merchantSubsidy = Number(order.merchant_subsidy ?? 0);
  const queroSubsidy = Number(order.ifood_subsidy ?? 0);
  const gross = Math.max(0, itemsTotal + deliveryFee);

  const s = settings ?? DEFAULT_QUERO_FEES;
  if (s.enabled === false) {
    return {
      itemsTotal: r2(itemsTotal), deliveryFee: r2(deliveryFee), platformFee: r2(platformFee),
      gross: r2(gross), merchantSubsidy: r2(merchantSubsidy), queroSubsidy: r2(queroSubsidy),
      base: r2(gross), fees: [], totalFees: 0, net: r2(gross - merchantSubsidy),
    };
  }

  const base = Math.max(0, gross - queroSubsidy);
  const isOnline = (order.payment_method ?? "").toLowerCase() === "online";
  const fees: QueroFeeBreakdownItem[] = [];
  if (s.commission_enabled && s.commission_pct > 0) {
    fees.push({ key: "commission", label: "Taxa de serviço", pct: s.commission_pct, value: r2((base * s.commission_pct) / 100) });
  }
  if (s.online_payment_enabled && s.online_payment_pct > 0 && isOnline) {
    fees.push({ key: "online_payment", label: "Taxa de pagamento online", pct: s.online_payment_pct, value: r2((base * s.online_payment_pct) / 100) });
  }
  const totalFees = r2(fees.reduce((a, f) => a + f.value, 0));
  const net = r2(gross - totalFees - merchantSubsidy);

  return {
    itemsTotal: r2(itemsTotal),
    deliveryFee: r2(deliveryFee),
    platformFee: r2(platformFee),
    gross: r2(gross),
    merchantSubsidy: r2(merchantSubsidy),
    queroSubsidy: r2(queroSubsidy),
    base: r2(base),
    fees,
    totalFees,
    net,
  };
}
