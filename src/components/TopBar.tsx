import { useState } from "react";
import type { CameraState } from "../vision/HandTracker";

interface TopBarProps {
  camera: CameraState;
  onToggleCamera: () => void;
  onToggleLibrary: () => void;
  libraryOpen: boolean;
}

/** Minimal floating top strip: brand, library toggle, camera toggle + status. */
export function TopBar({ camera, onToggleCamera, onToggleLibrary, libraryOpen }: TopBarProps): JSX.Element {
  const [showHelp, setShowHelp] = useState(false);
  const live = camera.phase === "live";
  const busy = camera.phase === "starting";

  const dot = live ? "var(--good)" : busy ? "var(--warn)" : camera.phase === "denied" || camera.phase === "error" ? "var(--bad)" : "var(--text-faint)";
  const statusText =
    busy ? "Starting…" :
    live ? (camera.tracking ? "Hands live" : "Camera on") :
    camera.phase === "denied" ? "Permission denied" :
    camera.phase === "error" ? "Camera error" : "Camera off";

  return (
    <div
      style={{
        position: "fixed",
        top: 16,
        left: 16,
        right: 16,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        pointerEvents: "none",
      }}
    >
      {/* Brand */}
      <div className="glass" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", pointerEvents: "auto" }}>
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 8,
            background: "linear-gradient(135deg, var(--accent-a), var(--accent-b))",
            display: "grid",
            placeItems: "center",
            color: "#06070a",
            fontWeight: 800,
            fontSize: 13,
          }}
        >
          ◉
        </div>
        <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 0.6 }}>CAMERA&nbsp;DJ</div>
      </div>

      {/* Controls */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, pointerEvents: "auto", position: "relative" }}>
        <button
          onClick={() => setShowHelp((v) => !v)}
          title="How to play"
          className="glass"
          style={{ width: 38, height: 38, borderRadius: "50%", color: "var(--text-dim)", fontSize: 15, fontWeight: 700 }}
        >
          ?
        </button>

        <button
          onClick={onToggleLibrary}
          className="glass"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 16px",
            color: "var(--text)",
            fontWeight: 600,
            fontSize: 13,
            borderColor: libraryOpen ? "var(--accent)" : undefined,
          }}
        >
          ♫ Library
        </button>

        <button
          onClick={onToggleCamera}
          disabled={busy}
          className="glass"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "9px 18px",
            color: "var(--text)",
            fontWeight: 600,
            fontSize: 13,
            borderColor: live ? "var(--good)" : "var(--glass-border)",
            background: live ? "color-mix(in srgb, var(--good) 14%, var(--glass))" : undefined,
            cursor: busy ? "wait" : "pointer",
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: dot, boxShadow: live ? `0 0 10px ${dot}` : "none" }} />
          {live ? "Camera On" : busy ? "Starting…" : "Enable Camera"}
        </button>

        {(camera.phase === "denied" || camera.phase === "error") && (
          <span className="glass" style={{ padding: "6px 12px", fontSize: 11, color: "var(--bad)", maxWidth: 260 }}>
            {camera.phase === "denied"
              ? "Allow camera access in your browser, then click Enable Camera again."
              : "Couldn't start the camera. Check it isn't in use by another app."}
          </span>
        )}

        {live && !camera.tracking && camera.trackingError && (
          <span className="glass" style={{ padding: "6px 12px", fontSize: 11, color: "var(--warn)", maxWidth: 280 }}>
            Hand tracking unavailable — controls still work with mouse + keys.
          </span>
        )}

        {showHelp && (
          <div
            className="glass glass-strong"
            style={{
              position: "absolute",
              top: 48,
              right: 0,
              width: 330,
              padding: 18,
              fontSize: 12,
              lineHeight: 1.6,
              color: "var(--text-dim)",
            }}
          >
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 8, fontSize: 13 }}>How to DJ on camera</div>
            <ul style={{ paddingLeft: 16, display: "flex", flexDirection: "column", gap: 5 }}>
              <li>Click <b>Enable Camera</b> and allow access — you'll see yourself full-screen.</li>
              <li>Raise a hand: a glowing cursor follows your index finger.</li>
              <li><b>Pinch</b> (thumb + index) to grab a knob/fader; move to adjust; release to let go.</li>
              <li>Pinch over a <b>button or pad</b> to trigger it.</li>
              <li>Everything also works with mouse + keys <b>1–8</b> for samples.</li>
              <li>Open <b>Library</b> to search Audius or load your own files onto a deck.</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
