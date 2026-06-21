// Types shared between the vision worker, the hand tracker, and the control
// layer. Kept dependency-free so the worker can import them.

/** One normalized landmark from MediaPipe (x,y in 0..1, z relative). */
export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export type Handedness = "Left" | "Right";

/** A detected hand for one frame. Landmarks are in MIRRORED display space
 *  (x already flipped to 1 - x) so the UI can hit-test directly. */
export interface HandFrame {
  handedness: Handedness;
  landmarks: Landmark[]; // 21 points
  /** Index fingertip position in display-normalized coords (0..1). */
  cursor: { x: number; y: number };
  /** Pinch strength 0..1 (1 = fully pinched). */
  pinch: number;
  /** True while a pinch is held (with hysteresis). */
  pinching: boolean;
  /** Gesture classification for this hand. */
  gesture: Gesture;
}

export type Gesture = "open" | "fist" | "point" | "pinch" | "unknown";

/** Result emitted per processed video frame. */
export interface VisionFrame {
  hands: HandFrame[];
  /** Timestamp (ms) of the source video frame. */
  timestampMs: number;
  /** Inference latency in ms, for the HUD. */
  latencyMs: number;
}

// ---- Worker message protocol ----

export type WorkerInMessage =
  | { type: "init"; modelAssetPath: string; wasmBasePath: string; numHands: number }
  | { type: "frame"; bitmap: ImageBitmap; timestampMs: number; width: number; height: number };

export type WorkerOutMessage =
  | { type: "ready" }
  | { type: "error"; message: string }
  | { type: "result"; frame: RawVisionFrame };

/** Raw worker output before display-space mirroring/gesture post-processing
 *  is applied on the main thread (kept minimal to cross the worker boundary). */
export interface RawVisionFrame {
  hands: Array<{ handedness: Handedness; landmarks: Landmark[] }>;
  timestampMs: number;
  latencyMs: number;
}
