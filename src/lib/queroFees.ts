// Cálculo de taxas e recebimento Quero Delivery por pedido
// Regras serão fornecidas pelo usuário; estrutura espelha ifoodFees.ts

export type QueroFeeSettings = {
  commission_enabled: boolean;
  commission_pct: number;
  online_payment_enabled: boolean;
  online_payment_pct: number;
};

export const DEFAULT_QUERO_FEES: QueroFeeSettings = {
  commission_enabled: true,
  commission_pct: 8,
  online_payment_enabled: true,
  online_payment_pct: 4.99,
};
