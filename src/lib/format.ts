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

/** Retorna YYYY-MM-DD da data informada (ou hoje) considerando o fuso de Brasília. */
export const isoDateBR = (v: Date = new Date()): string => {
  // en-CA produz no formato YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(v);
};

/** Hoje no fuso de Brasília (YYYY-MM-DD). */
export const todayISOBR = (): string => isoDateBR(new Date());

/** Componentes ano/mês/dia (1-based) da data no fuso de Brasília. */
export const ymdBR = (v: Date = new Date()): { y: number; m: number; d: number } => {
  const [y, m, d] = isoDateBR(v).split("-").map(Number);
  return { y, m, d };
};

/** Primeiro dia do mês de `v` (default: hoje), em Brasília, como YYYY-MM-DD. */
export const monthStartISOBR = (v: Date = new Date()): string => {
  const { y, m } = ymdBR(v);
  return `${y}-${String(m).padStart(2, "0")}-01`;
};

/** Último dia do mês de `v`, em Brasília, como YYYY-MM-DD. */
export const monthEndISOBR = (v: Date = new Date()): string => {
  const { y, m } = ymdBR(v);
  // Dia 0 do mês seguinte = último dia do mês atual (cálculo local, mas só usamos Y/M/D resultantes)
  const last = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
};

/** Adiciona N dias a uma data ISO (YYYY-MM-DD), retornando outra ISO. */
export const addDaysISO = (iso: string, days: number): string => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
};

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
  online: "Pago online",
};

export function paymentLabelFor(method: string, externalSource?: string | null): string {
  if (method === "online") {
    if (externalSource === "ifood") return "Pago via iFood (online)";
    if (externalSource === "quero") return "Pago via Quero Delivery (online)";
    return "Pago online";
  }
  return paymentLabel[method] ?? method;
}

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

/**
 * Normaliza telefone BR para o mesmo formato gravado pelo banco
 * (`(XX)XXXXX-XXXX`), removendo DDI 55 e adicionando o 9º dígito quando faltar.
 * Mantém em sincronia com a função SQL `public.normalize_br_phone`.
 */
export const normalizeBrPhone = (input: string | null | undefined): string => {
  if (!input) return "";
  let d = String(input).replace(/\D/g, "");
  if (!d) return String(input);
  if (d.length === 13 && d.startsWith("55")) d = d.slice(2);
  else if (d.length === 12 && d.startsWith("55")) d = d.slice(2);
  if (d.length === 10) d = d.slice(0, 2) + "9" + d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)})${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)})${d.slice(2, 6)}-${d.slice(6)}`;
  return String(input);
};

/** Formata telefone iFood (proxy 0800) com código localizador entre parênteses. */
export const formatIfoodPhone = (input: string | null | undefined): string => {
  const raw = String(input ?? "");
  const digits = raw.replace(/\D/g, "");
  const locMatch = raw.match(/(?:cód[^\w]*|localizador[^\w]*)([A-Za-z0-9]+)/i);
  const loc = locMatch?.[1] ?? digits.slice(11);
  const base = digits.slice(0, 11) || digits;
  const masked = base.length >= 10
    ? `${base.slice(0, 4)} ${base.slice(4, 7)} ${base.slice(7, 11)}`
    : base;
  return loc ? `${masked} (cód: ${loc})` : masked;
};
