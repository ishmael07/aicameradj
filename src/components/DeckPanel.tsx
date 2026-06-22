import { useState } from "react";
import { Turntable } from "./Turntable";
import { Waveform } from "./Waveform";
import { Knob } from "./Knob";
import { Fader } from "./Fader";
import { PadButton } from "./PadButton";
import { getDragTrack } from "./MusicBrowser";
import { useStore } from "../store";
import { fmtPitch, fmtTime } from "../util/format";
import type { DeckId } from "../types";

/**
 * A single deck as a clean floating column: track header, waveform, turntable,
 * a compact EQ + pitch/volume row, and transport. Deck A and B mirror so the
 * pair frames the performer. Translucent so the camera shows through.
 */
export function DeckPanel({ deck, mirror = false }: { deck: DeckId; mirror?: boolean }): JSX.Element {
  const accent = deck === "a" ? "var(--accent-a)" : "var(--accent-b)";
  const ds = useStore((s) => s.decks[deck]);
  const loadTrackToDeck = useStore((s) => s.loadTrackToDeck);
  const togglePlay = useStore((s) => s.togglePlay);
  const cue = useStore((s) => s.cue);
  const setPitch = useStore((s) => s.setPitch);
  const setVolume = useStore((s) => s.setVolume);
  const setEq = useStore((s) => s.setEq);
  const [dragOver, setDragOver] = useState(false);

  function onDrop(e: React.DragEvent): void {
    e.preventDefault();
    setDragOver(false);
    const track = getDragTrack();
    if (track) void loadTrackToDeck(deck, track);
  }

  const title = ds.track?.title ?? "Empty deck";
  const artist = ds.track?.artist ?? "Drag a track here";

  return (
    <div
      className="glass"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      style={{
        width: "clamp(280px, 24vw, 320px)",
        flexShrink: 0,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
        borderColor: dragOver ? accent : undefined,
        boxShadow: dragOver ? `0 0 36px ${accent}` : undefined,
        transition: "box-shadow 0.18s ease, border-color 0.18s ease",
        animation: "aicdj-rise 0.4s ease both",
      }}
    >
      {/* Header: deck tag + title + BPM */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 40 }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            display: "grid",
            placeItems: "center",
            background: `linear-gradient(135deg, ${accent}, transparent)`,
            border: `1px solid ${accent}`,
            color: "#06070a",
            fontWeight: 800,
            fontSize: 15,
            boxShadow: `0 0 16px ${dragOver ? accent : "transparent"}`,
          }}
        >
          {deck.toUpperCase()}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {title}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {artist}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="mono" style={{ fontSize: 17, fontWeight: 700, color: accent, lineHeight: 1 }}>
            {ds.bpm ?? "––"}
          </div>
          <div className="label" style={{ fontSize: 8 }}>BPM</div>
        </div>
      </div>

      {!ds.track?.playable && ds.track?.unplayableReason && (
        <div style={{ fontSize: 11, color: "var(--warn)" }}>{ds.track.unplayableReason}</div>
      )}

      <Waveform deck={deck} />

      <div style={{ display: "flex", justifyContent: "center" }}>
        <Turntable deck={deck} size={170} />
      </div>

      {/* Time readout */}
      <div className="mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-dim)" }}>
        <span>{fmtTime(ds.positionSec)}</span>
        <span style={{ color: "var(--text-faint)" }}>{fmtPitch(ds.pitch)}</span>
        <span>{fmtTime(ds.durationSec)}</span>
      </div>

      {/* EQ + pitch/volume */}
      <div
        style={{
          display: "flex",
          gap: 14,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: mirror ? "row-reverse" : "row",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "center" }}>
          <Knob id={`deck-${deck}-eq-high`} label="High" value={ds.eq.high} onChange={(v) => setEq(deck, "high", v)} color={accent} detent size={44} />
          <Knob id={`deck-${deck}-eq-mid`} label="Mid" value={ds.eq.mid} onChange={(v) => setEq(deck, "mid", v)} color={accent} detent size={44} />
          <Knob id={`deck-${deck}-eq-low`} label="Low" value={ds.eq.low} onChange={(v) => setEq(deck, "low", v)} color={accent} detent size={44} />
        </div>
        <div style={{ display: "flex", gap: 14 }}>
          <Fader id={`deck-${deck}-pitch`} value={ds.pitch} onChange={(v) => setPitch(deck, v)} axis="y" length={132} color={accent} label="Pitch" />
          <Fader id={`deck-${deck}-volume`} value={ds.volume} onChange={(v) => setVolume(deck, v)} axis="y" length={132} color={accent} label="Vol" />
        </div>
      </div>

      {/* Transport */}
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <PadButton id={`deck-${deck}-cue`} label="CUE" onPress={() => cue(deck)} color="var(--warn)" width={92} />
        <PadButton
          id={`deck-${deck}-play`}
          label={ds.playing ? "❚❚" : "▶"}
          onPress={() => togglePlay(deck)}
          active={ds.playing}
          color={accent}
          width={92}
        />
      </div>

      {ds.loading && (
        <div style={{ fontSize: 11, color: "var(--text-dim)", textAlign: "center" }}>Loading audio…</div>
      )}
    </div>
  );
}
