export const brl = (v: number | string) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const orderStatusLabel: Record<string, string> = {
  pending: "Aguardando aceitação",
  accepted: "Aceito",
  preparing: "Em preparo",
  out_for_delivery: "Saiu para entrega",
  awaiting_pickup: "Aguardando retirada",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

/** Próximo status para pedidos de delivery */
export const nextStatusDelivery: Record<string, string | null> = {
  pending: "preparing",
  accepted: "preparing",
  preparing: "out_for_delivery",
  out_for_delivery: "delivered",
  delivered: null,
  cancelled: null,
};

/** Próximo status para pedidos de retirada */
export const nextStatusPickup: Record<string, string | null> = {
  pending: "preparing",
  accepted: "preparing",
  preparing: "awaiting_pickup",
  awaiting_pickup: "delivered",
  delivered: null,
  cancelled: null,
};

/** Compat: mantém a API antiga, default para delivery */
export const nextStatus: Record<string, string | null> = nextStatusDelivery;

export const getNextStatus = (status: string, orderType: "delivery" | "pickup" = "delivery") =>
  (orderType === "pickup" ? nextStatusPickup : nextStatusDelivery)[status] ?? null;

export const orderTypeLabel: Record<string, string> = {
  delivery: "Delivery",
  pickup: "Retirada na loja",
};

export const paymentLabel: Record<string, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  card_on_delivery: "Cartão na entrega",
};

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);

/**
 * Aplica máscara de telefone brasileiro: (XX) XXXXX-XXXX (celular) ou (XX) XXXX-XXXX (fixo).
 * Aceita qualquer entrada, ignora não-dígitos, retorna parcial enquanto digita.
 */
export const formatPhone = (input: string | null | undefined): string => {
  if (!input) return "";
  const d = String(input).replace(/\D/g, "").slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
};

/** Remove a máscara, devolvendo apenas dígitos. */
export const unmaskPhone = (input: string | null | undefined): string =>
  String(input ?? "").replace(/\D/g, "");
