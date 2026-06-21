import { Deck } from "./Deck";
import { triggerSample } from "./sampler";
import { SMOOTH } from "./constants";
import type { DeckId, SampleKind } from "../types";

/**
 * Top-level audio graph:
 *
 *   deckA.output -> chanA(gain) -> xfadeA(gain) ┐
 *                                                ├-> master(gain) -> analyser -> destination
 *   deckB.output -> chanB(gain) -> xfadeB(gain) ┘
 *   sampler one-shots ----------------------------> master
 *
 * Channel gain = per-deck volume fader. Crossfader gains use an equal-power
 * cosine curve. The AudioContext is created lazily and resumed on first user
 * gesture (autoplay policy).
 */
export class AudioEngine {
  readonly ctx: AudioContext;
  readonly decks: Record<DeckId, Deck>;

  private readonly chan: Record<DeckId, GainNode>;
  private readonly xfade: Record<DeckId, GainNode>;
  private readonly master: GainNode;
  readonly analyser: AnalyserNode;

  private _crossfade = 0.5;

  constructor() {
    this.ctx = new AudioContext();

    this.master = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.master.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    const makeChain = (): { chan: GainNode; xfade: GainNode } => {
      const chan = this.ctx.createGain();
      const xfade = this.ctx.createGain();
      chan.connect(xfade);
      xfade.connect(this.master);
      return { chan, xfade };
    };

    const a = makeChain();
    const b = makeChain();
    this.chan = { a: a.chan, b: b.chan };
    this.xfade = { a: a.xfade, b: b.xfade };

    this.decks = {
      a: new Deck(this.ctx),
      b: new Deck(this.ctx),
    };
    this.decks.a.output.connect(this.chan.a);
    this.decks.b.output.connect(this.chan.b);

    this.applyCrossfade(this._crossfade);
  }

  /** Must be called from a user gesture before audio will play. */
  async resume(): Promise<void> {
    if (this.ctx.state !== "running") {
      await this.ctx.resume();
    }
  }

  setVolume(deck: DeckId, vol: number): void {
    const g = this.chan[deck].gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(Math.max(0, Math.min(1, vol)), t, SMOOTH);
  }

  setCrossfade(value: number): void {
    this._crossfade = Math.max(0, Math.min(1, value));
    this.applyCrossfade(this._crossfade);
  }

  get crossfade(): number {
    return this._crossfade;
  }

  private applyCrossfade(t: number): void {
    // Equal-power: t=0 => full A, t=1 => full B.
    const gainA = Math.cos(t * 0.5 * Math.PI);
    const gainB = Math.cos((1 - t) * 0.5 * Math.PI);
    const now = this.ctx.currentTime;
    this.xfade.a.gain.cancelScheduledValues(now);
    this.xfade.b.gain.cancelScheduledValues(now);
    this.xfade.a.gain.setTargetAtTime(gainA, now, SMOOTH);
    this.xfade.b.gain.setTargetAtTime(gainB, now, SMOOTH);
  }

  setMasterGain(gain: number): void {
    const g = this.master.gain;
    const t = this.ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(Math.max(0, gain), t, SMOOTH);
  }

  triggerSample(kind: SampleKind): void {
    triggerSample(this.ctx, kind, this.master);
  }

  /** Peak level (0..1) for VU metering, from the analyser. */
  getMasterLevel(): number {
    const buf = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(buf[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    return peak;
  }

  dispose(): void {
    this.decks.a.dispose();
    this.decks.b.dispose();
    this.master.disconnect();
    this.analyser.disconnect();
    void this.ctx.close();
  }
}
