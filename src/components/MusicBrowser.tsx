import { useEffect, useRef, useState } from "react";
import type { DragEvent, FormEvent } from "react";
import { useStore } from "../store";
import type { DeckId, SourceInfo, SourceStatus, Track } from "../types";

/**
 * Last track that began a drag. DataTransfer cannot reliably carry a Blob, so
 * the real Track object (with `file` for local sources) is stashed here and read
 * back by DeckPanel's drop handler via `getDragTrack()`.
 */
let lastDragTrack: Track | null = null;

export function getDragTrack(): Track | null {
  return lastDragTrack;
}

const DRAG_MIME = "application/x-aicameradj-track";

/** Small status badge text per non-ready source state. */
function statusBadge(status: SourceStatus): string | null {
  switch (status) {
    case "needs-config":
      return "setup";
    case "unavailable":
      return "proxy";
    case "ready":
      return null;
    default:
      return null;
  }
}

function statusColor(status: SourceStatus): string {
  switch (status) {
    case "needs-config":
      return "var(--warn)";
    case "unavailable":
      return "var(--bad)";
    default:
      return "var(--text-faint)";
  }
}

export function MusicBrowser(): JSX.Element {
  const sourceInfos = useStore((s) => s.sourceInfos);
  const activeSource = useStore((s) => s.activeSource);
  const setActiveSource = useStore((s) => s.setActiveSource);

  const searchResults = useStore((s) => s.searchResults);
  const localTracks = useStore((s) => s.localTracks);
  const searching = useStore((s) => s.searching);
  const searchError = useStore((s) => s.searchError);

  const runSearch = useStore((s) => s.runSearch);
  const addLocalFiles = useStore((s) => s.addLocalFiles);
  const loadTrackToDeck = useStore((s) => s.loadTrackToDeck);

  const active: SourceInfo | undefined = sourceInfos.find((s) => s.id === activeSource);
  const canSearch = active?.canSearch ?? true;
  const isLocal = activeSource === "local";

  const [query, setQuery] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset the search field when switching to a different source.
  useEffect(() => {
    setQuery("");
  }, [activeSource]);

  const tracks = isLocal ? localTracks : searchResults;

  function onSubmit(e: FormEvent): void {
    e.preventDefault();
    void runSearch(query);
  }

  function onPickFiles(): void {
    fileInputRef.current?.click();
  }

  function onZoneDrop(e: DragEvent<HTMLDivElement>): void {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addLocalFiles(e.dataTransfer.files);
    }
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      {/* ---- Source tabs ---- */}
      <div
        role="tablist"
        aria-label="Music sources"
        style={{
          display: "flex",
          gap: 4,
          padding: "10px 10px 8px",
          borderBottom: "1px solid var(--glass-border)",
        }}
      >
        {sourceInfos.map((info) => (
          <SourceTab
            key={info.id}
            info={info}
            active={info.id === activeSource}
            onSelect={() => setActiveSource(info.id)}
          />
        ))}
      </div>

      {/* ---- Active source subtitle (status detail) ---- */}
      {active && active.status !== "ready" && active.statusDetail && (
        <div
          style={{
            padding: "8px 12px",
            fontSize: 11,
            lineHeight: 1.4,
            color: statusColor(active.status),
            background: "rgba(255,255,255,0.02)",
            borderBottom: "1px solid var(--glass-border)",
          }}
        >
          {active.statusDetail}
        </div>
      )}

      {/* ---- Search box OR drop zone ---- */}
      <div style={{ padding: "10px 12px" }}>
        {canSearch ? (
          <form onSubmit={onSubmit} style={{ position: "relative" }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${active?.label ?? "music"}…`}
              spellCheck={false}
              autoComplete="off"
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "10px 38px 10px 12px",
                fontSize: 13,
                color: "var(--text)",
                background: "var(--glass-strong)",
                border: "1px solid var(--glass-border)",
                borderRadius: "var(--radius-sm)",
                outline: "none",
                transition: "border-color 0.18s ease, box-shadow 0.18s ease",
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--accent)";
                e.currentTarget.style.boxShadow = "0 0 0 3px rgba(183,148,255,0.15)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--glass-border)";
                e.currentTarget.style.boxShadow = "none";
              }}
            />
            <button
              type="submit"
              aria-label="Search"
              className="control-hover"
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                width: 26,
                height: 26,
                display: "grid",
                placeItems: "center",
                border: "none",
                background: "transparent",
                color: "var(--text-dim)",
                cursor: "pointer",
                borderRadius: 6,
              }}
            >
              {searching ? <Spinner /> : <SearchIcon />}
            </button>
          </form>
        ) : (
          <DropZone
            dragOver={dragOver}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onZoneDrop}
            onClick={onPickFiles}
          />
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addLocalFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {canSearch && searchError && (
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              color: "var(--bad)",
              padding: "6px 10px",
              borderRadius: "var(--radius-sm)",
              background: "rgba(255,93,115,0.1)",
              border: "1px solid rgba(255,93,115,0.25)",
            }}
          >
            {searchError}
          </div>
        )}
      </div>

      {/* ---- Results list ---- */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          padding: "0 8px 10px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {tracks.length === 0 ? (
          <EmptyState
            isLocal={isLocal}
            searching={searching}
            hasError={!!searchError}
            onPickFiles={onPickFiles}
          />
        ) : (
          tracks.map((track) => (
            <ResultRow key={track.id} track={track} onLoad={loadTrackToDeck} />
          ))
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Source tab                                                          */
/* ------------------------------------------------------------------ */

function SourceTab({
  info,
  active,
  onSelect,
}: {
  info: SourceInfo;
  active: boolean;
  onSelect: () => void;
}): JSX.Element {
  const badge = statusBadge(info.status);
  return (
    <button
      role="tab"
      aria-selected={active}
      title={info.statusDetail ?? info.label}
      onClick={onSelect}
      className="control-hover"
      style={{
        flex: 1,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "8px 6px",
        fontSize: 12,
        fontWeight: active ? 600 : 500,
        letterSpacing: 0.3,
        color: active ? "var(--text)" : "var(--text-dim)",
        background: active ? "var(--glass-strong)" : "transparent",
        border: active ? "1px solid var(--glass-border-strong)" : "1px solid transparent",
        borderRadius: "var(--radius-sm)",
        cursor: "pointer",
        whiteSpace: "nowrap",
        transition: "color 0.18s ease, background 0.18s ease, border-color 0.18s ease",
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{info.label}</span>
      {badge && (
        <span
          style={{
            fontSize: 9,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            padding: "1px 5px",
            borderRadius: 4,
            color: statusColor(info.status),
            background: "rgba(255,255,255,0.06)",
            border: `1px solid ${statusColor(info.status)}`,
          }}
        >
          {badge}
        </span>
      )}
      {active && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 10,
            right: 10,
            bottom: -1,
            height: 2,
            borderRadius: 2,
            background: "var(--accent)",
            boxShadow: "0 0 8px var(--accent)",
          }}
        />
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Result row                                                          */
/* ------------------------------------------------------------------ */

function ResultRow({
  track,
  onLoad,
}: {
  track: Track;
  onLoad: (deck: DeckId, track: Track) => Promise<void>;
}): JSX.Element {
  const [hover, setHover] = useState(false);

  function onDragStart(e: DragEvent<HTMLDivElement>): void {
    lastDragTrack = track;
    // Serializable metadata travels via DataTransfer; the real Track (with any
    // Blob) is recovered through getDragTrack() on drop.
    try {
      e.dataTransfer.setData(
        DRAG_MIME,
        JSON.stringify({
          id: track.id,
          source: track.source,
          title: track.title,
          artist: track.artist,
        }),
      );
    } catch {
      /* setData can throw in some browsers; the module-level stash still works. */
    }
    e.dataTransfer.effectAllowed = "copy";
  }

  const playable = track.playable;

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: 8,
        borderRadius: "var(--radius-sm)",
        background: hover ? "var(--glass-strong)" : "var(--glass)",
        border: "1px solid var(--glass-border)",
        cursor: "grab",
        userSelect: "none",
        opacity: playable ? 1 : 0.72,
        transition: "background 0.16s ease, transform 0.16s ease",
        transform: hover ? "translateX(2px)" : "none",
      }}
    >
      <Artwork url={track.artworkUrl} title={track.title} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={track.title}
        >
          {track.title}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--text-dim)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            marginTop: 1,
          }}
          title={track.artist}
        >
          {track.artist}
        </div>
        {!playable && track.unplayableReason && (
          <div
            style={{
              fontSize: 10,
              color: "var(--text-faint)",
              marginTop: 2,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={track.unplayableReason}
          >
            {track.unplayableReason}
          </div>
        )}
      </div>

      {typeof track.bpm === "number" && track.bpm > 0 && (
        <span
          className="mono"
          style={{
            fontSize: 11,
            color: "var(--text-dim)",
            background: "rgba(255,255,255,0.05)",
            border: "1px solid var(--glass-border)",
            borderRadius: 5,
            padding: "2px 6px",
            whiteSpace: "nowrap",
          }}
          title="Beats per minute"
        >
          {Math.round(track.bpm)} BPM
        </span>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <LoadButton
          deck="a"
          disabled={!playable}
          onClick={() => void onLoad("a", track)}
        />
        <LoadButton
          deck="b"
          disabled={!playable}
          onClick={() => void onLoad("b", track)}
        />
      </div>
    </div>
  );
}

function LoadButton({
  deck,
  disabled,
  onClick,
}: {
  deck: DeckId;
  disabled: boolean;
  onClick: () => void;
}): JSX.Element {
  const accent = deck === "a" ? "var(--accent-a)" : "var(--accent-b)";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={disabled ? undefined : "control-hover"}
      title={disabled ? "Not playable" : `Load to deck ${deck.toUpperCase()}`}
      style={{
        minWidth: 58,
        padding: "4px 8px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        color: disabled ? "var(--text-faint)" : accent,
        background: disabled ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${disabled ? "var(--glass-border)" : accent}`,
        borderRadius: 5,
        cursor: disabled ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
        transition: "background 0.16s ease, box-shadow 0.16s ease",
        boxShadow: disabled ? "none" : `0 0 0 0 ${accent}`,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.boxShadow = `0 0 10px -2px ${accent}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = `0 0 0 0 ${accent}`;
      }}
    >
      Load {deck.toUpperCase()}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Artwork thumbnail                                                   */
/* ------------------------------------------------------------------ */

function Artwork({ url, title }: { url?: string; title: string }): JSX.Element {
  const [failed, setFailed] = useState(false);
  return (
    <div
      style={{
        width: 44,
        height: 44,
        flexShrink: 0,
        borderRadius: 6,
        overflow: "hidden",
        background:
          "linear-gradient(135deg, rgba(76,201,240,0.25), rgba(183,148,255,0.25))",
        border: "1px solid var(--glass-border)",
        display: "grid",
        placeItems: "center",
      }}
    >
      {url && !failed ? (
        <img
          src={url}
          alt={title}
          draggable={false}
          onError={() => setFailed(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
        />
      ) : (
        <NoteIcon />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Drop zone (local source)                                            */
/* ------------------------------------------------------------------ */

function DropZone({
  dragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onClick,
}: {
  dragOver: boolean;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  onClick: () => void;
}): JSX.Element {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: "20px 12px",
        textAlign: "center",
        borderRadius: "var(--radius-sm)",
        border: `1.5px dashed ${dragOver ? "var(--accent)" : "var(--glass-border-strong)"}`,
        background: dragOver ? "rgba(183,148,255,0.1)" : "rgba(255,255,255,0.02)",
        color: dragOver ? "var(--text)" : "var(--text-dim)",
        cursor: "pointer",
        transition: "border-color 0.18s ease, background 0.18s ease, color 0.18s ease",
      }}
    >
      <UploadIcon active={dragOver} />
      <div style={{ fontSize: 12, fontWeight: 600 }}>
        {dragOver ? "Drop to add" : "Drop audio files or click to browse"}
      </div>
      <div style={{ fontSize: 10, color: "var(--text-faint)" }}>
        mp3 · wav · ogg · m4a · flac
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */

function EmptyState({
  isLocal,
  searching,
  hasError,
  onPickFiles,
}: {
  isLocal: boolean;
  searching: boolean;
  hasError: boolean;
  onPickFiles: () => void;
}): JSX.Element {
  let label: string;
  if (searching) label = "Searching…";
  else if (hasError) label = "No results.";
  else if (isLocal) label = "No local tracks yet.";
  else label = "Search to find tracks.";

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "30px 16px",
        color: "var(--text-faint)",
        fontSize: 12,
        textAlign: "center",
      }}
    >
      {searching ? <Spinner large /> : <NoteIcon large />}
      <span>{label}</span>
      {isLocal && !searching && (
        <button
          onClick={onPickFiles}
          className="control-hover"
          style={{
            marginTop: 2,
            padding: "6px 14px",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--accent)",
            background: "rgba(183,148,255,0.1)",
            border: "1px solid var(--accent)",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer",
          }}
        >
          Add files
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Icons & spinner                                                     */
/* ------------------------------------------------------------------ */

function Spinner({ large = false }: { large?: boolean }): JSX.Element {
  const sz = large ? 28 : 15;
  return (
    <svg
      width={sz}
      height={sz}
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: "aicdj-spin 0.8s linear infinite" }}
    >
      <circle cx="12" cy="12" r="9" stroke="rgba(255,255,255,0.12)" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="var(--accent)"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <style>{`@keyframes aicdj-spin{to{transform:rotate(360deg);}}`}</style>
    </svg>
  );
}

function SearchIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M16.5 16.5 21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function NoteIcon({ large = false }: { large?: boolean }): JSX.Element {
  const sz = large ? 26 : 18;
  return (
    <svg width={sz} height={sz} viewBox="0 0 24 24" fill="none" style={{ opacity: 0.6 }}>
      <path
        d="M9 18V5l10-2v13"
        stroke="var(--text-faint)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="18" r="3" stroke="var(--text-faint)" strokeWidth="1.8" />
      <circle cx="16" cy="16" r="3" stroke="var(--text-faint)" strokeWidth="1.8" />
    </svg>
  );
}

function UploadIcon({ active }: { active: boolean }): JSX.Element {
  const c = active ? "var(--accent)" : "var(--text-dim)";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 16V4m0 0L7 9m5-5 5 5"
        stroke={c}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"
        stroke={c}
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
