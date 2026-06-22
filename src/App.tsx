import { useEffect, useState } from "react";
import { TopBar } from "./components/TopBar";
import { DeckPanel } from "./components/DeckPanel";
import { Mixer } from "./components/Mixer";
import { LibraryDrawer } from "./components/LibraryDrawer";
import { CameraStage } from "./components/CameraStage";
import { useStore } from "./store";
import { useCameraControl } from "./control/useCameraControl";
import type { CursorState } from "./control/types";

/**
 * Holographic-console layout: the live camera fills the screen (you, on stage),
 * two translucent deck columns float at the edges, a mixer + sampler bar floats
 * low-center, and the library lives in a slide-up drawer. A single rAF loop
 * (1) syncs deck playhead/level from the audio engine and (2) mirrors gesture
 * cursors into React state for the overlay.
 */
export function App(): JSX.Element {
  const init = useStore((s) => s.init);
  const syncFromEngine = useStore((s) => s.syncFromEngine);
  const camera = useCameraControl();

  const [cursors, setCursors] = useState<CursorState[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const cameraOn = camera.state.phase === "live" || camera.state.phase === "starting";

  useEffect(() => {
    init();
  }, [init]);

  const cursorsRef = camera.cursorsRef;
  useEffect(() => {
    let raf = 0;
    let lastCursorJson = "";
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      syncFromEngine();
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

  return (
    <>
      <CameraStage video={camera.video} cursors={cursors} cameraLive={camera.state.phase === "live"} />

      <TopBar
        camera={camera.state}
        onToggleCamera={onToggleCamera}
        onToggleLibrary={() => setLibraryOpen((v) => !v)}
        libraryOpen={libraryOpen}
      />

      {/* Floating console: decks at the edges, mixer low-center. */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 30,
          pointerEvents: "none",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 12,
          padding: "64px 18px 18px",
        }}
      >
        {/* Decks row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 18,
            minHeight: 0,
            flex: "0 1 auto",
          }}
        >
          <div style={{ pointerEvents: "auto", maxHeight: "100%", overflowY: "auto", overflowX: "hidden" }}>
            <DeckPanel deck="a" />
          </div>
          <div style={{ pointerEvents: "auto", maxHeight: "100%", overflowY: "auto", overflowX: "hidden" }}>
            <DeckPanel deck="b" mirror />
          </div>
        </div>

        {/* Mixer + sampler bar, floating low-center */}
        <div style={{ display: "flex", justifyContent: "center", pointerEvents: "none", flexShrink: 0 }}>
          <div style={{ pointerEvents: "auto" }}>
            <Mixer />
          </div>
        </div>
      </div>

      <LibraryDrawer open={libraryOpen} onClose={() => setLibraryOpen(false)} />

      {/* First-run hint when camera is off */}
      {camera.state.phase === "idle" && <StartHint />}
    </>
  );
}

function StartHint(): JSX.Element {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        pointerEvents: "none",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 40, opacity: 0.9 }}>🎛️</div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 0.4 }}>Mix with your hands</div>
      <div style={{ fontSize: 14, color: "var(--text-dim)", maxWidth: 420 }}>
        Click <b style={{ color: "var(--text)" }}>Enable Camera</b> in the top-right, then pinch the air to grab knobs and faders. Open the <b style={{ color: "var(--text)" }}>Library</b> to load tracks.
      </div>
    </div>
  );
}
