import type { MusicSource, SearchResult } from "./types";
import type { SourceInfo, Track } from "../types";

let counter = 0;

/**
 * Local file source. Doesn't search — the user drops/picks files and we wrap
 * them as Tracks backed by a Blob, decoded directly.
 */
export class LocalSource implements MusicSource {
  info(): SourceInfo {
    return {
      id: "local",
      label: "My Files",
      status: "ready",
      canSearch: false,
      statusDetail: "Drag & drop audio files onto a deck.",
    };
  }

  async search(): Promise<SearchResult> {
    return { tracks: [] };
  }

  async resolveStreamUrl(track: Track): Promise<string> {
    // Local tracks decode from their Blob, not a URL.
    if (track.file) return "";
    throw new Error("local track missing file");
  }

  /** Wrap a picked/dropped File into a Track. */
  static fromFile(file: File): Track {
    const id = `local:${counter++}:${file.name}`;
    const title = file.name.replace(/\.[^.]+$/, "");
    return {
      id,
      source: "local",
      title,
      artist: "Local file",
      artworkUrl: undefined,
      playable: true,
      file,
    };
  }
}
