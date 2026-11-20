// The game's sound, made on the device: no audio files. Every sound is a few oscillators and some
// filtered noise shaped by an envelope (Web Audio), so the whole layer costs nothing to download,
// works offline and can be as loud, as long and as many as the moment needs. One context for the
// app, opened by the first touch (browsers keep audio shut until then), with everything through one
// limiter so a dunk over a roaring crowd never clips. Two buses: the game's (the ball, the rim, the
// whistle, the horns, the crowd, and the chime when a deal or a moment lands) and the interface's (a
// tick under a tap). The device's settings (ui/device.ts) open and shut each; nothing here knows what
// a basketball game is: live/gameSound.ts and ui/cues.ts decide what plays when.
import { devicePrefs, onDevicePrefs } from './device';

export type Sfx =
  | 'tap'
  | 'toggleOn'
  | 'toggleOff'
  | 'chime'
  | 'bounce'
  | 'swish'
  | 'rim'
  | 'board'
  | 'dunk'
  | 'block'
  | 'squeak'
  | 'whistle'
  | 'buzzer'
  | 'horn'
  | 'cheer'
  | 'roar'
  | 'groan'
  | 'ooh';

const GAME: ReadonlySet<Sfx> = new Set<Sfx>(['chime', 'bounce', 'swish', 'rim', 'board', 'dunk', 'block', 'squeak', 'whistle', 'buzzer', 'horn', 'cheer', 'roar', 'groan', 'ooh']);

type Ctx = AudioContext;

interface Rig {
  ctx: Ctx;
  /** Everything, into the limiter. */
  out: GainNode;
  game: GainNode;
  ui: GainNode;
  noise: AudioBuffer;
  crowd: Crowd | null;
}

interface Crowd {
  /** The bed's own level, and the swell that rides over it. */
  bed: GainNode;
  swell: GainNode;
  tone: BiquadFilterNode;
  stop: () => void;
}

let rig: Rig | null = null;
let failed = false;
/** The crowd asked for (null: no game on), kept so a context opened later starts where the game is. */
let crowdWant: number | null = null;

const now = () => rig!.ctx.currentTime;

function open(): Rig | null {
  if (rig || failed) return rig;
  const AC = typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!AC) {
    failed = true;
    return null;
  }
  try {
    const ctx = new AC({ latencyHint: 'interactive' });
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 8;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    limiter.connect(ctx.destination);
    const out = ctx.createGain();
    out.connect(limiter);
    const game = ctx.createGain();
    const ui = ctx.createGain();
    game.connect(out);
    ui.connect(out);
    // two seconds of white noise, looped wherever noise is wanted
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    let seed = 22222;
    for (let i = 0; i < data.length; i++) {
      // (a fixed sequence: the same hiss every visit, and no Math.random in a hot loop)
      seed = (seed * 16807) % 2147483647;
      data[i] = (seed / 2147483647) * 2 - 1;
    }
    rig = { ctx, out, game, ui, noise, crowd: null };
    levels();
    if (crowdWant !== null) startCrowd();
    return rig;
  } catch {
    failed = true;
    return null;
  }
}

/** The buses follow the device's settings (a short ramp: no click when a switch is thrown). */
function levels() {
  if (!rig) return;
  const p = devicePrefs();
  const t = now();
  rig.out.gain.setTargetAtTime(p.volume, t, 0.03);
  rig.game.gain.setTargetAtTime(p.gameSound ? 1 : 0, t, 0.03);
  rig.ui.gain.setTargetAtTime(p.uiSound ? 0.6 : 0, t, 0.03);
}
onDevicePrefs(() => {
  levels();
  const p = devicePrefs();
  if (rig && !p.gameSound && rig.crowd) stopCrowd();
  else if (rig && p.gameSound && crowdWant !== null && !rig.crowd) startCrowd();
});

/**
 * The first touch opens the sound (and a later one wakes it: a phone suspends audio in the
 * background). Called once, from the app's shell.
 */
export function armSound() {
  if (typeof document === 'undefined') return;
  const wake = () => {
    const p = devicePrefs();
    if (!p.gameSound && !p.uiSound) return;
    const r = open();
    if (r && r.ctx.state === 'suspended') void r.ctx.resume().catch(() => {});
  };
  document.addEventListener('pointerdown', wake, { capture: true, passive: true });
  document.addEventListener('keydown', wake, { capture: true, passive: true });
  // out of sight: silence, and nothing queued plays late when the app comes back
  document.addEventListener('visibilitychange', () => {
    if (!rig) return;
    if (document.visibilityState === 'hidden') void rig.ctx.suspend().catch(() => {});
    else if (devicePrefs().gameSound || devicePrefs().uiSound) void rig.ctx.resume().catch(() => {});
  });
}

/** Sound can play right now (a context is open and running, and its bus is on). */
function live(kind: Sfx): Rig | null {
  const p = devicePrefs();
  if (GAME.has(kind) ? !p.gameSound : !p.uiSound) return null;
  // (never opened from here: only a touch may open it, see armSound)
  if (!rig || rig.ctx.state !== 'running') return null;
  return rig;
}

// ------------------------------------------------------------------ the building blocks

/** A gain shaped as a strike: up in `a` seconds, down to nothing over `d`. */
function env(r: Rig, to: AudioNode, t: number, peak: number, a: number, d: number): GainNode {
  const g = r.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  g.connect(to);
  return g;
}

function tone(r: Rig, to: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, len: number) {
  const o = r.ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + len);
  o.connect(to);
  o.start(t);
  o.stop(t + len + 0.05);
  return o;
}

function hiss(r: Rig, to: AudioNode, t: number, len: number, type: BiquadFilterType, f0: number, f1: number, q = 1) {
  const src = r.ctx.createBufferSource();
  src.buffer = r.noise;
  src.loop = true;
  const f = r.ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + len);
  src.connect(f);
  f.connect(to);
  // (a different stretch of the buffer each time: two swishes in a row are not the same swish)
  src.start(t, (t * 7.31) % 1.7);
  src.stop(t + len + 0.05);
}

/** The rim's ring: a few partials that do not line up, each dying at its own pace. */
function ring(r: Rig, to: AudioNode, t: number, level: number, len: number, bend = 1) {
  const parts: [number, number, number][] = [
    [437, 1, 1],
    [1173, 0.62, 0.7],
    [1867, 0.4, 0.5],
    [2760, 0.22, 0.34],
  ];
  for (const [f, amp, life] of parts) {
    const g = env(r, to, t, level * amp, 0.002, len * life);
    tone(r, g, 'sine', f * bend, f * bend * 0.995, t, len * life + 0.02);
  }
}

// ------------------------------------------------------------------ the sounds

const play: Record<Sfx, (r: Rig, t: number, k: number) => void> = {
  // the interface: a soft tick, a switch going over, a small two-note yes
  tap: (r, t) => {
    const g = env(r, r.ui, t, 0.22, 0.002, 0.035);
    tone(r, g, 'sine', 1500, 980, t, 0.04);
  },
  toggleOn: (r, t) => {
    tone(r, env(r, r.ui, t, 0.2, 0.002, 0.04), 'sine', 900, 900, t, 0.05);
    tone(r, env(r, r.ui, t + 0.055, 0.22, 0.002, 0.06), 'sine', 1350, 1350, t + 0.055, 0.07);
  },
  toggleOff: (r, t) => {
    tone(r, env(r, r.ui, t, 0.2, 0.002, 0.04), 'sine', 1200, 1200, t, 0.05);
    tone(r, env(r, r.ui, t + 0.055, 0.2, 0.002, 0.06), 'sine', 800, 800, t + 0.055, 0.07);
  },
  // something landed (a trade, your pick, a milestone): a small two-note yes, with the game's sounds
  chime: (r, t, k) => {
    tone(r, env(r, r.game, t, 0.13 * k, 0.004, 0.22), 'triangle', 784, 784, t, 0.24);
    tone(r, env(r, r.game, t + 0.09, 0.13 * k, 0.004, 0.3), 'triangle', 1175, 1175, t + 0.09, 0.32);
  },
  // the ball on the floor: a low knock that drops in pitch, and the slap of leather on wood
  bounce: (r, t, k) => {
    const g = env(r, r.game, t, 0.5 * k, 0.003, 0.09);
    tone(r, g, 'sine', 170, 62, t, 0.1);
    hiss(r, env(r, r.game, t, 0.16 * k, 0.001, 0.03), t, 0.04, 'lowpass', 1800, 700);
  },
  // nothing but net: a rush of air that falls in pitch, and the cords snapping back a beat after
  swish: (r, t, k) => {
    hiss(r, env(r, r.game, t, 0.42 * k, 0.012, 0.24), t, 0.28, 'bandpass', 3600, 1300, 1.1);
    hiss(r, env(r, r.game, t + 0.11, 0.2 * k, 0.006, 0.12), t + 0.11, 0.14, 'bandpass', 2300, 1700, 2);
  },
  // iron: the ring, with the knock of the ball on it
  rim: (r, t, k) => {
    ring(r, r.game, t, 0.3 * k, 0.42, 0.97 + ((t * 13) % 0.07));
    hiss(r, env(r, r.game, t, 0.18 * k, 0.001, 0.025), t, 0.03, 'highpass', 2400, 2400);
    tone(r, env(r, r.game, t, 0.28 * k, 0.002, 0.07), 'sine', 190, 90, t, 0.08);
  },
  // glass: a dull knock
  board: (r, t, k) => {
    tone(r, env(r, r.game, t, 0.5 * k, 0.002, 0.11), 'sine', 150, 70, t, 0.12);
    hiss(r, env(r, r.game, t, 0.12 * k, 0.001, 0.04), t, 0.05, 'bandpass', 900, 500, 1.4);
  },
  // a dunk: the slam, the rim shaking after it, the net
  dunk: (r, t, k) => {
    tone(r, env(r, r.game, t, 0.9 * k, 0.003, 0.2), 'sine', 120, 44, t, 0.22);
    hiss(r, env(r, r.game, t, 0.3 * k, 0.002, 0.08), t, 0.1, 'lowpass', 1400, 400);
    ring(r, r.game, t + 0.02, 0.34 * k, 0.75, 0.94);
    ring(r, r.game, t + 0.16, 0.14 * k, 0.5, 0.95);
    hiss(r, env(r, r.game, t + 0.05, 0.22 * k, 0.01, 0.2), t + 0.05, 0.24, 'bandpass', 3000, 1400, 1.2);
  },
  // a hand on the ball: a slap
  block: (r, t, k) => {
    hiss(r, env(r, r.game, t, 0.5 * k, 0.001, 0.05), t, 0.06, 'bandpass', 1700, 800, 0.9);
    tone(r, env(r, r.game, t, 0.4 * k, 0.002, 0.07), 'sine', 210, 95, t, 0.08);
  },
  // a sneaker stopping on varnish
  squeak: (r, t, k) => {
    const g = env(r, r.game, t, 0.085 * k, 0.006, 0.07);
    const o = tone(r, g, 'sine', 2500 + ((t * 977) % 500), 3300, t, 0.08);
    const lfo = r.ctx.createOscillator();
    const depth = r.ctx.createGain();
    lfo.frequency.value = 86;
    depth.gain.value = 260;
    lfo.connect(depth);
    depth.connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + 0.1);
  },
  // the referee's whistle: two close tones beating, fluttered by the pea
  whistle: (r, t, k) => {
    const len = 0.34;
    const g = r.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2 * k, t + 0.012);
    g.gain.setValueAtTime(0.2 * k, t + len - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    const band = r.ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 2950;
    band.Q.value = 3;
    band.connect(g);
    g.connect(r.game);
    const flutter = r.ctx.createGain();
    flutter.gain.value = 0.7;
    flutter.connect(band);
    const lfo = r.ctx.createOscillator();
    const depth = r.ctx.createGain();
    lfo.type = 'square';
    lfo.frequency.value = 41;
    depth.gain.value = 0.3;
    lfo.connect(depth);
    depth.connect(flutter.gain);
    lfo.start(t);
    lfo.stop(t + len + 0.05);
    tone(r, flutter, 'triangle', 2860, 2900, t, len);
    tone(r, flutter, 'triangle', 3030, 3060, t, len);
    hiss(r, env(r, r.game, t, 0.05 * k, 0.01, len), t, len, 'bandpass', 3000, 3000, 2);
  },
  // the shot clock's buzzer: short and harsh
  buzzer: (r, t, k) => {
    const len = 0.62;
    const lp = r.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1900;
    const g = r.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2 * k, t + 0.015);
    g.gain.setValueAtTime(0.2 * k, t + len - 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    lp.connect(g);
    g.connect(r.game);
    tone(r, lp, 'sawtooth', 196, 196, t, len);
    tone(r, lp, 'square', 247, 247, t, len);
  },
  // the period's horn: lower, longer, the whole building's
  horn: (r, t, k) => {
    const len = 1.5;
    const lp = r.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1300;
    const g = r.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.24 * k, t + 0.03);
    g.gain.setValueAtTime(0.24 * k, t + len - 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    lp.connect(g);
    g.connect(r.game);
    for (const f of [155.5, 233, 311.5]) tone(r, lp, 'sawtooth', f, f * 0.992, t, len);
  },
  // the crowd's voice over its own murmur: see swell
  cheer: (r, t, k) => swell(r, t, 0.5 * k, 0.12, 1.5, 1500),
  roar: (r, t, k) => swell(r, t, 0.95 * k, 0.18, 3.2, 1900),
  groan: (r, t, k) => swell(r, t, 0.3 * k, 0.2, 1.2, 520),
  ooh: (r, t, k) => swell(r, t, 0.36 * k, 0.08, 0.8, 900),
};

/** A wave of crowd noise: up fast, down slow, brighter the bigger it is (a groan stays low). */
function swell(r: Rig, t: number, peak: number, attack: number, decay: number, bright: number) {
  const g = r.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak * 0.5), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  g.connect(r.game);
  // a crowd is many voices: three bands of noise that rise and fall apart from each other
  for (const [f, q, amp] of [
    [bright * 0.45, 0.8, 1],
    [bright, 0.9, 0.8],
    [bright * 2.1, 1.2, 0.45],
  ] as const) {
    const band = r.ctx.createGain();
    band.gain.value = amp;
    band.connect(g);
    hiss(r, band, t, attack + decay, 'bandpass', f * 0.85, f * 1.15, q);
  }
  // the building's own bed lifts with it for a moment
  if (r.crowd) {
    const s = r.crowd.swell.gain;
    s.cancelScheduledValues(t);
    s.setTargetAtTime(1 + peak * 1.4, t, attack / 2);
    s.setTargetAtTime(1, t + attack + decay * 0.4, decay / 2);
  }
}

/**
 * Play a sound: now, or `delay` seconds from now. `k` scales its level (a far-off bounce at 4× is
 * quieter than a dunk). Nothing plays, and nothing is queued, while sound is off or not yet opened.
 */
export function sfx(kind: Sfx, k = 1, delay = 0) {
  const r = live(kind);
  if (!r) return;
  try {
    play[kind](r, now() + Math.max(0, delay), k);
  } catch {
    // (a browser out of audio nodes: this one sound is skipped)
  }
}

// ------------------------------------------------------------------ the crowd's bed

function startCrowd() {
  const r = rig;
  if (!r || r.crowd || !devicePrefs().gameSound) return;
  const bed = r.ctx.createGain();
  bed.gain.value = 0.0001;
  const swellG = r.ctx.createGain();
  swellG.gain.value = 1;
  const toneF = r.ctx.createBiquadFilter();
  toneF.type = 'lowpass';
  toneF.frequency.value = 1400;
  toneF.connect(swellG);
  swellG.connect(bed);
  bed.connect(r.game);
  const made: AudioScheduledSourceNode[] = [];
  // the murmur: three bands of noise, each breathing at its own slow rate so it never sits still
  for (const [f, q, amp, rate] of [
    [330, 0.7, 0.9, 0.11],
    [760, 0.8, 0.7, 0.17],
    [1500, 1, 0.34, 0.07],
  ] as const) {
    const src = r.ctx.createBufferSource();
    src.buffer = r.noise;
    src.loop = true;
    const bp = r.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = q;
    const g = r.ctx.createGain();
    g.gain.value = amp;
    const lfo = r.ctx.createOscillator();
    const depth = r.ctx.createGain();
    lfo.frequency.value = rate;
    depth.gain.value = amp * 0.35;
    lfo.connect(depth);
    depth.connect(g.gain);
    src.connect(bp);
    bp.connect(g);
    g.connect(toneF);
    src.start(0, f % 1.3);
    lfo.start();
    made.push(src, lfo);
  }
  r.crowd = {
    bed,
    swell: swellG,
    tone: toneF,
    stop: () => {
      const t = r.ctx.currentTime;
      bed.gain.cancelScheduledValues(t);
      bed.gain.setTargetAtTime(0.0001, t, 0.15);
      setTimeout(() => {
        for (const n of made) {
          try {
            n.stop();
          } catch {
            // (already stopped)
          }
        }
        bed.disconnect();
      }, 900);
    },
  };
  crowdTo(crowdWant ?? 0.4);
}

function stopCrowd() {
  rig?.crowd?.stop();
  if (rig) rig.crowd = null;
}

function crowdTo(level: number) {
  const c = rig?.crowd;
  if (!c || !rig) return;
  const t = now();
  const v = Math.min(1, Math.max(0, level));
  // hushed is a room tone, on its feet a wall of noise; louder is brighter too
  c.bed.gain.setTargetAtTime(0.035 + v * v * 0.2, t, 0.7);
  c.tone.frequency.setTargetAtTime(900 + v * 1700, t, 0.7);
}

/**
 * The building's murmur under a game: `level` 0 (hushed) .. 1 (on its feet), or null when no game is
 * on (the crowd goes home). It starts once sound is open; a call before that is remembered.
 */
export function crowd(level: number | null) {
  crowdWant = level;
  if (level === null) return stopCrowd();
  if (!rig) return;
  if (!rig.crowd) startCrowd();
  else crowdTo(level);
}

/** For tests and the labs: is a context open and running? */
export const soundOpen = () => !!rig && rig.ctx.state === 'running';
