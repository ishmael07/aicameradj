import { useEffect, useRef } from "react";
import { Fader } from "./Fader";
import { SamplerPads } from "./SamplerPads";
import { useStore } from "../store";

/**
 * Center console: stereo master meter, the crossfader, and the 8-pad sampler —
 * arranged as a compact floating bar that sits low-center so the performer
 * stays visible above it.
 */
export function Mixer(): JSX.Element {
  const crossfade = useStore((s) => s.crossfade);
  const setCrossfade = useStore((s) => s.setCrossfade);
  const meterRef = useRef<HTMLCanvasElement>(null);

  // Master level meter, driven by rAF reading store.masterLevel imperatively.
  useEffect(() => {
    let raf = 0;
    const draw = (): void => {
      raf = requestAnimationFrame(draw);
      const canvas = meterRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const level = useStore.getState().masterLevel;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      const segs = 18;
      const lit = Math.round(level * segs);
      const cols = 2;
      const colW = (w - (cols - 1) * 3) / cols;
      for (let cx = 0; cx < cols; cx++) {
        for (let i = 0; i < segs; i++) {
          const y = h - (i + 1) * (h / segs) + 1;
          const on = i < lit;
          let color = "#2ee6a6"; // --good
          if (i > segs * 0.85) color = "#ff6b6b"; // --bad
          else if (i > segs * 0.65) color = "#ffce5c"; // --warn
          ctx.fillStyle = on ? color : "rgba(255,255,255,0.06)";
          ctx.fillRect(cx * (colW + 3), y, colW, h / segs - 2);
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="glass"
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 22,
        padding: "16px 22px",
        animation: "aicdj-rise 0.45s ease both",
      }}
    >
      {/* Master + crossfader */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
          <canvas ref={meterRef} width={26} height={64} style={{ borderRadius: 4 }} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <span className="label">Master</span>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-dim)" }}>
              <span style={{ color: "var(--accent-a)", fontWeight: 700 }}>A</span>
              <Fader id="crossfader" value={crossfade} onChange={setCrossfade} axis="x" length={130} color="var(--accent)" />
              <span style={{ color: "var(--accent-b)", fontWeight: 700 }}>B</span>
            </div>
            <span className="label">Crossfader</span>
          </div>
        </div>
      </div>

      <div style={{ width: 1, background: "var(--glass-border)" }} />

      <SamplerPads />
    </div>
  );
}
