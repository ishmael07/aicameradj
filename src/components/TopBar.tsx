import { useState } from "react";
import type { TrackerStatus } from "../vision/HandTracker";

interface TopBarProps {
  cameraStatus: TrackerStatus;
  onToggleCamera: () => void;
}

const STATUS_LABEL: Record<TrackerStatus, string> = {
  idle: "Camera off",
  starting: "Starting…",
  running: "Hands live",
  error: "Camera error",
  denied: "Permission denied",
};

/** Top bar: brand, camera toggle + status, and a quick help popover. */
export function TopBar({ cameraStatus, onToggleCamera }: TopBarProps): JSX.Element {
  const [showHelp, setShowHelp] = useState(false);
  const live = cameraStatus === "running";
  const busy = cameraStatus === "starting";

  return (
    <header
      className="glass"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 18px",
        gap: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            background: "linear-gradient(135deg, var(--accent-a), var(--accent-b))",
            boxShadow: "0 0 18px rgba(76,201,240,0.5)",
            display: "grid",
            placeItems: "center",
            fontWeight: 800,
            fontSize: 15,
            color: "#05060b",
          }}
        >
          ◉
        </div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16, letterSpacing: 0.4 }}>
            AI&nbsp;CAMERA&nbsp;DJ
          </div>
          <div style={{ fontSize: 10, color: "var(--text-dim)", letterSpacing: 1, textTransform: "uppercase" }}>
            Mix with your hands
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, position: "relative" }}>
        <button
          onClick={() => setShowHelp((v) => !v)}
          title="How to play"
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: "1px solid var(--glass-border)",
            background: "var(--glass)",
            color: "var(--text-dim)",
            fontSize: 14,
            fontWeight: 700,
          }}
        >
          ?
        </button>

        <button
          onClick={onToggleCamera}
          disabled={busy}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 16px",
            borderRadius: "var(--radius-sm)",
            border: `1px solid ${live ? "var(--good)" : "var(--glass-border)"}`,
            background: live ? "rgba(6,214,160,0.15)" : "var(--glass)",
            color: "var(--text)",
            fontWeight: 600,
            fontSize: 13,
            cursor: busy ? "wait" : "pointer",
            transition: "all 0.15s ease",
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: live ? "var(--good)" : busy ? "var(--warn)" : "var(--text-faint)",
              boxShadow: live ? "0 0 10px var(--good)" : "none",
            }}
          />
          {live ? "Camera On" : busy ? STATUS_LABEL[cameraStatus] : "Enable Camera"}
        </button>

        {(cameraStatus === "denied" || cameraStatus === "error") && (
          <span style={{ fontSize: 11, color: "var(--bad)" }}>{STATUS_LABEL[cameraStatus]}</span>
        )}

        {showHelp && (
          <div
            className="glass glass-strong"
            style={{
              position: "absolute",
              top: 44,
              right: 0,
              width: 320,
              padding: 16,
              zIndex: 100,
              fontSize: 12,
              lineHeight: 1.6,
              color: "var(--text-dim)",
            }}
          >
            <div style={{ fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>How to DJ on camera</div>
            <ul style={{ paddingLeft: 16, display: "flex", flexDirection: "column", gap: 4 }}>
              <li>Enable the camera, then raise a hand — a glowing cursor follows your index finger.</li>
              <li><b>Pinch</b> (thumb + index) to grab a knob/fader, move to adjust, release to let go.</li>
              <li>Pinch over a <b>button or pad</b> to trigger it.</li>
              <li>Everything also works with mouse + keys <b>1–8</b> for samples.</li>
              <li>Drag tracks from the browser onto a deck, or hit <b>Load A / Load B</b>.</li>
            </ul>
          </div>
        )}
      </div>
    </header>
  );
}
