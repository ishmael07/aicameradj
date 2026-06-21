import type { MusicSource, SearchResult } from "./types";
import type { SourceInfo, Track } from "../types";

/**
 * Vite injects env vars on `import.meta.env`, but the `vite/client` ambient
 * types may not be loaded here. Declare the minimal shape we rely on so the
 * file compiles under strict TS without those ambient types.
 */
interface ViteEnv {
  VITE_JAMENDO_CLIENT_ID?: string;
}
interface ViteImportMeta {
  env?: ViteEnv;
}

/** Read the build-time default Jamendo client id, guarding env access defensively. */
function defaultClientId(): string | undefined {
  const env = (import.meta as unknown as ViteImportMeta).env;
  const id = env?.VITE_JAMENDO_CLIENT_ID;
  return typeof id === "string" && id.length > 0 ? id : undefined;
}

const API_BASE = "https://api.jamendo.com/v3.0/tracks/";
const NEEDS_CONFIG_DETAIL =
  "Set VITE_JAMENDO_CLIENT_ID to enable Jamendo (free client id at developer.jamendo.com).";
const PAGE_SIZE = 40;

/** Per-track music metadata Jamendo returns when include=musicinfo is requested. */
interface JamendoMusicInfo {
  bpm?: number;
  key?: string;
  tags?: string[] | { genres?: string[]; instruments?: string[]; vartags?: string[] };
}

/** Shape of a single track object in the Jamendo /tracks response. */
interface JamendoTrack {
  id: string;
  name: string;
  artist_name: string;
  album_image?: string;
  image?: string;
  duration?: number;
  audio?: string;
  musicinfo?: JamendoMusicInfo;
}

/** Status block Jamendo wraps every response in; `status` is "success" or "failed". */
interface JamendoHeaders {
  status: string;
  code?: number;
  error_message?: string;
  results_count?: number;
}

/** Full envelope returned by the Jamendo /tracks endpoint. */
interface JamendoResponse {
  headers: JamendoHeaders;
  results: JamendoTrack[];
}

/**
 * Parse an opaque page token into a non-negative integer offset. Anything that
 * is not a clean non-negative integer string is treated as "no offset" (0), so
 * a malformed/foreign token degrades to the first page rather than throwing.
 */
function parseOffset(page: string | undefined): number {
  if (typeof page !== "string" || page.length === 0) return 0;
  const n = Number(page);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

/**
 * Jamendo source. Streams full-length Creative Commons tracks over Jamendo's
 * CORS-clean, Range-enabled audio host, so the returned MP3 URLs decode
 * directly via Web Audio's decodeAudioData.
 *
 * Requires a free client id (developer.jamendo.com), supplied either via the
 * constructor or the VITE_JAMENDO_CLIENT_ID build-time env var. Without one,
 * `info()` reports "needs-config" and `search()` throws.
 */
export class JamendoSource implements MusicSource {
  private readonly clientId: string | undefined;

  constructor(clientId?: string) {
    this.clientId = clientId ?? defaultClientId();
  }

  info(): SourceInfo {
    return {
      id: "jamendo",
      label: "Jamendo",
      status: this.clientId ? "ready" : "needs-config",
      canSearch: true,
      statusDetail: this.clientId
        ? "Free Creative Commons streaming, fully mixable."
        : NEEDS_CONFIG_DETAIL,
    };
  }

  async search(query: string, page?: string): Promise<SearchResult> {
    if (!this.clientId) {
      throw new Error(NEEDS_CONFIG_DETAIL);
    }
    const q = query.trim();
    if (!q) return { tracks: [] };

    const offset = parseOffset(page);
    const params = new URLSearchParams({
      client_id: this.clientId,
      format: "json",
      limit: String(PAGE_SIZE),
      offset: String(offset),
      search: q,
      audioformat: "mp32",
      include: "musicinfo licenses",
    });
    const url = `${API_BASE}?${params.toString()}`;

    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) {
      throw new Error(`jamendo ${res.status}`);
    }
    const json = (await res.json()) as JamendoResponse;
    if (json.headers?.status === "failed") {
      throw new Error(
        `jamendo: ${json.headers.error_message ?? "request failed"}`,
      );
    }

    const results = json.results ?? [];
    const tracks = results
      .filter((t) => typeof t.audio === "string" && t.audio.length > 0)
      .map((t) => this.toTrack(t));

    // Jamendo paginates by offset. A full page of results implies there may be
    // more; expose the next offset as the opaque page token. A short page means
    // we have reached the end, so omit `nextPage`.
    const result: SearchResult = { tracks };
    if (results.length >= PAGE_SIZE) {
      result.nextPage = String(offset + PAGE_SIZE);
    }
    return result;
  }

  private toTrack(t: JamendoTrack): Track {
    return {
      id: `jamendo:${t.id}`,
      source: "jamendo",
      title: t.name ?? "Untitled",
      artist: t.artist_name ?? "Unknown",
      artworkUrl: t.album_image || t.image || undefined,
      durationSec: typeof t.duration === "number" ? t.duration : undefined,
      bpm: this.extractBpm(t.musicinfo),
      musicalKey: this.extractKey(t.musicinfo),
      playable: true,
      // Jamendo's audio host is CORS-clean + Range-enabled, so this full-track
      // MP3 URL feeds decodeAudioData directly.
      streamUrl: t.audio,
    };
  }

  private extractBpm(info?: JamendoMusicInfo): number | undefined {
    const bpm = info?.bpm;
    return typeof bpm === "number" && Number.isFinite(bpm) ? bpm : undefined;
  }

  private extractKey(info?: JamendoMusicInfo): string | undefined {
    if (!info) return undefined;
    if (typeof info.key === "string" && info.key.length > 0) return info.key;
    // `tags` is sometimes a flat string[] and sometimes an object of arrays;
    // if it's a flat list, the first entry is the best key hint we have.
    if (Array.isArray(info.tags) && info.tags.length > 0) {
      const first = info.tags[0];
      if (typeof first === "string" && first.length > 0) return first;
    }
    return undefined;
  }

  async resolveStreamUrl(track: Track): Promise<string> {
    if (track.streamUrl) return track.streamUrl;
    throw new Error("jamendo track missing stream url");
  }
}
