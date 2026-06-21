import { create } from "zustand";
import { AudioEngine } from "./audio/AudioEngine";
import { loadAudioBuffer, detectBpm } from "./audio/decode";
import { extractPeaks, type WaveformPeaks } from "./audio/waveform";
import { createSources, SOURCE_ORDER } from "./sources";
import type { MusicSource } from "./sources";
import type {
  DeckId,
  DeckState,
  EqValues,
  SampleKind,
  SamplerPad,
  SourceId,
  SourceInfo,
  Track,
} from "./types";

const SAMPLER_PADS: SamplerPad[] = [
  { id: 0, label: "Air Horn", kind: "airhorn", color: "#ff5d73" },
  { id: 1, label: "Explosion", kind: "explosion", color: "#ff9f1c" },
  { id: 2, label: "Siren", kind: "siren", color: "#ffd166" },
  { id: 3, label: "Scratch", kind: "scratch", color: "#06d6a0" },
  { id: 4, label: "Kick", kind: "kick", color: "#4cc9f0" },
  { id: 5, label: "Snare", kind: "snare", color: "#4895ef" },
  { id: 6, label: "Hey!", kind: "vocalHey", color: "#b5179e" },
  { id: 7, label: "Laser", kind: "laser", color: "#7209b7" },
];

function freshDeck(id: DeckId): DeckState {
  return {
    id,
    track: null,
    loading: false,
    ready: false,
    playing: false,
    positionSec: 0,
    durationSec: 0,
    bpm: null,
    pitch: 0.5,
    volume: 0.85,
    eq: { low: 0.5, mid: 0.5, high: 0.5 },
    cuePoint: 0,
    looping: false,
  };
}

// Per-deck waveform peaks live outside React state (large typed arrays).
const peaksCache: Record<DeckId, WaveformPeaks | null> = { a: null, b: null };
export function getDeckPeaks(deck: DeckId): WaveformPeaks | null {
  return peaksCache[deck];
}

interface AppState {
  engine: AudioEngine | null;
  audioReady: boolean;
  sources: Record<SourceId, MusicSource> | null;
  sourceInfos: SourceInfo[];
  activeSource: SourceId;

  decks: Record<DeckId, DeckState>;
  crossfade: number;
  masterLevel: number;

  // Library / search
  searchQuery: string;
  searchResults: Track[];
  searching: boolean;
  searchError: string | null;
  localTracks: Track[];

  pads: SamplerPad[];

  // ---- actions ----
  init: () => void;
  setActiveSource: (id: SourceId) => void;
  runSearch: (query: string) => Promise<void>;
  addLocalFiles: (files: FileList | File[]) => void;

  loadTrackToDeck: (deck: DeckId, track: Track) => Promise<void>;
  togglePlay: (deck: DeckId) => void;
  cue: (deck: DeckId) => void;
  seek: (deck: DeckId, posSec: number) => void;
  setPitch: (deck: DeckId, pitch: number) => void;
  setVolume: (deck: DeckId, vol: number) => void;
  setEq: (deck: DeckId, band: keyof EqValues, value: number) => void;
  nudge: (deck: DeckId, direction: 1 | -1) => void;
  scratch: (deck: DeckId, rate: number | null) => void;

  setCrossfade: (value: number) => void;
  triggerPad: (kind: SampleKind) => void;

  syncFromEngine: () => void;
}

export const useStore = create<AppState>((set, get) => ({
  engine: null,
  audioReady: false,
  sources: null,
  sourceInfos: [],
  activeSource: "audius",

  decks: { a: freshDeck("a"), b: freshDeck("b") },
  crossfade: 0.5,
  masterLevel: 0,

  searchQuery: "",
  searchResults: [],
  searching: false,
  searchError: null,
  localTracks: [],

  pads: SAMPLER_PADS,

  init: () => {
    if (get().engine) return;
    const engine = new AudioEngine();
    const sources = createSources();
    const sourceInfos = SOURCE_ORDER.map((id) => sources[id].info());
    // Hook deck end -> reflect stopped state.
    (["a", "b"] as DeckId[]).forEach((d) => {
      engine.decks[d].onEnded = () => {
        set((s) => ({
          decks: { ...s.decks, [d]: { ...s.decks[d], playing: false } },
        }));
      };
    });
    set({ engine, sources, sourceInfos });
  },

  setActiveSource: (id) => set({ activeSource: id, searchError: null }),

  runSearch: async (query) => {
    const { sources, activeSource } = get();
    set({ searchQuery: query, searchError: null });
    if (!sources) return;
    const source = sources[activeSource];
    if (!source.info().canSearch) {
      set({ searchResults: [], searchError: "This source has no search." });
      return;
    }
    if (!query.trim()) {
      set({ searchResults: [] });
      return;
    }
    set({ searching: true });
    try {
      const { tracks } = await source.search(query);
      set({ searchResults: tracks, searching: false });
    } catch (err) {
      set({
        searching: false,
        searchResults: [],
        searchError: err instanceof Error ? err.message : String(err),
      });
    }
  },

  addLocalFiles: (files) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|flac|aac)$/i.test(f.name));
    if (!arr.length) return;
    // LocalSource.fromFile is static; import lazily to avoid cycle noise.
    import("./sources").then(({ LocalSource }) => {
      const tracks = arr.map((f) => LocalSource.fromFile(f));
      set((s) => ({ localTracks: [...tracks, ...s.localTracks] }));
    });
  },

  loadTrackToDeck: async (deck, track) => {
    const { engine } = get();
    if (!engine) return;
    if (!track.playable) {
      set((s) => ({
        decks: {
          ...s.decks,
          [deck]: { ...s.decks[deck], track },
        },
      }));
      return;
    }
    await engine.resume();
    set((s) => ({
      decks: {
        ...s.decks,
        [deck]: { ...freshDeck(deck), track, loading: true },
      },
    }));
    peaksCache[deck] = null;
    try {
      const sources = get().sources;
      let streamUrl = track.streamUrl;
      if (sources && !track.file) {
        streamUrl = await sources[track.source].resolveStreamUrl(track);
      }
      const buffer = await loadAudioBuffer(engine.ctx, {
        streamUrl,
        file: track.file,
      });
      engine.decks[deck].load(buffer);
      peaksCache[deck] = extractPeaks(buffer);
      // Apply current deck UI values to the freshly loaded engine deck.
      const ds = get().decks[deck];
      engine.decks[deck].setEq(ds.eq);
      engine.decks[deck].setPitch(ds.pitch);
      engine.setVolume(deck, ds.volume);

      set((s) => ({
        decks: {
          ...s.decks,
          [deck]: {
            ...s.decks[deck],
            loading: false,
            ready: true,
            durationSec: buffer.duration,
            bpm: track.bpm ?? null,
          },
        },
      }));

      // BPM detection if the source didn't provide it.
      if (track.bpm == null) {
        detectBpm(buffer).then((res) => {
          if (res && get().decks[deck].track?.id === track.id) {
            set((s) => ({
              decks: {
                ...s.decks,
                [deck]: { ...s.decks[deck], bpm: Math.round(res.bpm) },
              },
            }));
          }
        });
      }
    } catch (err) {
      set((s) => ({
        decks: {
          ...s.decks,
          [deck]: {
            ...s.decks[deck],
            loading: false,
            ready: false,
            track: {
              ...track,
              playable: false,
              unplayableReason:
                err instanceof Error ? err.message : "Failed to load audio",
            },
          },
        },
      }));
    }
  },

  togglePlay: (deck) => {
    const { engine } = get();
    if (!engine) return;
    const ed = engine.decks[deck];
    if (!ed.hasTrack) return;
    void engine.resume();
    ed.togglePlay();
    set((s) => ({
      decks: { ...s.decks, [deck]: { ...s.decks[deck], playing: ed.playing } },
    }));
  },

  cue: (deck) => {
    const { engine } = get();
    if (!engine) return;
    void engine.resume();
    engine.decks[deck].cue();
    set((s) => ({
      decks: {
        ...s.decks,
        [deck]: { ...s.decks[deck], playing: engine.decks[deck].playing },
      },
    }));
  },

  seek: (deck, posSec) => {
    const { engine } = get();
    if (!engine) return;
    engine.decks[deck].seek(posSec);
  },

  setPitch: (deck, pitch) => {
    const { engine } = get();
    engine?.decks[deck].setPitch(pitch);
    set((s) => ({
      decks: { ...s.decks, [deck]: { ...s.decks[deck], pitch } },
    }));
  },

  setVolume: (deck, vol) => {
    const { engine } = get();
    engine?.setVolume(deck, vol);
    set((s) => ({
      decks: { ...s.decks, [deck]: { ...s.decks[deck], volume: vol } },
    }));
  },

  setEq: (deck, band, value) => {
    const { engine } = get();
    set((s) => {
      const eq = { ...s.decks[deck].eq, [band]: value };
      engine?.decks[deck].setEq(eq);
      return { decks: { ...s.decks, [deck]: { ...s.decks[deck], eq } } };
    });
  },

  nudge: (deck, direction) => {
    const { engine } = get();
    if (!engine) return;
    const ed = engine.decks[deck];
    if (!ed.playing) return;
    // Brief rate bump to push the track forward/back for beatmatching.
    ed.setScratchRate(1 + direction * 0.06);
    window.setTimeout(() => ed.endScratch(), 120);
  },

  scratch: (deck, rate) => {
    const { engine } = get();
    if (!engine) return;
    if (rate === null) engine.decks[deck].endScratch();
    else engine.decks[deck].setScratchRate(rate);
  },

  setCrossfade: (value) => {
    const { engine } = get();
    engine?.setCrossfade(value);
    set({ crossfade: value });
  },

  triggerPad: (kind) => {
    const { engine } = get();
    if (!engine) return;
    void engine.resume();
    engine.triggerSample(kind);
  },

  syncFromEngine: () => {
    const { engine } = get();
    if (!engine) return;
    const level = engine.getMasterLevel();
    set((s) => {
      const a = engine.decks.a;
      const b = engine.decks.b;
      return {
        masterLevel: level,
        decks: {
          a: {
            ...s.decks.a,
            positionSec: a.positionSec,
            playing: a.playing,
          },
          b: {
            ...s.decks.b,
            positionSec: b.positionSec,
            playing: b.playing,
          },
        },
      };
    });
  },
}));
