import { useEffect, useRef } from "react";
import type { CursorState } from "../control/types";

interface CameraStageProps {
  /** The <video> element created/owned by HandTracker. Null until started. */
  video: HTMLVideoElement | null;
  /** Live per-hand cursors to render above the UI. */
  cursors: CursorState[];
  /** Whether the camera feed is live (video visible). */
  cameraLive: boolean;
}

/**
 * Full-bleed live camera background + hand-cursor overlay — the stage you
 * perform on. The feed is shown bright and clear (mirrored); only soft edge
 * vignettes keep the floating glass console readable. The camera is DECOUPLED
 * from hand tracking, so it stays visible even if tracking hasn't started.
 */
export function CameraStage({ video, cursors, cameraLive }: CameraStageProps): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !video) return;
    video.style.position = "absolute";
    video.style.inset = "0";
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "cover";
    video.style.transform = "scaleX(-1)"; // mirror so it reads like a mirror
    video.style.pointerEvents = "none";
    if (video.parentElement !== host) host.appendChild(video);
    return () => {
      if (video.parentElement === host) host.removeChild(video);
    };
  }, [video]);

  return (
    <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
      {/* Camera feed (bright + clear) */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, background: "var(--bg-0)", overflow: "hidden" }}>
        <div
          ref={hostRef}
          style={{
            position: "absolute",
            inset: 0,
            opacity: cameraLive ? 1 : 0,
            transition: "opacity 700ms ease",
          }}
        />
        {/* Soft vignette + bottom darkening so the console stays legible —
            deliberately light so YOU stay clearly visible. */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(130% 100% at 50% 35%, transparent 55%, rgba(6,7,8,0.55) 100%)," +
              "linear-gradient(180deg, rgba(6,7,8,0.45) 0%, transparent 22%, transparent 60%, rgba(6,7,8,0.72) 100%)",
          }}
        />
        {/* Idle backdrop when the camera is off */}
        {!cameraLive && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(80% 60% at 50% 40%, rgba(56,225,255,0.06), transparent 70%)," +
                "radial-gradient(70% 60% at 60% 70%, rgba(255,107,139,0.05), transparent 70%)",
            }}
          />
        )}
      </div>

      {/* Hand cursors — above everything, never block input */}
      <div style={{ position: "fixed", inset: 0, zIndex: 60, pointerEvents: "none" }}>
        {cursors.map((c, i) => (
          <HandCursor key={`${c.handedness}-${i}`} cursor={c} />
        ))}
      </div>
    </div>
  );
}

/** A glowing hand cursor whose size/brightness tracks the pinch value. */
function HandCursor({ cursor }: { cursor: CursorState }): JSX.Element {
  const { x, y, pinch, pinching, hoverId, grabbedId, handedness } = cursor;

  const color = grabbedId ? "var(--good)" : hoverId ? "var(--accent)" : "rgba(244,246,251,0.95)";
  const safePinch = Math.max(0, Math.min(1, Number.isFinite(pinch) ? pinch : 0));
  const ringSize = 50 - safePinch * 20;
  const coreSize = 7 + safePinch * 16;
  const glow = 12 + safePinch * 30 + (pinching ? 16 : 0);
  const ringOpacity = 0.45 + safePinch * 0.4 + (pinching ? 0.15 : 0);

  const left = `${Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0)) * 100}%`;
  const top = `${Math.max(0, Math.min(1, Number.isFinite(y) ? y : 0)) * 100}%`;

  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        transform: "translate(-50%, -50%)",
        transition: "left 60ms linear, top 60ms linear",
        willChange: "left, top",
        pointerEvents: "none",
      }}
    >
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
          background: pinching ? `radial-gradient(circle, ${color} 0%, transparent 68%)` : "transparent",
          transition: "width 80ms ease, height 80ms ease, opacity 80ms ease, box-shadow 80ms ease",
        }}
      />
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
          transition: "width 80ms ease, height 80ms ease, background 120ms ease",
        }}
      />
      <span
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: `translate(-50%, ${ringSize / 2 + 9}px)`,
          fontSize: 8.5,
          letterSpacing: 1.5,
          textTransform: "uppercase",
          color: "var(--text-faint)",
          whiteSpace: "nowrap",
          textShadow: "0 1px 4px rgba(0,0,0,0.9)",
        }}
      >
        {handedness}
      </span>
    </div>
  );
}
