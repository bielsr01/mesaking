// Horário de funcionamento por dia da semana — um turno por dia.
// Estrutura armazenada em restaurants.opening_hours (jsonb):
// { "0": {open:"08:00", close:"22:00", enabled:true}, "1": {...}, ... } onde a chave é dia da semana 0=Dom..6=Sáb

export type DayHours = { open: string; close: string; enabled: boolean };
export type OpeningHours = Record<string, DayHours>;

export const DAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export const defaultHours = (): OpeningHours => {
  const h: OpeningHours = {};
  for (let i = 0; i < 7; i++) h[String(i)] = { open: "18:00", close: "23:00", enabled: i !== 0 };
  return h;
};

export function isWithinSchedule(hours: OpeningHours | null | undefined, now: Date = new Date()): boolean {
  if (!hours) return false;
  const day = String(now.getDay());
  const cfg = hours[day];
  if (!cfg || !cfg.enabled) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = (cfg.open || "00:00").split(":").map(Number);
  const [ch, cm] = (cfg.close || "00:00").split(":").map(Number);
  const openMin = oh * 60 + om;
  let closeMin = ch * 60 + cm;
  if (closeMin <= openMin) closeMin += 24 * 60; // cruza meia-noite
  const curAdj = cur < openMin ? cur + 24 * 60 : cur;
  return curAdj >= openMin && curAdj < closeMin;
}

// Override manual: { type: 'open' | 'closed', until: ISO string | null }
// until=null em 'closed' = fechado o dia todo (até próxima reabertura agendada)
// until=null em 'open' = aberto até o dono fechar manualmente
export type ManualOverride = { type: "open" | "closed"; until: string | null } | null;

function overrideActive(ov: ManualOverride, now: Date): ManualOverride {
  if (!ov) return null;
  if (ov.until && new Date(ov.until).getTime() <= now.getTime()) return null;
  return ov;
}

export function isOpenNow(
  hours: OpeningHours | null | undefined,
  override?: ManualOverride,
  now: Date = new Date()
): boolean {
  const ov = overrideActive(override ?? null, now);
  if (ov?.type === "open") return true;
  if (ov?.type === "closed") return false;
  return isWithinSchedule(hours, now);
}

export function getEffectiveOverride(ov: ManualOverride, now: Date = new Date()): ManualOverride {
  return overrideActive(ov, now);
}
