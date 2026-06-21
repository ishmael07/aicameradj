import { useEffect, useRef } from "react";
import { useControl } from "../control/useControl";

interface FaderProps {
  id: string;
  value: number; // 0..1
  onChange: (v: number) => void;
  axis: "x" | "y";
  length?: number;
  color?: string;
  label?: string;
}

/**
 * Linear fader. Mouse-drag along its axis or pinch-grab with a hand. For a
 * vertical fader, top = 1; for horizontal, left = 0 / right = 1.
 */
export function Fader({
  id,
  value,
  onChange,
  axis,
  length = 160,
  color = "var(--accent)",
  label,
}: FaderProps): JSX.Element {
  const ref = useControl<HTMLDivElement>({
    id,
    type: "fader",
    axis,
    getValue: () => value,
    setValue: onChange,
  });
  const dragging = useRef(false);

  useEffect(() => {
    function valueFromEvent(e: PointerEvent): number {
      const el = ref.current;
      if (!el) return value;
      const r = el.getBoundingClientRect();
      if (axis === "x") {
        return Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
      }
      return Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / Math.max(1, r.height)));
    }
    function onMove(e: PointerEvent): void {
      if (!dragging.current) return;
      onChange(valueFromEvent(e));
    }
    function onUp(): void {
      dragging.current = false;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onChange, axis, value, ref]);

  const horizontal = axis === "x";
  const trackW = horizontal ? length : 8;
  const trackH = horizontal ? 8 : length;
  // Thumb position.
  const pct = horizontal ? value : 1 - value;
  const thumbStyle: React.CSSProperties = horizontal
    ? { left: `calc(${value * 100}% - 9px)`, top: "50%", transform: "translateY(-50%)" }
    : { top: `calc(${pct * 100}% - 9px)`, left: "50%", transform: "translateX(-50%)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div
        ref={ref}
        onPointerDown={(e) => {
          dragging.current = true;
          const el = ref.current;
          if (el) {
            const r = el.getBoundingClientRect();
            const v = horizontal
              ? Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)))
              : Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / Math.max(1, r.height)));
            onChange(v);
          }
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        style={{
          position: "relative",
          width: horizontal ? trackW : 28,
          height: horizontal ? 28 : trackH,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: horizontal ? "ew-resize" : "ns-resize",
          touchAction: "none",
        }}
      >
        {/* track */}
        <div
          style={{
            position: "absolute",
            width: trackW,
            height: trackH,
            borderRadius: 6,
            background: "rgba(255,255,255,0.1)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              background: color,
              opacity: 0.5,
              ...(horizontal
                ? { left: 0, top: 0, bottom: 0, width: `${value * 100}%` }
                : { left: 0, right: 0, bottom: 0, height: `${value * 100}%` }),
            }}
          />
        </div>
        {/* thumb */}
        <div
          style={{
            position: "absolute",
            width: 18,
            height: 18,
            borderRadius: 5,
            background: "var(--text)",
            boxShadow: `0 0 12px ${color}`,
            ...thumbStyle,
          }}
        />
      </div>
      {label && (
        <span style={{ fontSize: 10, letterSpacing: 0.5, color: "var(--text-dim)", textTransform: "uppercase" }}>
          {label}
        </span>
      )}
    </div>
  );
}
