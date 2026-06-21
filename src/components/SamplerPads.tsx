import { useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { useControl } from "../control/useControl";
import type { SamplerPad, SampleKind } from "../types";

/**
 * One-shot sampler. Reads the 8 pads from the store and renders a responsive
 * 4x2 grid of glass tiles tinted with each pad's color. Clicking a pad,
 * pinching a hand over it, or pressing its number key (1-8) fires
 * store.triggerPad(kind) and plays a punchy flash/ripple animation.
 */
export function SamplerPads(): JSX.Element {
  const pads = useStore((s) => s.pads);
  const triggerPad = useStore((s) => s.triggerPad);

  // Per-pad flash counters. Bumping a pad's counter re-keys its overlay element
  // so the CSS animation always restarts, even on rapid repeated triggers.
  const [flashes, setFlashes] = useState<number[]>(() => pads.map(() => 0));

  // Keep flash array length in sync with pad count without losing counters.
  const padCount = pads.length;
  useEffect(() => {
    setFlashes((prev) =>
      prev.length === padCount
        ? prev
        : Array.from({ length: padCount }, (_, i) => prev[i] ?? 0),
    );
  }, [padCount]);

  // Stable ref to the latest fire fn so the keydown listener (bound once) and
  // gesture callbacks always hit the current pads/actions. Kept current via an
  // effect (not during render) to avoid mutating refs in the render phase.
  const fireRef = useRef<(index: number) => void>(() => {});
  useEffect(() => {
    fireRef.current = (index: number): void => {
      const pad = pads[index];
      if (!pad) return;
      triggerPad(pad.kind);
      setFlashes((prev) => {
        const next = prev.slice();
        next[index] = (next[index] ?? 0) + 1;
        return next;
      });
    };
  }, [pads, triggerPad]);

  // Keyboard: keys 1-8 trigger pads 0-7. Ignore when typing in a field.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 8) return;
      e.preventDefault();
      fireRef.current(n - 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <section
      className="glass"
      style={{
        padding: 14,
        borderRadius: "var(--radius)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
        }}
      >
        <h2
          style={{
            margin: 0,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 2,
            textTransform: "uppercase",
            color: "var(--text-dim)",
          }}
        >
          Sampler
        </h2>
        <span
          style={{
            fontSize: 10,
            letterSpacing: 0.5,
            color: "var(--text-faint)",
            textTransform: "uppercase",
          }}
        >
          Keys 1&ndash;8
        </span>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gridAutoRows: "1fr",
          gap: 10,
        }}
      >
        {pads.map((pad, i) => (
          <Pad
            key={pad.id}
            pad={pad}
            index={i}
            flashKey={flashes[i] ?? 0}
            onFire={() => fireRef.current(i)}
          />
        ))}
      </div>

      <style>{KEYFRAMES}</style>
    </section>
  );
}

interface PadProps {
  pad: SamplerPad;
  index: number;
  flashKey: number;
  onFire: () => void;
}

function Pad({ pad, index, flashKey, onFire }: PadProps): JSX.Element {
  const ref = useControl<HTMLButtonElement>({
    id: `pad-${pad.id}`,
    type: "button",
    onTrigger: onFire,
  });
  const [pressed, setPressed] = useState(false);

  const color = pad.color;

  return (
    <button
      ref={ref}
      type="button"
      className="control-hover"
      aria-label={pad.label}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setPressed(true);
        onFire();
      }}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      style={{
        position: "relative",
        overflow: "hidden",
        aspectRatio: "1 / 1",
        minHeight: 64,
        border: `1px solid ${hexA(color, 0.45)}`,
        borderRadius: "var(--radius-sm)",
        background: `linear-gradient(150deg, ${hexA(color, 0.22)}, ${hexA(color, 0.06)})`,
        color: "var(--text)",
        cursor: "pointer",
        padding: 8,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        justifyContent: "space-between",
        textAlign: "left",
        backdropFilter: "blur(var(--blur))",
        WebkitBackdropFilter: "blur(var(--blur))",
        transform: pressed ? "scale(0.95)" : "scale(1)",
        boxShadow: pressed
          ? `0 0 24px ${hexA(color, 0.55)}, inset 0 0 18px ${hexA(color, 0.3)}`
          : `0 4px 14px rgba(0,0,0,0.35), inset 0 1px 0 ${hexA(color, 0.18)}`,
        transition:
          "transform 90ms cubic-bezier(.2,.9,.3,1.4), box-shadow 140ms ease, border-color 140ms ease",
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* Trigger number chip */}
      <span
        className="mono"
        style={{
          fontSize: 10,
          fontWeight: 700,
          lineHeight: 1,
          color: hexA(color, 0.95),
          background: hexA(color, 0.16),
          border: `1px solid ${hexA(color, 0.35)}`,
          borderRadius: 6,
          padding: "2px 5px",
          textShadow: `0 0 8px ${hexA(color, 0.7)}`,
        }}
      >
        {index + 1}
      </span>

      {/* Pad label */}
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: 0.3,
          lineHeight: 1.15,
          textShadow: "0 1px 2px rgba(0,0,0,0.5)",
        }}
      >
        {pad.label}
      </span>

      {/* Flash: full-tile bloom that fades out. Re-keyed per trigger. */}
      <span
        key={`flash-${flashKey}`}
        aria-hidden
        style={
          flashKey > 0
            ? {
                position: "absolute",
                inset: 0,
                borderRadius: "inherit",
                background: `radial-gradient(circle at 50% 50%, ${hexA(color, 0.85)}, ${hexA(color, 0)} 70%)`,
                pointerEvents: "none",
                animation: "padFlash 360ms ease-out forwards",
              }
            : { display: "none" }
        }
      />

      {/* Ripple: expanding ring from center. Re-keyed per trigger. */}
      <span
        key={`ripple-${flashKey}`}
        aria-hidden
        style={
          flashKey > 0
            ? {
                position: "absolute",
                left: "50%",
                top: "50%",
                width: 12,
                height: 12,
                marginLeft: -6,
                marginTop: -6,
                borderRadius: "50%",
                border: `2px solid ${hexA(color, 0.9)}`,
                pointerEvents: "none",
                animation: "padRipple 460ms cubic-bezier(.15,.6,.3,1) forwards",
              }
            : { display: "none" }
        }
      />
    </button>
  );
}

const KEYFRAMES = `
@keyframes padFlash {
  0% { opacity: 0.95; }
  100% { opacity: 0; }
}
@keyframes padRipple {
  0% { transform: scale(0.4); opacity: 0.9; }
  100% { transform: scale(11); opacity: 0; }
}
`;

/**
 * Convert a CSS color (hex like #rrggbb / #rgb, or any other token) into an
 * rgba()/color-mix() string with the given alpha. Non-hex inputs fall back to
 * color-mix so CSS custom props still tint correctly.
 */
function hexA(color: string, alpha: number): string {
  const hex = color.trim();
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) {
    const pct = Math.round(alpha * 100);
    return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
  }
  let h = m[1]!;
  if (h.length === 3) {
    h = h[0]! + h[0]! + h[1]! + h[1]! + h[2]! + h[2]!;
  }
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export type { SampleKind };
