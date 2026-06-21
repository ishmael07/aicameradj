import { useEffect, useRef } from "react";
import { controlRegistry } from "./ControlRegistry";
import type { ControlHandle, ControlType } from "./types";

/**
 * Register a DOM element as a gesture-controllable control. The element ref is
 * returned; attach it to the control's root. Latest getValue/setValue/onTrigger
 * are read through refs so re-renders don't churn the registry.
 */
export function useControl<T extends HTMLElement>(opts: {
  id: string;
  type: ControlType;
  axis?: "x" | "y";
  getValue?: () => number;
  setValue?: (v: number) => void;
  onTrigger?: () => void;
}): React.RefObject<T> {
  const ref = useRef<T>(null);
  const cb = useRef(opts);
  cb.current = opts;

  useEffect(() => {
    const handle: ControlHandle = {
      id: opts.id,
      type: opts.type,
      axis: opts.axis,
      getBounds: () => ref.current?.getBoundingClientRect() ?? null,
      getValue: () => cb.current.getValue?.() ?? 0,
      setValue: (v) => cb.current.setValue?.(v),
      onTrigger: () => cb.current.onTrigger?.(),
    };
    return controlRegistry.register(handle);
    // Re-register only if identity/type/axis change.
  }, [opts.id, opts.type, opts.axis]);

  return ref;
}
