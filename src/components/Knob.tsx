import { useEffect, useRef, useState } from "react";
import { useControl } from "../control/useControl";

interface KnobProps {
  id: string;
  label: string;
  value: number; // 0..1
  onChange: (v: number) => void;
  /** Display color of the active arc. */
  color?: string;
  size?: number;
  /** Snap-to-center marker (e.g. EQ unity at 0.5). */
  detent?: boolean;
}

/**
 * Circular knob. Drag vertically with the mouse (or pinch-grab with a hand) to
 * change value. Renders an arc that fills with the value.
 */
export function Knob({
  id,
  label,
  value,
  onChange,
  color = "var(--accent)",
  size = 56,
  detent = false,
}: KnobProps): JSX.Element {
  const ref = useControl<HTMLDivElement>({
    id,
    type: "knob",
    getValue: () => value,
    setValue: onChange,
  });
  const dragging = useRef(false);
  const startY = useRef(0);
  const startVal = useRef(0);
  const [active, setActive] = useState(false);

  useEffect(() => {
    function onMove(e: PointerEvent): void {
      if (!dragging.current) return;
      const dy = startY.current - e.clientY;
      const v = Math.max(0, Math.min(1, startVal.current + dy / 180));
      onChange(v);
    }
    function onUp(): void {
      dragging.current = false;
      setActive(false);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onChange]);

  // Arc geometry: -135deg..+135deg sweep.
  const angle = -135 + value * 270;
  const r = size / 2 - 5;
  const cx = size / 2;
  const cy = size / 2;
  const startA = (-135 - 90) * (Math.PI / 180);
  const endA = (angle - 90) * (Math.PI / 180);
  // The swept angle is value*270°; the SVG large-arc-flag is set only when it
  // exceeds 180° (value > 2/3), else short arcs render the long way around.
  const large = value * 270 > 180 ? 1 : 0;
  const x1 = cx + r * Math.cos(startA);
  const y1 = cy + r * Math.sin(startA);
  const x2 = cx + r * Math.cos(endA);
  const y2 = cy + r * Math.sin(endA);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div
        ref={ref}
        onPointerDown={(e) => {
          dragging.current = true;
          startY.current = e.clientY;
          startVal.current = value;
          setActive(true);
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onDoubleClick={() => detent && onChange(0.5)}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          position: "relative",
          cursor: "ns-resize",
          touchAction: "none",
        }}
        className={active ? "control-grab" : undefined}
      >
        <svg width={size} height={size} style={{ display: "block" }}>
          <circle cx={cx} cy={cy} r={r} fill="rgba(255,255,255,0.04)" stroke="rgba(255,255,255,0.12)" strokeWidth={2} />
          {value > 0.001 && (
            <path
              d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
              fill="none"
              stroke={color}
              strokeWidth={3}
              strokeLinecap="round"
            />
          )}
          {/* pointer indicator */}
          <line
            x1={cx}
            y1={cy}
            x2={cx + (r - 6) * Math.cos(endA)}
            y2={cy + (r - 6) * Math.sin(endA)}
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
          />
          {detent && (
            <line x1={cx} y1={cy - r} x2={cx} y2={cy - r + 4} stroke="rgba(255,255,255,0.4)" strokeWidth={2} />
          )}
        </svg>
      </div>
      <span style={{ fontSize: 10, letterSpacing: 0.5, color: "var(--text-dim)", textTransform: "uppercase" }}>
        {label}
      </span>
    </div>
  );
}
