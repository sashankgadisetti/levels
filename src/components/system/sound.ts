/** Web Audio synth for System sounds. No audio files. Respects the `muted` setting. */
export type SoundName = "ding" | "levelup" | "arise" | "alarm" | "none";

const SETTINGS_KEY = "levels.settings";
let ctx: AudioContext | undefined;

/** Reads the shared settings blob so every window (main + system) agrees on mute/volume. */
function readSettings(): { muted?: boolean; volume?: number } {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}") ?? {};
  } catch {
    return {};
  }
}
export const isMuted = () => readSettings().muted === true;
const volume = () => {
  const v = readSettings().volume;
  return typeof v === "number" ? Math.min(1, Math.max(0, v)) : 0.8;
};

function audio(): AudioContext | undefined {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return undefined;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return undefined;
  }
}

type Tone = { f: number; at?: number; dur: number; vol: number; type?: OscillatorType; to?: number };

function tone(ac: AudioContext, out: AudioNode, t0: number, { f, at = 0, dur, vol, type = "sine", to }: Tone) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  const t = t0 + at;
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noise(ac: AudioContext, out: AudioNode, t0: number, dur: number, vol: number) {
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  const filt = ac.createBiquadFilter();
  filt.type = "lowpass";
  filt.frequency.setValueAtTime(300, t0);
  filt.frequency.exponentialRampToValueAtTime(2200, t0 + dur * 0.8);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + dur * 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt).connect(g).connect(out);
  src.start(t0);
}

const RECIPES: Record<Exclude<SoundName, "none">, (ac: AudioContext, out: AudioNode, t: number) => void> = {
  ding(ac, out, t) {
    tone(ac, out, t, { f: 1500, dur: 0.5, vol: 0.12 });
    tone(ac, out, t, { f: 3000, dur: 0.4, vol: 0.04, type: "triangle" });
  },
  levelup(ac, out, t) {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      tone(ac, out, t, { f, at: i * 0.13, dur: 0.6, vol: 0.1, type: "triangle" });
      tone(ac, out, t, { f: f * 2, at: i * 0.13, dur: 0.5, vol: 0.03 });
    });
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f) => tone(ac, out, t, { f, at: 0.55, dur: 1.4, vol: 0.05, type: "sine" }));
  },
  arise(ac, out, t) {
    noise(ac, out, t, 1.8, 0.22);
    tone(ac, out, t, { f: 60, dur: 2.4, vol: 0.22, type: "sawtooth", to: 38 });
    tone(ac, out, t, { f: 110, at: 0.3, dur: 2.0, vol: 0.08, type: "triangle", to: 82 });
    tone(ac, out, t, { f: 220, at: 1.2, dur: 1.2, vol: 0.05, type: "sine", to: 146 });
  },
  alarm(ac, out, t) {
    for (let i = 0; i < 3; i++) {
      tone(ac, out, t, { f: 880, at: i * 0.5, dur: 0.22, vol: 0.09, type: "square" });
      tone(ac, out, t, { f: 620, at: i * 0.5 + 0.24, dur: 0.22, vol: 0.09, type: "square" });
    }
  },
};

export function playSound(name: SoundName): void {
  if (name === "none" || isMuted()) return;
  const ac = audio();
  if (!ac) return;
  try {
    const master = ac.createGain();
    master.gain.value = volume();
    master.connect(ac.destination);
    RECIPES[name](ac, master, ac.currentTime + 0.01);
  } catch {
    /* audio is decoration; never throw */
  }
}
