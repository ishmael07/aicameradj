import type { MusicSource, SearchResult } from "./types";
import type { SourceInfo, Track } from "../types";

/**
 * Audius source. Free, no API key for read/stream.
 *
 * Flow:
 *  1. Discover a healthy content node from the public host list.
 *  2. Search: GET {host}/v1/tracks/search?query=...&app_name=...
 *  3. Stream: GET {host}/v1/tracks/{id}/stream  -> 302 to a CORS-clean,
 *     Range-enabled 320kbps MP3 that decodeAudioData can consume.
 *
 * Reliability: content nodes are decentralized and intermittently 5xx, so we
 * keep a list of hosts and fail over.
 */

const APP_NAME = "AICameraDJ";
const HOST_DISCOVERY = "https://api.audius.co";
// Fallback hosts in case discovery itself fails.
const FALLBACK_HOSTS = [
  "https://discoveryprovider.audius.co",
  "https://discoveryprovider2.audius.co",
  "https://discoveryprovider3.audius.co",
];

interface AudiusArtwork {
  ["150x150"]?: string;
  ["480x480"]?: string;
  ["1000x1000"]?: string;
}

interface AudiusUser {
  name?: string;
  handle?: string;
}

interface AudiusTrack {
  id: string;
  title: string;
  user?: AudiusUser;
  duration?: number;
  artwork?: AudiusArtwork | null;
  bpm?: number | null;
  musical_key?: string | null;
  is_streamable?: boolean;
  is_stream_gated?: boolean;
}

export class AudiusSource implements MusicSource {
  private hosts: string[] = [];
  private hostIdx = 0;

  info(): SourceInfo {
    return {
      id: "audius",
      label: "Audius",
      status: "ready",
      canSearch: true,
      statusDetail: "Free streaming, fully mixable.",
    };
  }

  private async ensureHosts(): Promise<string[]> {
    if (this.hosts.length) return this.hosts;
    try {
      const res = await fetch(HOST_DISCOVERY, { mode: "cors" });
      if (res.ok) {
        const json = (await res.json()) as { data?: string[] };
        if (Array.isArray(json.data) && json.data.length) {
          // Shuffle-free but rotate start by picking a few.
          this.hosts = json.data.slice(0, 8);
        }
      }
    } catch {
      // fall through to fallback
    }
    if (!this.hosts.length) this.hosts = [...FALLBACK_HOSTS];
    return this.hosts;
  }

  /** Try a request against hosts in rotation until one succeeds. */
  private async withHost<T>(
    path: (host: string) => string,
    parse: (res: Response) => Promise<T>,
  ): Promise<T> {
    const hosts = await this.ensureHosts();
    let lastErr: unknown = new Error("no audius hosts");
    for (let i = 0; i < hosts.length; i++) {
      const host = hosts[(this.hostIdx + i) % hosts.length];
      try {
        const res = await fetch(path(host), { mode: "cors" });
        if (!res.ok) {
          lastErr = new Error(`audius ${res.status}`);
          continue;
        }
        // Stick to the host that worked.
        this.hostIdx = (this.hostIdx + i) % hosts.length;
        return await parse(res);
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr;
  }

  async search(query: string): Promise<SearchResult> {
    const q = encodeURIComponent(query.trim());
    if (!q) return { tracks: [] };
    const json = await this.withHost<{ data?: AudiusTrack[] }>(
      (host) =>
        `${host}/v1/tracks/search?query=${q}&app_name=${APP_NAME}&limit=40`,
      (res) => res.json() as Promise<{ data?: AudiusTrack[] }>,
    );
    const tracks = (json.data ?? [])
      .filter((t) => t.is_streamable !== false)
      .map((t) => this.toTrack(t));
    return { tracks };
  }

  private toTrack(t: AudiusTrack): Track {
    const gated = t.is_stream_gated === true;
    const host = this.hosts[this.hostIdx] ?? FALLBACK_HOSTS[0];
    return {
      id: `audius:${t.id}`,
      source: "audius",
      title: t.title ?? "Untitled",
      artist: t.user?.name ?? t.user?.handle ?? "Unknown",
      artworkUrl: t.artwork?.["480x480"] ?? t.artwork?.["150x150"],
      durationSec: t.duration ?? undefined,
      bpm: t.bpm ?? undefined,
      musicalKey: t.musical_key ?? undefined,
      playable: !gated,
      unplayableReason: gated ? "Stream-gated on Audius" : undefined,
      // Stream endpoint resolves (302) to the actual MP3; fetch follows it.
      streamUrl: gated
        ? undefined
        : `${host}/v1/tracks/${t.id}/stream?app_name=${APP_NAME}`,
    };
  }

  async resolveStreamUrl(track: Track): Promise<string> {
    if (!track.playable || !track.streamUrl) {
      throw new Error(track.unplayableReason ?? "track not playable");
    }
    // The /stream endpoint 302-redirects; fetch() follows redirects and the
    // final CDN response is CORS-clean, so the URL is used as-is.
    return track.streamUrl;
  }
}
