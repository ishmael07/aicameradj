import { useEffect, useRef } from "react";
import { useStore, getDeckPeaks } from "../store";
import type { DeckId } from "../types";

interface WaveformProps {
  deck: DeckId;
}

/** Canvas height in CSS pixels. */
const HEIGHT = 90;
/** Horizontal zoom: how many pixels of canvas represent one second of audio. */
const PX_PER_SEC = 120;

/**
 * Scrolling waveform with a fixed center playhead (Serato / rekordbox style).
 *
 * The waveform texture scrolls horizontally so that the current playback
 * position always sits beneath the center playhead line. Audio that has
 * already played is dimmed; upcoming audio is bright. Beat markers are drawn
 * subtly when the deck BPM is known.
 *
 * Peaks are large typed arrays cached outside React (via getDeckPeaks), so we
 * read them imperatively inside the rAF loop rather than through state. Only
 * the lightweight scalar values (position, duration, bpm, playing) are mirrored
 * into refs from the store so the draw loop always sees fresh values without
 * re-subscribing or rebuilding the loop each frame.
 */
export function Waveform({ deck }: WaveformProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Live scalar deck values, mirrored into a ref for the rAF loop. These
  // selectors keep the component subscribed so the ref stays fresh, but the
  // draw loop itself reads only stateRef and never re-subscribes.
  const positionSec = useStore((s) => s.decks[deck].positionSec);
  const durationSec = useStore((s) => s.decks[deck].durationSec);
  const bpm = useStore((s) => s.decks[deck].bpm);
  const playing = useStore((s) => s.decks[deck].playing);
  const seek = useStore((s) => s.seek);

  const stateRef = useRef({ positionSec, durationSec, bpm, playing });
  stateRef.current = { positionSec, durationSec, bpm, playing };

  // Color comes straight from the design tokens (A = cyan, B = coral).
  const accentVar = deck === "a" ? "--accent-a" : "--accent-b";

  // ---- Pointer scrubbing: convert x-offset from center into a time delta ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let scrubbing = false;

    function timeFromEvent(clientX: number): number {
      const node = containerRef.current;
      if (!node) return 0;
      const r = node.getBoundingClientRect();
      const centerX = r.width / 2;
      const offsetX = clientX - r.left - centerX;
      const dt = offsetX / PX_PER_SEC;
      const { positionSec: pos, durationSec: dur } = stateRef.current;
      const target = pos + dt;
      const max = dur > 0 ? dur : target;
      return Math.max(0, Math.min(max, target));
    }

    function onDown(e: PointerEvent): void {
      if (stateRef.current.durationSec <= 0) return;
      scrubbing = true;
      el?.setPointerCapture?.(e.pointerId);
      seek(deck, timeFromEvent(e.clientX));
    }
    function onMove(e: PointerEvent): void {
      if (!scrubbing) return;
      seek(deck, timeFromEvent(e.clientX));
    }
    function onUp(e: PointerEvent): void {
      if (!scrubbing) return;
      scrubbing = false;
      el?.releasePointerCapture?.(e.pointerId);
    }

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [deck, seek]);

  // ---- Canvas draw loop ----
  // Built once per deck/accent; reads live scalars from stateRef so it never
  // needs to rebuild on position/bpm/playing changes (avoids per-frame React work).
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let cssW = 0;
    let cssH = HEIGHT;
    let dpr = Math.max(1, window.devicePixelRatio || 1);

    // Resolve the accent color once (theme change mid-session is unlikely).
    const accent =
      getComputedStyle(container).getPropertyValue(accentVar).trim() || "#4cc9f0";

    function ensureSize(): void {
      if (!canvas || !container) return;
      const w = container.clientWidth;
      const h = HEIGHT;
      dpr = Math.max(1, window.devicePixelRatio || 1);
      if (w === cssW && h === cssH && canvas.width === Math.round(w * dpr)) return;
      cssW = w;
      cssH = h;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    function draw(): void {
      if (!canvas || !ctx) return;
      ensureSize();
      const W = cssW;
      const H = cssH;
      const mid = H / 2;
      const centerX = W / 2;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      // Center baseline.
      ctx.strokeStyle = "rgba(255,255,255,0.06)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, mid + 0.5);
      ctx.lineTo(W, mid + 0.5);
      ctx.stroke();

      const peaks = getDeckPeaks(deck);
      const { positionSec: pos, durationSec: dur, bpm: deckBpm, playing: isPlaying } =
        stateRef.current;

      if (!peaks || peaks.length <= 0 || dur <= 0) {
        // Empty state: faint baseline + hint.
        ctx.fillStyle = "rgba(238,242,255,0.22)";
        ctx.font = "11px Inter, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Drop a track", centerX, mid - 12);
        drawPlayhead(ctx, centerX, H, accent, false);
        raf = requestAnimationFrame(draw);
        return;
      }

      // Map: each column of peaks covers dur/length seconds.
      const colsPerSec = peaks.length / dur;
      const amp = mid - 6;
      const data = peaks.data;
      const len = peaks.length;

      // Beat markers behind the waveform (subtle vertical ticks).
      if (deckBpm && deckBpm > 0) {
        const beatSec = 60 / deckBpm;
        const firstBeatTime =
          Math.floor((pos - centerX / PX_PER_SEC) / beatSec) * beatSec;
        const lastBeatTime = pos + (W - centerX) / PX_PER_SEC;
        ctx.lineWidth = 1;
        for (let t = firstBeatTime; t <= lastBeatTime; t += beatSec) {
          if (t < 0) continue;
          const x = centerX + (t - pos) * PX_PER_SEC;
          // Emphasize downbeats (every 4th beat) a touch more.
          const beatIndex = Math.round(t / beatSec);
          const isDownbeat = beatIndex % 4 === 0;
          ctx.strokeStyle = isDownbeat
            ? "rgba(255,255,255,0.14)"
            : "rgba(255,255,255,0.06)";
          ctx.beginPath();
          ctx.moveTo(x + 0.5, isDownbeat ? 4 : H * 0.18);
          ctx.lineTo(x + 0.5, isDownbeat ? H - 4 : H * 0.82);
          ctx.stroke();
        }
      }

      // Waveform: one vertical bar per canvas pixel column.
      const startTime = pos - centerX / PX_PER_SEC;
      for (let x = 0; x < W; x++) {
        const t = startTime + x / PX_PER_SEC;
        if (t < 0 || t > dur) continue;
        const col = Math.min(len - 1, Math.max(0, Math.floor(t * colsPerSec)));
        const minV = data[col * 2] ?? 0;
        const maxV = data[col * 2 + 1] ?? 0;
        const yTop = mid - maxV * amp;
        const yBot = mid - minV * amp;
        const h = Math.max(1, yBot - yTop);

        const past = t < pos;
        ctx.globalAlpha = past ? 0.32 : 0.92;
        ctx.fillStyle = accent;
        ctx.fillRect(x, yTop, 1, h);
      }
      ctx.globalAlpha = 1;

      drawPlayhead(ctx, centerX, H, accent, isPlaying);
      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    const onResize = (): void => ensureSize();
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [deck, accentVar]);

  return (
    <div
      ref={containerRef}
      className="glass"
      style={{
        position: "relative",
        width: "100%",
        height: HEIGHT,
        overflow: "hidden",
        cursor: durationSec > 0 ? "ew-resize" : "default",
        touchAction: "none",
        padding: 0,
      }}
    >
      <canvas ref={canvasRef} style={{ display: "block", width: "100%", height: HEIGHT }} />
    </div>
  );
}

/** Fixed center playhead: a glowing vertical line with a top triangle marker. */
function drawPlayhead(
  ctx: CanvasRenderingContext2D,
  centerX: number,
  height: number,
  accent: string,
  active: boolean,
): void {
  ctx.save();
  ctx.strokeStyle = "rgba(238,242,255,0.9)";
  ctx.shadowColor = accent;
  ctx.shadowBlur = active ? 12 : 5;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(centerX + 0.5, 0);
  ctx.lineTo(centerX + 0.5, height);
  ctx.stroke();
  ctx.restore();

  // Top marker triangle.
  ctx.save();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(centerX - 5, 0);
  ctx.lineTo(centerX + 5, 0);
  ctx.lineTo(centerX, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
