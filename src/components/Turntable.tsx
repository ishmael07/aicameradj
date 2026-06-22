import { useEffect, useRef, useState } from "react";
import type { DeckId } from "../types";
import { useStore } from "../store";
import { useControl } from "../control/useControl";

interface TurntableProps {
  deck: DeckId;
  /** Platter diameter in px (default 260). */
  size?: number;
}

// Revolutions per second at normal playback speed (stylized 33⅓ rpm vibe).
const REV_PER_SEC = 1.35;
// How fast the platter eases toward its target spin speed (per second).
const SPIN_EASE = 6;

/**
 * Spinning vinyl turntable for one deck — the visual centerpiece.
 *
 * The platter, grooves, label artwork and progress tick are drawn on a
 * <canvas> via requestAnimationFrame so the spin animation never triggers a
 * React re-render. Pointer drag around the platter scratches (angular velocity
 * -> store.scratch), and the mouse wheel nudges the deck.
 */
export function Turntable({ deck, size = 260 }: TurntableProps): JSX.Element {
  const SIZE = size;
  const track = useStore((s) => s.decks[deck].track);
  const playing = useStore((s) => s.decks[deck].playing);
  const ready = useStore((s) => s.decks[deck].ready);
  const loading = useStore((s) => s.decks[deck].loading);
  const bpm = useStore((s) => s.decks[deck].bpm);
  const scratch = useStore((s) => s.scratch);
  const nudge = useStore((s) => s.nudge);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Live values read by the animation loop without re-subscribing each frame.
  const liveRef = useRef({ playing, loading, ready });
  liveRef.current = { playing, loading, ready };

  // Position is read straight from the store inside the loop (avoids 60fps
  // React updates while keeping the progress tick perfectly in sync).
  const positionRef = useRef(0);
  const durationRef = useRef(0);
  useEffect(() => {
    // Seed initial values, then subscribe to keep the refs current.
    const st = useStore.getState().decks[deck];
    positionRef.current = st.positionSec;
    durationRef.current = st.durationSec;
    const unsubscribe = useStore.subscribe((s) => {
      positionRef.current = s.decks[deck].positionSec;
      durationRef.current = s.decks[deck].durationSec;
    });
    return unsubscribe;
  }, [deck]);

  // Artwork image, loaded off-thread and drawn into the center label.
  const artRef = useRef<HTMLImageElement | null>(null);
  useEffect(() => {
    artRef.current = null;
    const url = track?.artworkUrl;
    if (!url) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      artRef.current = img;
    };
    img.src = url;
    return () => {
      img.onload = null;
    };
  }, [track?.artworkUrl]);

  const accent = deck === "a" ? "var(--accent-a)" : "var(--accent-b)";
  const accentHex = deck === "a" ? "#4cc9f0" : "#ff5d73";
  const deckLetter = deck.toUpperCase();

  // ---- Scratch / nudge interaction state ----
  const dragging = useRef(false);
  const lastAngle = useRef(0);
  const lastTime = useRef(0);
  const [grabbed, setGrabbed] = useState(false);

  function pointerAngle(e: { clientX: number; clientY: number }): number {
    const el = wrapRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  }

  useEffect(() => {
    function onMove(e: PointerEvent): void {
      if (!dragging.current) return;
      const a = pointerAngle(e);
      const now = performance.now();
      let da = a - lastAngle.current;
      // Unwrap across the ±π seam.
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      const dt = Math.max(0.001, (now - lastTime.current) / 1000);
      // Angular velocity (rev/sec) normalized against the platter's natural
      // spin, then clamped to a sane scratch range.
      const revPerSec = da / (2 * Math.PI) / dt;
      const rate = Math.max(-3, Math.min(3, revPerSec / REV_PER_SEC));
      scratch(deck, rate);
      lastAngle.current = a;
      lastTime.current = now;
    }
    function onUp(): void {
      if (!dragging.current) return;
      dragging.current = false;
      setGrabbed(false);
      scratch(deck, null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [deck, scratch]);

  // Register the platter as a control so the gesture layer can find it. We use
  // a "button"-ish trigger as a no-op fallback; real grab-scratching lives in
  // the gesture controller. Mouse interaction is handled directly above.
  const controlRef = useControl<HTMLDivElement>({
    id: `deck-${deck}-jog`,
    type: "button",
    onTrigger: () => {
      /* gesture grab handled elsewhere */
    },
  });

  // ---- Animation loop: spin + draw ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Capture into a non-null local so the inner closure doesn't re-narrow.
    const c = ctx;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    c.scale(dpr, dpr);

    let raf = 0;
    let prev = performance.now();
    let angle = 0; // accumulated platter rotation (radians)
    let speed = 0; // current eased spin speed (rev/sec)
    let shimmer = 0; // loading shimmer phase

    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const platterR = SIZE / 2 - 6;
    const labelR = SIZE * 0.21;

    function draw(now: number): void {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const { playing: isPlaying, loading: isLoading } = liveRef.current;

      // Ease spin speed toward the target so pause/play feel mechanical.
      const target = isPlaying ? REV_PER_SEC : 0;
      speed += (target - speed) * Math.min(1, SPIN_EASE * dt);
      angle += speed * dt * 2 * Math.PI;
      shimmer += dt;

      c.clearRect(0, 0, SIZE, SIZE);

      // Outer rev glow when spinning.
      const glow = Math.min(1, speed / REV_PER_SEC);
      if (glow > 0.01) {
        c.save();
        c.shadowColor = accentHex;
        c.shadowBlur = 26 * glow;
        c.beginPath();
        c.arc(cx, cy, platterR, 0, Math.PI * 2);
        c.strokeStyle = hexA(accentHex, 0.22 * glow);
        c.lineWidth = 2;
        c.stroke();
        c.restore();
      }

      // Platter body — radial dark vinyl gradient.
      const body = c.createRadialGradient(cx - 24, cy - 24, 10, cx, cy, platterR);
      body.addColorStop(0, "#1a1d2b");
      body.addColorStop(0.55, "#0c0e18");
      body.addColorStop(1, "#04050a");
      c.beginPath();
      c.arc(cx, cy, platterR, 0, Math.PI * 2);
      c.fillStyle = body;
      c.fill();
      c.strokeStyle = "rgba(255,255,255,0.08)";
      c.lineWidth = 1.5;
      c.stroke();

      // Concentric grooves (rotate with the platter via a tiny offset glint).
      c.save();
      c.translate(cx, cy);
      c.rotate(angle);
      for (let i = 0; i < 26; i++) {
        const rr = labelR + 6 + i * ((platterR - labelR - 8) / 26);
        c.beginPath();
        c.arc(0, 0, rr, 0, Math.PI * 2);
        c.strokeStyle = i % 2 === 0 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.35)";
        c.lineWidth = 1;
        c.stroke();
      }
      // A specular sheen line that rotates so the spin reads clearly.
      const sheen = c.createLinearGradient(-platterR, 0, platterR, 0);
      sheen.addColorStop(0, "rgba(255,255,255,0)");
      sheen.addColorStop(0.5, hexA(accentHex, 0.05 + 0.06 * glow));
      sheen.addColorStop(1, "rgba(255,255,255,0)");
      c.beginPath();
      c.arc(0, 0, platterR - 2, -0.35, 0.35);
      c.lineWidth = platterR;
      c.strokeStyle = sheen;
      c.stroke();
      c.restore();

      // Progress tick on the rim (one lap per track).
      const dur = durationRef.current;
      if (dur > 0) {
        const frac = Math.max(0, Math.min(1, positionRef.current / dur));
        const pa = -Math.PI / 2 + frac * Math.PI * 2;
        // faint full-lap track
        c.beginPath();
        c.arc(cx, cy, platterR - 1.5, 0, Math.PI * 2);
        c.strokeStyle = "rgba(255,255,255,0.05)";
        c.lineWidth = 3;
        c.stroke();
        // progressed arc
        c.beginPath();
        c.arc(cx, cy, platterR - 1.5, -Math.PI / 2, pa);
        c.strokeStyle = accentHex;
        c.lineWidth = 3;
        c.lineCap = "round";
        c.stroke();
        // tick dot
        c.beginPath();
        c.arc(cx + (platterR - 1.5) * Math.cos(pa), cy + (platterR - 1.5) * Math.sin(pa), 4, 0, Math.PI * 2);
        c.fillStyle = accentHex;
        c.shadowColor = accentHex;
        c.shadowBlur = 10;
        c.fill();
        c.shadowBlur = 0;
      }

      // Center label — clip artwork (or gradient placeholder) to a circle and
      // rotate it with the platter.
      c.save();
      c.translate(cx, cy);
      c.rotate(angle);
      c.beginPath();
      c.arc(0, 0, labelR, 0, Math.PI * 2);
      c.clip();
      const art = artRef.current;
      if (art && art.complete && art.naturalWidth > 0) {
        c.drawImage(art, -labelR, -labelR, labelR * 2, labelR * 2);
        c.fillStyle = "rgba(0,0,0,0.18)";
        c.fillRect(-labelR, -labelR, labelR * 2, labelR * 2);
      } else {
        const g = c.createLinearGradient(-labelR, -labelR, labelR, labelR);
        g.addColorStop(0, hexA(accentHex, 0.85));
        g.addColorStop(1, "#0a0d18");
        c.fillStyle = g;
        c.fillRect(-labelR, -labelR, labelR * 2, labelR * 2);
        c.fillStyle = "rgba(255,255,255,0.92)";
        c.font = `700 ${labelR * 0.95}px ui-sans-serif, system-ui, sans-serif`;
        c.textAlign = "center";
        c.textBaseline = "middle";
        c.fillText(deckLetter, 0, labelR * 0.06);
      }
      c.restore();

      // Label ring + spindle.
      c.beginPath();
      c.arc(cx, cy, labelR, 0, Math.PI * 2);
      c.strokeStyle = hexA(accentHex, 0.5);
      c.lineWidth = 2;
      c.stroke();
      c.beginPath();
      c.arc(cx, cy, 4.5, 0, Math.PI * 2);
      c.fillStyle = "#05060b";
      c.fill();
      c.strokeStyle = "rgba(255,255,255,0.3)";
      c.lineWidth = 1;
      c.stroke();

      // Loading shimmer: a soft sweeping arc.
      if (isLoading) {
        const s = (Math.sin(shimmer * 3) + 1) / 2;
        c.save();
        c.translate(cx, cy);
        c.rotate(shimmer * 2.4);
        const sh = c.createLinearGradient(-platterR, 0, platterR, 0);
        sh.addColorStop(0, "rgba(255,255,255,0)");
        sh.addColorStop(0.5, `rgba(255,255,255,${0.04 + 0.08 * s})`);
        sh.addColorStop(1, "rgba(255,255,255,0)");
        c.beginPath();
        c.arc(0, 0, platterR - 2, -0.6, 0.6);
        c.lineWidth = platterR;
        c.strokeStyle = sh;
        c.stroke();
        c.restore();
      }

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [accentHex, deckLetter, SIZE]);

  return (
    <div
      ref={wrapRef}
      style={{
        position: "relative",
        width: SIZE,
        height: SIZE,
        maxWidth: "100%",
        margin: "0 auto",
        userSelect: "none",
      }}
    >
      <div
        ref={controlRef}
        className={grabbed ? "control-grab" : "control-hover"}
        onPointerDown={(e) => {
          dragging.current = true;
          setGrabbed(true);
          lastAngle.current = pointerAngle(e);
          lastTime.current = performance.now();
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        }}
        onWheel={(e) => {
          e.preventDefault();
          nudge(deck, e.deltaY < 0 ? 1 : -1);
        }}
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: "50%",
          cursor: grabbed ? "grabbing" : "grab",
          touchAction: "none",
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: SIZE,
            height: SIZE,
            display: "block",
            borderRadius: "50%",
            transition: "filter 0.3s ease",
            filter: ready ? "none" : "saturate(0.6) brightness(0.85)",
          }}
        />
      </div>

      {/* Tonearm accent — anchored top-right, angles toward the spindle. */}
      <div
        style={{
          position: "absolute",
          top: -2,
          right: 6,
          width: 4,
          height: SIZE * 0.46,
          background: "linear-gradient(180deg, rgba(255,255,255,0.5), rgba(255,255,255,0.12))",
          borderRadius: 4,
          transformOrigin: "top center",
          transform: `rotate(${playing ? 28 : 18}deg)`,
          transition: "transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
          pointerEvents: "none",
          boxShadow: "0 2px 8px rgba(0,0,0,0.5)",
        }}
      >
        {/* pivot */}
        <div
          style={{
            position: "absolute",
            top: -7,
            left: -5,
            width: 14,
            height: 14,
            borderRadius: "50%",
            background: "var(--glass-strong, rgba(20,24,40,0.8))",
            border: "1px solid var(--glass-border, rgba(255,255,255,0.18))",
          }}
        />
        {/* headshell tip */}
        <div
          style={{
            position: "absolute",
            bottom: -6,
            left: -3,
            width: 10,
            height: 10,
            borderRadius: 2,
            background: accent,
            boxShadow: `0 0 8px ${accent}`,
          }}
        />
      </div>

      {/* BPM badge + rev glow indicator. */}
      <div
        className="glass"
        style={{
          position: "absolute",
          bottom: 4,
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 10px",
          borderRadius: "var(--radius-sm, 8px)",
          fontSize: 11,
          letterSpacing: 0.5,
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: accent,
            boxShadow: playing ? `0 0 8px ${accent}, 0 0 14px ${accent}` : "none",
            opacity: playing ? 1 : 0.35,
            transition: "opacity 0.3s ease, box-shadow 0.3s ease",
          }}
        />
        <span className="mono" style={{ color: "var(--text)" }}>
          {bpm != null ? `${Math.round(bpm)} BPM` : "-- BPM"}
        </span>
      </div>
    </div>
  );
}

/** Convert a #rrggbb hex to an rgba() string with the given alpha. */
function hexA(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
