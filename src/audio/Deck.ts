import {
  EQ_HIGH_FREQ,
  EQ_KILL_DB,
  EQ_LOW_FREQ,
  EQ_MAX_BOOST_DB,
  EQ_MID_FREQ,
  EQ_MID_Q,
  PITCH_RANGE,
  SCRATCH_SMOOTH,
  SMOOTH,
} from "./constants";
import type { EqValues } from "../types";

/**
 * A single DJ deck built on AudioBufferSourceNode.
 *
 * Design notes:
 * - The decoded AudioBuffer is reused; a fresh ABSN is created on every
 *   play/cue/scratch because start() is one-shot.
 * - We track playback position ourselves from AudioContext.currentTime since
 *   ABSN has no position property.
 * - Signal chain: ABSN -> low -> mid -> high -> trimGain -> output(GainNode).
 *   The crossfader/channel volume live downstream in the mixer, which connects
 *   to `output`.
 */
export class Deck {
  readonly ctx: AudioContext;
  /** Final per-deck node the mixer connects to its channel strip. */
  readonly output: GainNode;

  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;

  private readonly low: BiquadFilterNode;
  private readonly mid: BiquadFilterNode;
  private readonly high: BiquadFilterNode;
  private readonly trim: GainNode;

  private _playing = false;
  /** Buffer offset (seconds) where the current source started. */
  private startOffset = 0;
  /** ctx.currentTime when the current source started. */
  private startedAt = 0;
  /** Position captured when paused. */
  private pausedAt = 0;

  private _pitch = 0.5; // normalized 0..1, 0.5 = no change
  private _scratchRate: number | null = null; // when scratching, overrides pitch
  private _cuePoint = 0;
  private _looping = false;
  private loopStartSec = 0;
  private loopEndSec = 0;

  /** Called when natural end-of-track is reached. */
  onEnded: (() => void) | null = null;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;
    this.low = ctx.createBiquadFilter();
    this.low.type = "lowshelf";
    this.low.frequency.value = EQ_LOW_FREQ;

    this.mid = ctx.createBiquadFilter();
    this.mid.type = "peaking";
    this.mid.frequency.value = EQ_MID_FREQ;
    this.mid.Q.value = EQ_MID_Q;

    this.high = ctx.createBiquadFilter();
    this.high.type = "highshelf";
    this.high.frequency.value = EQ_HIGH_FREQ;

    this.trim = ctx.createGain();
    this.output = ctx.createGain();

    this.low.connect(this.mid);
    this.mid.connect(this.high);
    this.high.connect(this.trim);
    this.trim.connect(this.output);
  }

  get hasTrack(): boolean {
    return this.buffer !== null;
  }

  get playing(): boolean {
    return this._playing;
  }

  get durationSec(): number {
    return this.buffer?.duration ?? 0;
  }

  get cuePoint(): number {
    return this._cuePoint;
  }

  get looping(): boolean {
    return this._looping;
  }

  /** Load a decoded buffer into the deck, resetting transport state. */
  load(buffer: AudioBuffer): void {
    this.stopSource();
    this.buffer = buffer;
    this._playing = false;
    this.startOffset = 0;
    this.pausedAt = 0;
    this._cuePoint = 0;
    this._looping = false;
    this._scratchRate = null;
  }

  /** Current playhead position in seconds (clamped to track length). */
  get positionSec(): number {
    if (!this.buffer) return 0;
    if (!this._playing) return this.clampPos(this.pausedAt);
    const raw = this.startOffset + (this.ctx.currentTime - this.startedAt) * this.currentRate();
    // While looping, the native source wraps between loopStart/loopEnd, so fold
    // the reported playhead back into the loop window instead of running past it.
    if (this._looping && this.loopEndSec > this.loopStartSec && raw > this.loopEndSec) {
      const len = this.loopEndSec - this.loopStartSec;
      return this.loopStartSec + ((raw - this.loopStartSec) % len);
    }
    return this.clampPos(raw);
  }

  private clampPos(p: number): number {
    if (!this.buffer) return 0;
    return Math.max(0, Math.min(p, this.buffer.duration));
  }

  /** playbackRate currently applied (scratch overrides pitch fader). */
  private currentRate(): number {
    if (this._scratchRate !== null) return this._scratchRate;
    return this.pitchToRate(this._pitch);
  }

  private pitchToRate(pitch: number): number {
    // 0..1 -> (1 - RANGE)..(1 + RANGE)
    return 1 + (pitch - 0.5) * 2 * PITCH_RANGE;
  }

  // ---- transport -------------------------------------------------------

  play(): void {
    if (!this.buffer || this._playing) return;
    this.startFrom(this.pausedAt);
  }

  pause(): void {
    if (!this._playing) return;
    this.pausedAt = this.positionSec;
    this.stopSource();
    this._playing = false;
  }

  togglePlay(): void {
    if (this._playing) this.pause();
    else this.play();
  }

  /** Jump to a position (seconds) and continue current play state. */
  seek(posSec: number): void {
    const wasPlaying = this._playing;
    this.pausedAt = this.clampPos(posSec);
    if (wasPlaying) {
      this.stopSource();
      this.startFrom(this.pausedAt);
    }
  }

  /** Set the cue point at the current position. */
  setCue(): void {
    this._cuePoint = this.positionSec;
  }

  /**
   * Vinyl-style cue: if playing, jump to cue and pause; if paused at cue,
   * (re)start playback from cue. This mirrors common DJ controller behavior.
   */
  cue(): void {
    if (this._playing) {
      this.seek(this._cuePoint);
      this.pause();
    } else {
      this.seek(this._cuePoint);
      this.play();
    }
  }

  private startFrom(offset: number): void {
    if (!this.buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = this.currentRate();
    if (this._looping) {
      src.loop = true;
      src.loopStart = this.loopStartSec;
      src.loopEnd = this.loopEndSec;
    }
    src.connect(this.low);
    src.onended = () => {
      // Only treat as natural end if this is still the active source and we
      // weren't explicitly stopped (stopSource nulls onended first).
      if (this.source === src && !this._looping) {
        this._playing = false;
        this.pausedAt = this.buffer ? this.buffer.duration : 0;
        this.onEnded?.();
      }
    };
    src.start(0, offset);
    this.source = src;
    this.startOffset = offset;
    this.startedAt = this.ctx.currentTime;
    this._playing = true;
  }

  private stopSource(): void {
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {
        // already stopped
      }
      this.source.disconnect();
      this.source = null;
    }
  }

  // ---- pitch / scratch -------------------------------------------------

  setPitch(pitch: number): void {
    this._pitch = Math.max(0, Math.min(1, pitch));
    if (this._scratchRate === null && this.source) {
      this.applyRate(this.pitchToRate(this._pitch), SMOOTH);
    }
  }

  get pitch(): number {
    return this._pitch;
  }

  /**
   * Begin a scratch/jog: directly set playbackRate (may be negative for
   * reverse). Position bookkeeping is re-anchored so positionSec stays correct.
   */
  setScratchRate(rate: number): void {
    if (!this.source) return;
    // Re-anchor position math at the new rate.
    this.startOffset = this.positionSec;
    this.startedAt = this.ctx.currentTime;
    this._scratchRate = rate;
    this.applyRate(rate, SCRATCH_SMOOTH);
  }

  /** End scratching and return to the pitch-fader rate. */
  endScratch(): void {
    if (this._scratchRate === null) return;
    this.startOffset = this.positionSec;
    this.startedAt = this.ctx.currentTime;
    this._scratchRate = null;
    if (this.source) this.applyRate(this.pitchToRate(this._pitch), SCRATCH_SMOOTH);
  }

  private applyRate(rate: number, smooth: number): void {
    if (!this.source) return;
    const p = this.source.playbackRate;
    const t = this.ctx.currentTime;
    p.cancelScheduledValues(t);
    p.setTargetAtTime(rate, t, smooth);
  }

  // ---- looping ---------------------------------------------------------

  setLoop(startSec: number, endSec: number): void {
    if (!this.buffer || endSec <= startSec) return;
    this.loopStartSec = Math.max(0, startSec);
    this.loopEndSec = Math.min(this.buffer.duration, endSec);
    this._looping = true;
    if (this.source) {
      this.source.loop = true;
      this.source.loopStart = this.loopStartSec;
      this.source.loopEnd = this.loopEndSec;
    }
  }

  clearLoop(): void {
    this._looping = false;
    if (this.source) this.source.loop = false;
  }

  // ---- EQ / trim -------------------------------------------------------

  setEq(eq: EqValues): void {
    this.applyBand(this.low, eq.low);
    this.applyBand(this.mid, eq.mid);
    this.applyBand(this.high, eq.high);
  }

  private applyBand(node: BiquadFilterNode, value: number): void {
    // 0..1 -> dB. 0.5 = 0 dB, 1 = +MAX_BOOST, 0 = KILL.
    const v = Math.max(0, Math.min(1, value));
    let db: number;
    if (v >= 0.5) {
      db = ((v - 0.5) / 0.5) * EQ_MAX_BOOST_DB;
    } else {
      // Steeper toward kill as the knob bottoms out.
      db = ((0.5 - v) / 0.5) * EQ_KILL_DB;
    }
    const t = this.ctx.currentTime;
    node.gain.cancelScheduledValues(t);
    node.gain.setTargetAtTime(db, t, SMOOTH);
  }

  setTrim(gain: number): void {
    const t = this.ctx.currentTime;
    this.trim.gain.cancelScheduledValues(t);
    this.trim.gain.setTargetAtTime(Math.max(0, gain), t, SMOOTH);
  }

  dispose(): void {
    this.stopSource();
    this.low.disconnect();
    this.mid.disconnect();
    this.high.disconnect();
    this.trim.disconnect();
    this.output.disconnect();
    this.buffer = null;
  }
}
