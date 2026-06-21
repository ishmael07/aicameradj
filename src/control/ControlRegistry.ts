import type { ControlHandle } from "./types";

/**
 * Central registry of interactive controls. Components register on mount and
 * unregister on unmount; the GestureController hit-tests against the live set.
 */
export class ControlRegistry {
  private controls = new Map<string, ControlHandle>();

  register(handle: ControlHandle): () => void {
    this.controls.set(handle.id, handle);
    return () => {
      this.controls.delete(handle.id);
    };
  }

  get(id: string): ControlHandle | undefined {
    return this.controls.get(id);
  }

  all(): ControlHandle[] {
    return [...this.controls.values()];
  }

  /**
   * Find the control whose bounds contain the point (viewport pixels).
   * Buttons/knobs use rect containment; faders get a padded hit area so a
   * shaky cursor can still grab a thin track.
   */
  hitTest(px: number, py: number): ControlHandle | null {
    let best: ControlHandle | null = null;
    let bestArea = Infinity;
    for (const c of this.controls.values()) {
      const r = c.getBounds();
      if (!r) continue;
      const pad = c.type === "fader" ? 24 : 0;
      if (
        px >= r.left - pad &&
        px <= r.right + pad &&
        py >= r.top - pad &&
        py <= r.bottom + pad
      ) {
        const area = r.width * r.height;
        // Prefer the smallest control under the cursor (most specific).
        if (area < bestArea) {
          best = c;
          bestArea = area;
        }
      }
    }
    return best;
  }
}

/** Singleton registry shared across the app. */
export const controlRegistry = new ControlRegistry();
