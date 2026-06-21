import type { SampleKind } from "../types";

/**
 * Procedurally synthesized one-shot samples. No binary assets to ship.
 * Each generator builds its sound from oscillators/noise into a destination
 * node and fires immediately, riding over the running mix.
 */

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function env(
  _ctx: BaseAudioContext,
  param: AudioParam,
  t0: number,
  peak: number,
  attack: number,
  decay: number,
): void {
  param.setValueAtTime(0.0001, t0);
  param.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + attack);
  param.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
}

type Gen = (ctx: AudioContext, dest: AudioNode, t0: number) => void;

const airhorn: Gen = (ctx, dest, t0) => {
  // Stacked detuned saws with a rising pitch, classic reggae/EDM horn.
  const g = ctx.createGain();
  g.connect(dest);
  env(ctx, g.gain, t0, 0.5, 0.02, 1.1);
  const freqs = [330, 333, 440, 660];
  freqs.forEach((f, i) => {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(f * 0.98, t0);
    o.frequency.linearRampToValueAtTime(f, t0 + 0.15);
    const og = ctx.createGain();
    og.gain.value = i === 0 ? 0.4 : 0.25;
    o.connect(og).connect(g);
    o.start(t0);
    o.stop(t0 + 1.2);
  });
};

const explosion: Gen = (ctx, dest, t0) => {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 1.5);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(1800, t0);
  lp.frequency.exponentialRampToValueAtTime(80, t0 + 1.2);
  const g = ctx.createGain();
  env(ctx, g.gain, t0, 0.9, 0.005, 1.3);
  src.connect(lp).connect(g).connect(dest);
  src.start(t0);
  src.stop(t0 + 1.5);
};

const siren: Gen = (ctx, dest, t0) => {
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 4;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 300;
  lfo.connect(lfoGain).connect(o.frequency);
  o.frequency.value = 700;
  const g = ctx.createGain();
  env(ctx, g.gain, t0, 0.4, 0.03, 1.4);
  o.connect(g).connect(dest);
  o.start(t0);
  lfo.start(t0);
  o.stop(t0 + 1.5);
  lfo.stop(t0 + 1.5);
};

const scratch: Gen = (ctx, dest, t0) => {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 0.4);
  src.playbackRate.setValueAtTime(0.6, t0);
  src.playbackRate.linearRampToValueAtTime(2.2, t0 + 0.12);
  src.playbackRate.linearRampToValueAtTime(0.5, t0 + 0.25);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1200;
  bp.Q.value = 1.5;
  const g = ctx.createGain();
  env(ctx, g.gain, t0, 0.7, 0.005, 0.3);
  src.connect(bp).connect(g).connect(dest);
  src.start(t0);
  src.stop(t0 + 0.5);
};

const kick: Gen = (ctx, dest, t0) => {
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(150, t0);
  o.frequency.exponentialRampToValueAtTime(45, t0 + 0.12);
  const g = ctx.createGain();
  env(ctx, g.gain, t0, 1.0, 0.002, 0.32);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + 0.4);
};

const snare: Gen = (ctx, dest, t0) => {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 0.3);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1500;
  const ng = ctx.createGain();
  env(ctx, ng.gain, t0, 0.7, 0.002, 0.18);
  src.connect(hp).connect(ng).connect(dest);
  const o = ctx.createOscillator();
  o.frequency.value = 180;
  const og = ctx.createGain();
  env(ctx, og.gain, t0, 0.5, 0.002, 0.12);
  o.connect(og).connect(dest);
  src.start(t0);
  src.stop(t0 + 0.3);
  o.start(t0);
  o.stop(t0 + 0.2);
};

const hat: Gen = (ctx, dest, t0) => {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 0.12);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const g = ctx.createGain();
  env(ctx, g.gain, t0, 0.4, 0.001, 0.06);
  src.connect(hp).connect(g).connect(dest);
  src.start(t0);
  src.stop(t0 + 0.12);
};

const vocalHey: Gen = (ctx, dest, t0) => {
  // Formant-ish "hey" using two bandpassed saws.
  const g = ctx.createGain();
  env(ctx, g.gain, t0, 0.6, 0.02, 0.35);
  g.connect(dest);
  [[700, 1.2], [1100, 1.0]].forEach(([f]) => {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(180, t0);
    o.frequency.linearRampToValueAtTime(240, t0 + 0.2);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = f;
    bp.Q.value = 6;
    o.connect(bp).connect(g);
    o.start(t0);
    o.stop(t0 + 0.45);
  });
};

const laser: Gen = (ctx, dest, t0) => {
  const o = ctx.createOscillator();
  o.type = "square";
  o.frequency.setValueAtTime(1800, t0);
  o.frequency.exponentialRampToValueAtTime(120, t0 + 0.4);
  const g = ctx.createGain();
  env(ctx, g.gain, t0, 0.4, 0.002, 0.45);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + 0.5);
};

const riser: Gen = (ctx, dest, t0) => {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 2.0);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(400, t0);
  bp.frequency.exponentialRampToValueAtTime(8000, t0 + 1.8);
  bp.Q.value = 2;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.6, t0 + 1.8);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.0);
  src.connect(bp).connect(g).connect(dest);
  src.start(t0);
  src.stop(t0 + 2.0);
};

const clap: Gen = (ctx, dest, t0) => {
  // Three quick noise bursts.
  for (let i = 0; i < 3; i++) {
    const tt = t0 + i * 0.012;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 0.12);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 1500;
    bp.Q.value = 1;
    const g = ctx.createGain();
    env(ctx, g.gain, tt, 0.5, 0.001, 0.09);
    src.connect(bp).connect(g).connect(dest);
    src.start(tt);
    src.stop(tt + 0.12);
  }
};

const vinylStop: Gen = (ctx, dest, t0) => {
  const o = ctx.createOscillator();
  o.type = "sawtooth";
  o.frequency.setValueAtTime(220, t0);
  o.frequency.exponentialRampToValueAtTime(30, t0 + 0.5);
  const g = ctx.createGain();
  env(ctx, g.gain, t0, 0.5, 0.005, 0.55);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + 0.6);
};

const GENERATORS: Record<SampleKind, Gen> = {
  airhorn,
  explosion,
  siren,
  scratch,
  kick,
  snare,
  hat,
  vocalHey,
  laser,
  riser,
  clap,
  vinylStop,
};

/** Fire a one-shot synthesized sample into `dest` immediately. */
export function triggerSample(
  ctx: AudioContext,
  kind: SampleKind,
  dest: AudioNode,
): void {
  const gen = GENERATORS[kind];
  if (gen) gen(ctx, dest, ctx.currentTime);
}
