import { MusicBrowser } from "./MusicBrowser";

interface LibraryDrawerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Slide-up library drawer. Keeps the music browser out of the way until
 * summoned, so the camera stage stays uncluttered.
 */
export function LibraryDrawer({ open, onClose }: LibraryDrawerProps): JSX.Element {
  return (
    <>
      {/* Click-away scrim (only when open) */}
      {open && (
        <div
          onClick={onClose}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 70,
            background: "rgba(6,7,8,0.35)",
            animation: "aicdj-fade 0.2s ease",
          }}
        />
      )}
      <div
        className="glass glass-strong"
        style={{
          position: "fixed",
          left: "50%",
          bottom: 0,
          transform: `translateX(-50%) translateY(${open ? "0" : "110%"})`,
          width: "min(720px, 94vw)",
          height: "min(560px, 78vh)",
          zIndex: 80,
          borderBottomLeftRadius: 0,
          borderBottomRightRadius: 0,
          display: "flex",
          flexDirection: "column",
          transition: "transform 0.34s cubic-bezier(0.22, 1, 0.36, 1)",
          overflow: "hidden",
        }}
      >
        {/* Grab handle / header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 18px 4px" }}>
          <span className="label" style={{ fontSize: 11 }}>Library</span>
          <button
            onClick={onClose}
            style={{ color: "var(--text-dim)", fontSize: 20, lineHeight: 1, padding: 4 }}
            title="Close"
          >
            ✕
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, padding: "0 14px 14px" }}>
          <MusicBrowser />
        </div>
      </div>
    </>
  );
}
