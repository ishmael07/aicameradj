// Shared domain types used across audio, sources, UI, and state.

export type DeckId = "a" | "b";

/** A loadable track from any source (Audius, Jamendo, SoundCloud, local file). */
export interface Track {
  /** Stable unique id within its source, e.g. "audius:abc123" or "local:uuid". */
  id: string;
  source: SourceId;
  title: string;
  artist: string;
  /** Artwork URL (may be a blob: URL for local files). Optional. */
  artworkUrl?: string;
  /** Duration in seconds if known ahead of decode. */
  durationSec?: number;
  /** BPM if the source provides it (Audius does). Detected later otherwise. */
  bpm?: number;
  /** Musical key if the source provides it. */
  musicalKey?: string;
  /**
   * How to obtain the raw audio bytes for Web Audio decoding.
   * - "url": fetch `streamUrl` (must be CORS-clean for decodeAudioData).
   * - "file": decode the already-held `file` blob.
   * Sources that cannot deliver decodable audio (e.g. gated SoundCloud)
   * return `playable: false` and the UI disables loading them.
   */
  playable: boolean;
  streamUrl?: string;
  file?: Blob;
  /** Human-facing reason a track is not playable, shown in the UI. */
  unplayableReason?: string;
}

export type SourceId = "audius" | "jamendo" | "soundcloud" | "local";

/** Connection / capability status for a music source provider. */
export type SourceStatus = "ready" | "needs-config" | "unavailable";

export interface SourceInfo {
  id: SourceId;
  label: string;
  status: SourceStatus;
  /** Shown when status !== "ready" to tell the user how to enable it. */
  statusDetail?: string;
  /** Whether this source supports text search (local does not). */
  canSearch: boolean;
}

/** 3-band EQ values, in normalized 0..1 where 0.5 is unity (0 dB). */
export interface EqValues {
  low: number;
  mid: number;
  high: number;
}

/** Snapshot of a deck for the UI; the engine owns the real audio state. */
export interface DeckState {
  id: DeckId;
  track: Track | null;
  loading: boolean;
  /** Decoded and ready to play. */
  ready: boolean;
  playing: boolean;
  /** Current playhead position in seconds. */
  positionSec: number;
  durationSec: number;
  /** Detected or source-provided BPM (after analysis). */
  bpm: number | null;
  /** Pitch fader, normalized 0..1 (0.5 = no change). Maps to ±8% by default. */
  pitch: number;
  /** Channel volume 0..1. */
  volume: number;
  eq: EqValues;
  /** Cue point in seconds. */
  cuePoint: number;
  /** Whether a loop is currently active. */
  looping: boolean;
}

export interface SamplerPad {
  id: number;
  label: string;
  /** Identifier for the synthesized sound generator. */
  kind: SampleKind;
  color: string;
}

export type SampleKind =
  | "airhorn"
  | "explosion"
  | "siren"
  | "scratch"
  | "kick"
  | "snare"
  | "hat"
  | "vocalHey"
  | "laser"
  | "riser"
  | "clap"
  | "vinylStop";
