import type { Gesture, Landmark } from "./types";

// MediaPipe hand landmark indices.
export const WRIST = 0;
export const THUMB_TIP = 4;
export const INDEX_MCP = 5;
export const INDEX_PIP = 6;
export const INDEX_TIP = 8;
export const MIDDLE_MCP = 9;
export const MIDDLE_PIP = 10;
export const MIDDLE_TIP = 12;
export const RING_PIP = 14;
export const RING_TIP = 16;
export const PINKY_PIP = 18;
export const PINKY_TIP = 20;

function dist(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Scale-invariant pinch strength in 0..1 (1 = fully pinched).
 * Normalizes thumb-index distance by hand size (wrist -> middle MCP) so it
 * works whether the hand is near or far from the camera.
 */
export function pinchStrength(lm: Landmark[]): number {
  const handSize = dist(lm[WRIST], lm[MIDDLE_MCP]) || 1e-3;
  const d = dist(lm[THUMB_TIP], lm[INDEX_TIP]) / handSize;
  // d ~0.15 when pinched, ~1.0+ when open. Map [0.15, 0.7] -> [1, 0].
  const t = (0.7 - d) / (0.7 - 0.15);
  return Math.max(0, Math.min(1, t));
}

/** Whether a finger is extended, using tip-vs-PIP distance from the wrist. */
function fingerExtended(lm: Landmark[], tip: number, pip: number): boolean {
  return dist(lm[tip], lm[WRIST]) > dist(lm[pip], lm[WRIST]) * 1.02;
}

/** Classify the overall hand gesture from landmarks. */
export function classifyGesture(lm: Landmark[], pinching: boolean): Gesture {
  if (pinching) return "pinch";
  const index = fingerExtended(lm, INDEX_TIP, INDEX_PIP);
  const middle = fingerExtended(lm, MIDDLE_TIP, MIDDLE_PIP);
  const ring = fingerExtended(lm, RING_TIP, RING_PIP);
  const pinky = fingerExtended(lm, PINKY_TIP, PINKY_PIP);
  const extendedCount = [index, middle, ring, pinky].filter(Boolean).length;

  if (extendedCount === 0) return "fist";
  if (index && !middle && !ring && !pinky) return "point";
  if (extendedCount >= 3) return "open";
  return "unknown";
}

/**
 * Pinch hysteresis: separate enter/exit thresholds + small debounce avoid
 * flicker that would otherwise toggle a control on/off rapidly.
 */
export class PinchLatch {
  private held = false;
  private static readonly ENTER = 0.65;
  private static readonly EXIT = 0.45;

  update(strength: number): boolean {
    if (this.held) {
      if (strength < PinchLatch.EXIT) this.held = false;
    } else {
      if (strength > PinchLatch.ENTER) this.held = true;
    }
    return this.held;
  }

  get value(): boolean {
    return this.held;
  }
}
