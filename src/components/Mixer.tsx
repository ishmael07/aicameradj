import { useEffect, useRef } from "react";
import { Fader } from "./Fader";
import { SamplerPads } from "./SamplerPads";
import { useStore } from "../store";

/**
 * Center mixer column: master level meter, crossfader, and the sampler.
 * Sits between the two decks.
 */
export function Mixer(): JSX.Element {
  const crossfade = useStore((s) => s.crossfade);
  const setCrossfade = useStore((s) => s.setCrossfade);
  const meterRef = useRef<HTMLCanvasElement>(null);

  // Master VU meter — driven by rAF reading store.masterLevel imperatively.
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
      const segs = 24;
      const lit = Math.round(level * segs);
      // Canvas 2D doesn't resolve CSS custom properties, so use literal hex
      // values that match the --good / --warn / --bad design tokens.
      for (let i = 0; i < segs; i++) {
        const y = h - (i + 1) * (h / segs) + 1;
        const on = i < lit;
        let color = "#06d6a0"; // --good
        if (i > segs * 0.85) color = "#ff5d73"; // --bad
        else if (i > segs * 0.65) color = "#ffd166"; // --warn
        ctx.fillStyle = on ? color : "rgba(255,255,255,0.06)";
        ctx.fillRect(2, y, w - 4, h / segs - 2);
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="glass"
      style={{
        width: 220,
        flexShrink: 0,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 18,
      }}
    >
      <div style={{ fontSize: 11, letterSpacing: 2, color: "var(--text-dim)", fontWeight: 700 }}>MASTER</div>

      {/* VU meters L/R (single mono level mirrored for looks) */}
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <canvas ref={meterRef} width={20} height={120} style={{ borderRadius: 4 }} />
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
          <div style={{ fontSize: 9, color: "var(--text-faint)" }}>A ◄ ► B</div>
          <Fader id="crossfader" value={crossfade} onChange={setCrossfade} axis="x" length={150} color="var(--accent)" />
          <div style={{ fontSize: 9, color: "var(--text-faint)" }}>CROSSFADER</div>
        </div>
      </div>

      <div style={{ width: "100%", height: 1, background: "var(--glass-border)" }} />

      <SamplerPads />
    </div>
  );
}
