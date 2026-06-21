// The control layer maps a hand cursor + pinch onto on-screen DJ controls.
// Components register a ControlHandle; the GestureController drives them.

export type ControlType = "knob" | "fader" | "button";

export interface ControlHandle {
  id: string;
  type: ControlType;
  /** Live bounds in viewport pixels (use a ref's getBoundingClientRect). */
  getBounds: () => DOMRect | null;

  // Knob / fader:
  getValue?: () => number; // 0..1
  setValue?: (v: number) => void; // 0..1
  /** Fader travel axis. "x" = horizontal (crossfader), "y" = vertical. */
  axis?: "x" | "y";

  // Button:
  onTrigger?: () => void;
}

/** Per-hand cursor state exposed for rendering the overlay. */
export interface CursorState {
  handedness: "Left" | "Right";
  /** Display-normalized position 0..1. */
  x: number;
  y: number;
  pinching: boolean;
  pinch: number;
  /** Control currently hovered (for highlight) or grabbed. */
  hoverId: string | null;
  grabbedId: string | null;
}
