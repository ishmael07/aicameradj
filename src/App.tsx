import { useEffect, useRef, useState } from "react";
import { TopBar } from "./components/TopBar";
import { DeckPanel } from "./components/DeckPanel";
import { Mixer } from "./components/Mixer";
import { MusicBrowser } from "./components/MusicBrowser";
import { CameraOverlay } from "./components/CameraOverlay";
import { useStore } from "./store";
import { useCameraControl } from "./control/useCameraControl";
import type { CursorState } from "./control/types";

/**
 * Root layout + the single rAF loop that (1) syncs deck playhead/level from the
 * audio engine into the store and (2) mirrors the gesture cursors ref into
 * React state for the overlay to render. Both run at animation cadence.
 */
export function App(): JSX.Element {
  const init = useStore((s) => s.init);
  const syncFromEngine = useStore((s) => s.syncFromEngine);
  const camera = useCameraControl();

  const [cursors, setCursors] = useState<CursorState[]>([]);
  const cameraOn = camera.status === "running" || camera.status === "starting";

  // Initialize the audio engine + sources once.
  useEffect(() => {
    init();
  }, [init]);

  // Single animation loop: engine sync + cursor mirroring.
  const cursorsRef = camera.cursorsRef;
  useEffect(() => {
    let raf = 0;
    let lastCursorJson = "";
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      syncFromEngine();
      // Only push cursor state to React when it meaningfully changes to avoid
      // churning the overlay every frame when hands are still.
      const cur = cursorsRef.current;
      const json = JSON.stringify(cur);
      if (json !== lastCursorJson) {
        lastCursorJson = json;
        setCursors(cur);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [syncFromEngine, cursorsRef]);

  function onToggleCamera(): void {
    if (cameraOn) camera.stop();
    else void camera.start();
  }

  const statusText =
    camera.status === "running"
      ? "tracking"
      : camera.status === "starting"
        ? "starting"
        : camera.status === "denied"
          ? "denied"
          : camera.status === "error"
            ? "error"
            : "camera off";

  return (
    <>
      <CameraOverlay
        video={camera.video}
        cursors={cursors}
        status={statusText}
        latencyMs={camera.latencyRef.current}
      />

      <div
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          gap: 12,
          padding: 12,
        }}
      >
        <TopBar cameraStatus={camera.status} onToggleCamera={onToggleCamera} />

        {/* Main mixing area: deck A | mixer | deck B */}
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            gap: 12,
            alignItems: "stretch",
          }}
        >
          <DeckPanel deck="a" />
          <Mixer />
          <DeckPanel deck="b" mirror />
        </div>

        {/* Library browser docked at the bottom. */}
        <div style={{ height: 260, flexShrink: 0 }}>
          <MusicBrowser />
        </div>
      </div>
    </>
  );
}
