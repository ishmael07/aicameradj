import { useEffect, useRef } from "react";
import type { CursorState } from "../control/types";

interface CameraOverlayProps {
  /** The <video> element created/owned by HandTracker. May be null until ready. */
  video: HTMLVideoElement | null;
  /** Live per-hand cursors to render above the UI. */
  cursors: CursorState[];
  /** Human-readable tracker status: "tracking" | "camera off" | "starting" | "denied" | "error" | ... */
  status: string;
  /** End-to-end hand-tracking latency in milliseconds. */
  latencyMs: number;
}

const STATUS_COLORS: Record<string, string> = {
  tracking: "var(--good)",
  starting: "var(--warn)",
  "camera off": "var(--text-faint)",
  denied: "var(--bad)",
  error: "var(--bad)",
};

function statusColor(status: string): string {
  return STATUS_COLORS[status] ?? "var(--text-faint)";
}

function isLive(status: string): boolean {
  return status === "tracking";
}

/**
 * Live camera background + hand-cursor overlay.
 *
 * Layers (via fixed, full-bleed containers):
 *   - The mirrored, dimmed camera feed sits behind all app content (zIndex -1).
 *   - The hand cursors float above the app content (high zIndex) but never
 *     intercept pointer events, so the real DJ UI stays fully interactive.
 *
 * The <video> element itself is owned by HandTracker and handed in via props;
 * we merely adopt it into our background container and style it to cover.
 */
export function CameraOverlay({ video, cursors, status, latencyMs }: CameraOverlayProps): JSX.Element {
  const videoHostRef = useRef<HTMLDivElement | null>(null);

  // Adopt the externally-owned <video> into our background container and
  // style it to cover. Guard against double-append; clean up on unmount /
  // when the element changes.
  useEffect(() => {
    const host = videoHostRef.current;
    if (!host || !video) return;

    // Style the borrowed element to fully cover its host, mirrored.
    video.style.position = "absolute";
    video.style.inset = "0";
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "cover";
    video.style.transform = "scaleX(-1)"; // mirror so it reads like a mirror
    video.style.transformOrigin = "center";
    video.style.pointerEvents = "none";

    // Only append if it isn't already our child (guard re-append).
    if (video.parentElement !== host) {
      host.appendChild(video);
    }

    return () => {
      // Remove only if we still own it; HandTracker keeps the reference alive.
      if (video.parentElement === host) {
        host.removeChild(video);
      }
    };
  }, [video]);

  return (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none", // never block the real UI
        overflow: "hidden",
      }}
    >
      {/* ---- Camera background (behind everything) ---- */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -1,
          background: "var(--bg-0)",
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        {/* Host that adopts the borrowed <video>. */}
        <div
          ref={videoHostRef}
          style={{
            position: "absolute",
            inset: 0,
            opacity: video && isLive(status) ? 0.5 : 0.22,
            filter: "blur(2px) saturate(1.1)",
            transition: "opacity 600ms ease",
          }}
        />
        {/* Readability scrim: darken + vignette so glass UI stays legible. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 50% 40%, rgba(5,6,11,0.35) 0%, rgba(5,6,11,0.72) 70%, rgba(5,6,11,0.92) 100%)," +
              "linear-gradient(180deg, rgba(5,6,11,0.55) 0%, rgba(10,13,24,0.35) 45%, rgba(5,6,11,0.78) 100%)",
          }}
        />
      </div>

      {/* ---- Status HUD (top-left glass chip) ---- */}
      <div
        className="glass"
        style={{
          position: "fixed",
          top: 16,
          left: 16,
          zIndex: 50,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 14px",
          borderRadius: "var(--radius-sm)",
          pointerEvents: "none",
        }}
      >
        <span style={{ position: "relative", display: "inline-flex", width: 10, height: 10 }}>
          <span
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              background: statusColor(status),
              boxShadow: `0 0 10px ${statusColor(status)}`,
            }}
          />
          {isLive(status) && (
            <span
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: "50%",
                background: statusColor(status),
                animation: "camHudPulse 1.6s ease-out infinite",
              }}
            />
          )}
        </span>
        <span
          style={{
            fontSize: 11,
            letterSpacing: 0.6,
            textTransform: "uppercase",
            color: "var(--text)",
            fontWeight: 600,
          }}
        >
          {status}
        </span>
        <span
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--text-dim)",
            paddingLeft: 6,
            borderLeft: "1px solid var(--glass-border)",
          }}
        >
          {Math.round(Number.isFinite(latencyMs) ? latencyMs : 0)}ms
        </span>
      </div>

      {/* ---- Hand cursors (above the UI, but pointer-events none) ---- */}
      <div style={{ position: "fixed", inset: 0, zIndex: 40, pointerEvents: "none" }}>
        {cursors.map((c, i) => (
          // MediaPipe can momentarily classify both hands with the same
          // handedness, so include the index to keep keys unique.
          <HandCursor key={`${c.handedness}-${i}`} cursor={c} />
        ))}
      </div>

      {/* Local keyframes for the live status pulse. */}
      <style>{`
        @keyframes camHudPulse {
          0%   { transform: scale(1);   opacity: 0.55; }
          70%  { transform: scale(2.6); opacity: 0;    }
          100% { transform: scale(2.6); opacity: 0;    }
        }
      `}</style>
    </div>
  );
}

/** A single glowing hand cursor whose size/brightness tracks the pinch value. */
function HandCursor({ cursor }: { cursor: CursorState }): JSX.Element {
  const { x, y, pinch, pinching, hoverId, grabbedId, handedness } = cursor;

  // Color priority: grabbing > hovering > idle.
  const color = grabbedId ? "var(--good)" : hoverId ? "var(--accent)" : "rgba(238,242,255,0.92)";

  // Pinch (0..1) grows the inner dot and tightens the ring; pinching state
  // brightens everything and fills the core. Guard against NaN/out-of-range
  // pinch values coming from the tracker.
  const safePinch = Number.isFinite(pinch) ? pinch : 0;
  const clampedPinch = Math.max(0, Math.min(1, safePinch));
  const ringSize = 44 - clampedPinch * 16; // ring tightens as you pinch
  const coreSize = 8 + clampedPinch * 14; // core swells as you pinch
  const glow = 10 + clampedPinch * 26 + (pinching ? 14 : 0);
  const ringOpacity = 0.4 + clampedPinch * 0.4 + (pinching ? 0.2 : 0);

  // Position is display-normalized 0..1; clamp so a stray value never parks the
  // cursor far off-screen.
  const left = `${Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0)) * 100}%`;
  const top = `${Math.max(0, Math.min(1, Number.isFinite(y) ? y : 0)) * 100}%`;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        transform: "translate(-50%, -50%)",
        transition: "left 70ms linear, top 70ms linear",
        willChange: "left, top",
        pointerEvents: "none",
      }}
    >
      {/* Outer ring */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: ringSize,
          height: ringSize,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          border: `2px solid ${color}`,
          boxShadow: `0 0 ${glow}px ${color}, inset 0 0 ${glow / 2}px ${color}`,
          opacity: ringOpacity,
          background: pinching ? `radial-gradient(circle, ${color} 0%, transparent 70%)` : "transparent",
          transition:
            "width 90ms ease, height 90ms ease, opacity 90ms ease, box-shadow 90ms ease, border-color 120ms ease",
        }}
      />
      {/* Core dot */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          width: coreSize,
          height: coreSize,
          transform: "translate(-50%, -50%)",
          borderRadius: "50%",
          background: color,
          opacity: pinching ? 1 : 0.85,
          boxShadow: `0 0 ${glow}px ${color}`,
          transition: "width 90ms ease, height 90ms ease, opacity 90ms ease, background 120ms ease",
        }}
      />
      {/* Handedness label */}
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: `translate(-50%, ${ringSize / 2 + 8}px)`,
          fontSize: 9,
          letterSpacing: 1,
          textTransform: "uppercase",
          color: "var(--text-faint)",
          whiteSpace: "nowrap",
          textShadow: "0 1px 4px rgba(0,0,0,0.8)",
          transition: "transform 90ms ease",
        }}
      >
        {handedness}
      </span>
    </div>
  );
}
