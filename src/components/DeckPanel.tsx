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
 * Full controls for one deck: drop target + turntable + waveform + transport,
 * 3-band EQ, pitch fader, volume. Deck A is mirrored (controls on the right)
 * vs Deck B for a symmetric DJ layout via the `mirror` prop.
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

  const title = ds.track?.title ?? "No track";
  const artist = ds.track?.artist ?? "Drop a track or load from search";

  const eqColumn = (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center" }}>
      <Knob id={`deck-${deck}-eq-high`} label="High" value={ds.eq.high} onChange={(v) => setEq(deck, "high", v)} color={accent} detent />
      <Knob id={`deck-${deck}-eq-mid`} label="Mid" value={ds.eq.mid} onChange={(v) => setEq(deck, "mid", v)} color={accent} detent />
      <Knob id={`deck-${deck}-eq-low`} label="Low" value={ds.eq.low} onChange={(v) => setEq(deck, "low", v)} color={accent} detent />
    </div>
  );

  const faderColumn = (
    <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
      <Fader id={`deck-${deck}-pitch`} value={ds.pitch} onChange={(v) => setPitch(deck, v)} axis="y" length={150} color={accent} label="Pitch" />
      <Fader id={`deck-${deck}-volume`} value={ds.volume} onChange={(v) => setVolume(deck, v)} axis="y" length={150} color={accent} label="Vol" />
    </div>
  );

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
        flex: 1,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        borderColor: dragOver ? accent : undefined,
        boxShadow: dragOver ? `0 0 32px ${accent}` : undefined,
        transition: "box-shadow 0.15s ease, border-color 0.15s ease",
        minWidth: 0,
      }}
    >
      {/* Track header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, minHeight: 44 }}>
        <div
          style={{
            width: 6,
            height: 36,
            borderRadius: 3,
            background: accent,
            boxShadow: `0 0 12px ${accent}`,
          }}
        />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-dim)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {artist}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="mono" style={{ fontSize: 18, fontWeight: 700, color: accent }}>
            {ds.bpm ? ds.bpm : "––"} <span style={{ fontSize: 10, color: "var(--text-dim)" }}>BPM</span>
          </div>
          <div className="mono" style={{ fontSize: 11, color: "var(--text-dim)" }}>
            {fmtTime(ds.positionSec)} / {fmtTime(ds.durationSec)}
          </div>
        </div>
      </div>

      {!ds.track?.playable && ds.track?.unplayableReason && (
        <div style={{ fontSize: 11, color: "var(--warn)" }}>{ds.track.unplayableReason}</div>
      )}

      <Waveform deck={deck} />

      {/* Turntable + mixer columns */}
      <div
        style={{
          display: "flex",
          gap: 18,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: mirror ? "row-reverse" : "row",
        }}
      >
        {eqColumn}
        <Turntable deck={deck} />
        {faderColumn}
      </div>

      {/* Transport */}
      <div style={{ display: "flex", gap: 10, justifyContent: "center", alignItems: "center", flexWrap: "wrap" }}>
        <PadButton id={`deck-${deck}-cue`} label="CUE" onPress={() => cue(deck)} color="var(--warn)" />
        <PadButton
          id={`deck-${deck}-play`}
          label={ds.playing ? "❚❚ PAUSE" : "▶ PLAY"}
          onPress={() => togglePlay(deck)}
          active={ds.playing}
          color={accent}
          width={130}
        />
        <span className="mono" style={{ fontSize: 11, color: "var(--text-dim)", minWidth: 54, textAlign: "center" }}>
          {fmtPitch(ds.pitch)}
        </span>
      </div>

      {ds.loading && (
        <div style={{ fontSize: 11, color: "var(--text-dim)", textAlign: "center" }}>Loading audio…</div>
      )}
    </div>
  );
}
