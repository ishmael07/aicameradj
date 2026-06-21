import type { ControlRegistry } from "./ControlRegistry";
import type { ControlHandle, CursorState } from "./types";
import type { HandFrame, VisionFrame } from "../vision/types";

interface HandGrab {
  controlId: string;
  /** For knobs: value + reference position at grab time (vertical drag to turn). */
  startValue: number;
  startX: number;
  startY: number;
}

/**
 * Translates per-frame hand data into control interactions.
 *
 * Interaction model (works alongside mouse — this only adds gesture control):
 *  - The index fingertip is the cursor.
 *  - PINCH to grab. While grabbed:
 *      * knob  -> vertical drag changes value (up = increase)
 *      * fader -> position along its axis sets value directly (absolute)
 *  - Release pinch to let go.
 *  - A quick pinch over a BUTTON triggers it once (on pinch-down).
 */
export class GestureController {
  private grabs: Array<HandGrab | null> = [null, null];
  private wasPinching: boolean[] = [false, false];
  private cursors: CursorState[] = [];

  /** Sensitivity for knob vertical drag: full travel over this fraction of
   *  screen height. */
  private static readonly KNOB_TRAVEL = 0.4;

  constructor(private readonly registry: ControlRegistry) {}

  /** Latest cursor states for overlay rendering. */
  getCursors(): CursorState[] {
    return this.cursors;
  }

  /** Process one vision frame. `viewport` = window inner size in px. */
  process(frame: VisionFrame, viewport: { width: number; height: number }): void {
    const cursors: CursorState[] = [];
    const count = Math.min(frame.hands.length, 2);
    for (let i = 0; i < count; i++) {
      cursors.push(this.processHand(i, frame.hands[i], viewport));
    }
    // Release grabs for hands that vanished this frame.
    for (let i = count; i < 2; i++) {
      this.releaseGrab(i);
      this.wasPinching[i] = false;
    }
    this.cursors = cursors;
  }

  private processHand(
    i: number,
    hand: HandFrame,
    viewport: { width: number; height: number },
  ): CursorState {
    const px = hand.cursor.x * viewport.width;
    const py = hand.cursor.y * viewport.height;
    const pinching = hand.pinching;
    const justPinched = pinching && !this.wasPinching[i];
    const justReleased = !pinching && this.wasPinching[i];

    let hoverId: string | null = null;
    const grab = this.grabs[i];

    if (grab) {
      // Currently manipulating a control.
      const control = this.registry.get(grab.controlId);
      if (!control || !pinching) {
        this.releaseGrab(i);
      } else {
        this.applyGrab(control, grab, hand, viewport);
        hoverId = control.id;
      }
    } else {
      const hit = this.registry.hitTest(px, py);
      hoverId = hit?.id ?? null;
      if (hit && justPinched) {
        if (hit.type === "button") {
          hit.onTrigger?.();
        } else {
          this.grabs[i] = {
            controlId: hit.id,
            startValue: hit.getValue?.() ?? 0,
            startX: px,
            startY: py,
          };
          hoverId = hit.id;
        }
      }
    }

    if (justReleased) this.releaseGrab(i);
    this.wasPinching[i] = pinching;

    return {
      handedness: hand.handedness,
      x: hand.cursor.x,
      y: hand.cursor.y,
      pinching,
      pinch: hand.pinch,
      hoverId,
      grabbedId: this.grabs[i]?.controlId ?? null,
    };
  }

  private applyGrab(
    control: ControlHandle,
    grab: HandGrab,
    hand: HandFrame,
    viewport: { width: number; height: number },
  ): void {
    if (!control.setValue) return;
    const px = hand.cursor.x * viewport.width;
    const py = hand.cursor.y * viewport.height;

    if (control.type === "knob") {
      // Vertical drag: up increases.
      const dyFrac = (grab.startY - py) / (viewport.height * GestureController.KNOB_TRAVEL);
      const v = clamp01(grab.startValue + dyFrac);
      control.setValue(v);
    } else if (control.type === "fader") {
      const r = control.getBounds();
      if (!r) return;
      if (control.axis === "x") {
        const v = clamp01((px - r.left) / Math.max(1, r.width));
        control.setValue(v);
      } else {
        // Vertical fader: top = 1, bottom = 0.
        const v = clamp01(1 - (py - r.top) / Math.max(1, r.height));
        control.setValue(v);
      }
    }
  }

  private releaseGrab(i: number): void {
    this.grabs[i] = null;
  }
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
