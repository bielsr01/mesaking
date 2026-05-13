export const brl = (v: number | string) =>
  Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Fuso horário oficial do sistema (Brasília, GMT-3). */
export const APP_TIMEZONE = "America/Sao_Paulo";

/** Formata uma data no fuso horário de Brasília (GMT-3). */
export const formatDateBR = (
  v: string | number | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" },
) => {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { timeZone: APP_TIMEZONE, ...opts });
};

/** Formata data + hora no fuso de Brasília. */
export const formatDateTimeBR = (v: string | number | Date | null | undefined) =>
  formatDateBR(v, {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });

/** Formata apenas a hora no fuso de Brasília. */
export const formatTimeBR = (v: string | number | Date | null | undefined) =>
  formatDateBR(v, { hour: "2-digit", minute: "2-digit" });

export const orderStatusLabel: Record<string, string> = {
  pending: "Aguardando aceitação",
  accepted: "Aceito",
  preparing: "Em preparo",
  out_for_delivery: "Saiu para entrega",
  awaiting_pickup: "Aguardando retirada",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

/** Rótulo de status considerando o tipo do pedido (PDV recebe sufixo "Balcão"). */
export const statusLabelFor = (status: string, orderType?: string | null): string => {
  const base = orderStatusLabel[status] ?? status;
  if (orderType === "pdv" && (status === "preparing" || status === "delivered")) {
    return `${base} Balcão`;
  }
  return base;
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

/** PDV: balcão entra em preparo e depois é marcado como entregue */
export const nextStatusPdv: Record<string, string | null> = {
  pending: "preparing", accepted: "preparing",
  preparing: "delivered",
  out_for_delivery: null, awaiting_pickup: null,
  delivered: null, cancelled: null,
};

/** Compat: mantém a API antiga, default para delivery */
export const nextStatus: Record<string, string | null> = nextStatusDelivery;

export const getNextStatus = (status: string, orderType: "delivery" | "pickup" | "pdv" = "delivery") => {
  const map = orderType === "pdv" ? nextStatusPdv : orderType === "pickup" ? nextStatusPickup : nextStatusDelivery;
  return map[status] ?? null;
};

export const orderTypeLabel: Record<string, string> = {
  delivery: "Delivery",
  pickup: "Retirada na loja",
  pdv: "PDV (Balcão)",
};

export const paymentLabel: Record<string, string> = {
  cash: "Dinheiro",
  pix: "Pix",
  card_on_delivery: "Cartão na entrega",
  online: "Pago via iFood (online)",
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
