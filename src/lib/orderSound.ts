// Sound options for new-order notifications.
// Sounds are synthesized with the Web Audio API so we don't need any assets.

export type SoundId = "off" | "bell" | "beep" | "chime";

export const SOUND_OPTIONS: { id: SoundId; label: string }[] = [
  { id: "bell", label: "Sino" },
  { id: "beep", label: "Beep" },
  { id: "chime", label: "Campainha" },
  { id: "off", label: "Desativado" },
];

const STORAGE_KEY = "mesapro:order-sound";

export function getSoundChoice(): SoundId {
  try {
    const v = localStorage.getItem(STORAGE_KEY) as SoundId | null;
    if (v && SOUND_OPTIONS.some((o) => o.id === v)) return v;
  } catch {}
  return "bell";
}

export function setSoundChoice(id: SoundId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {}
}

let ctx: AudioContext | null = null;
function getCtx(): AudioContext | null {
  try {
    if (!ctx) {
      const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext | undefined;
      if (!Ctor) return null;
      ctx = new Ctor();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

function tone(ac: AudioContext, freq: number, start: number, duration: number, type: OscillatorType = "sine", peak = 0.35) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  gain.gain.setValueAtTime(0.0001, ac.currentTime + start);
  gain.gain.exponentialRampToValueAtTime(peak, ac.currentTime + start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + duration);
  osc.connect(gain).connect(ac.destination);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + duration + 0.05);
}

export function playSound(id: SoundId = getSoundChoice()) {
  if (id === "off") return;
  const ac = getCtx();
  if (!ac) return;
  try {
    if (id === "bell") {
      // Bell: bright high tone + lower harmonic, long decay
      tone(ac, 1760, 0, 0.9, "triangle", 0.35);
      tone(ac, 880, 0, 1.1, "sine", 0.25);
    } else if (id === "beep") {
      // Short double beep
      tone(ac, 1200, 0, 0.18, "square", 0.3);
      tone(ac, 1200, 0.22, 0.18, "square", 0.3);
    } else if (id === "chime") {
      // Ding-dong doorbell
      tone(ac, 880, 0, 0.5, "sine", 0.3);
      tone(ac, 659, 0.35, 0.7, "sine", 0.3);
    }
  } catch {}
}
