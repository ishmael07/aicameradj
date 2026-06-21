import type { MusicSource, SearchResult } from "./types";
import type { SourceInfo, Track } from "../types";

/**
 * SoundCloud source — GATED placeholder provider.
 *
 * As of mid-2026 a pure browser app cannot decode SoundCloud audio:
 *  - API credentials require a paid SoundCloud Artist Pro subscription.
 *  - Streaming moved to HLS (no progressive MP3) and stream URLs require an
 *    OAuth `Authorization` header, then resolve to short-lived signed CDN URLs
 *    that 403 within seconds and are not CORS-enabled — so `decodeAudioData`
 *    (and an <audio> element) cannot consume them from the browser.
 *
 * The only viable path is a backend proxy that authenticates with SoundCloud,
 * follows the HLS/302 chain server-side, and re-exposes a CORS-clean,
 * Range-enabled stream. This class therefore stays inert until a proxy base URL
 * is configured, but it still appears in the UI (with `canSearch: true`) and
 * explains exactly why it is unavailable. When a proxy is wired up it lights up
 * automatically: search and stream resolution both route through the proxy.
 */

/** Per-track entry returned by the optional backend proxy's `/search`. */
interface ProxyTrack {
  id: string | number;
  title?: string;
  user?: string;
  artworkUrl?: string;
  /** Duration in milliseconds, matching SoundCloud's convention. */
  duration?: number;
  /** Proxy-relative path (e.g. "/stream/123") to fetch decodable audio. */
  streamPath?: string;
}

/** Shape the backend proxy is expected to return from `/search`. */
interface ProxySearchResponse {
  tracks?: ProxyTrack[];
  nextPage?: string;
}

/** Optional construction config for {@link SoundCloudSource}. */
export interface SoundCloudConfig {
  /** Base URL of a backend proxy that fronts the SoundCloud API. */
  proxyBaseUrl?: string;
}

/**
 * Read a Vite env var without requiring the `vite/client` ambient types.
 * Guards every access so the module compiles under strict TS even when
 * `import.meta.env` is untyped or absent (e.g. in unit tests / SSR).
 */
function readEnv(key: string): string | undefined {
  try {
    const meta = import.meta as unknown as {
      env?: Record<string, string | undefined>;
    };
    const value = meta.env?.[key];
    return typeof value === "string" && value.length > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

export class SoundCloudSource implements MusicSource {
  private readonly proxyBaseUrl?: string;

  constructor(config: SoundCloudConfig = {}) {
    // Explicit config wins; otherwise fall back to the build-time env var.
    const fromEnv = readEnv("VITE_SOUNDCLOUD_PROXY_URL");
    const raw = config.proxyBaseUrl ?? fromEnv;
    // Normalize: drop a trailing slash so path joins are predictable.
    this.proxyBaseUrl = raw ? raw.replace(/\/+$/, "") : undefined;
  }

  info(): SourceInfo {
    if (this.proxyBaseUrl) {
      return {
        id: "soundcloud",
        label: "SoundCloud",
        status: "ready",
        canSearch: true,
        statusDetail: "Streaming via configured backend proxy.",
      };
    }
    return {
      id: "soundcloud",
      label: "SoundCloud",
      status: "unavailable",
      canSearch: true,
      statusDetail:
        "Needs a backend proxy + SoundCloud Artist Pro API credentials. " +
        "SoundCloud streams are HLS behind short-lived, signed, CORS-blocked " +
        "URLs that can't be decoded directly in the browser.",
    };
  }

  async search(query: string, page?: string): Promise<SearchResult> {
    if (!this.proxyBaseUrl) {
      throw new Error(
        "SoundCloud search requires a configured backend proxy. Set " +
          "VITE_SOUNDCLOUD_PROXY_URL (or pass { proxyBaseUrl }) to a proxy " +
          "that holds SoundCloud Artist Pro credentials — the browser cannot " +
          "reach the SoundCloud API or decode its HLS streams directly.",
      );
    }

    const trimmed = query.trim();
    if (!trimmed) return { tracks: [] };

    const params = new URLSearchParams({ q: trimmed });
    if (page) params.set("page", page);
    const url = `${this.proxyBaseUrl}/search?${params.toString()}`;

    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) {
      throw new Error(`SoundCloud proxy search failed (${res.status})`);
    }
    const json = (await res.json()) as ProxySearchResponse;

    const tracks = (json.tracks ?? [])
      .map((t) => this.toTrack(t))
      .filter((t): t is Track => t !== null);
    return { tracks, nextPage: json.nextPage };
  }

  /** Map a proxy track row to a domain Track. Returns null if unusable. */
  private toTrack(t: ProxyTrack): Track | null {
    const base = this.proxyBaseUrl;
    if (!base || !t.streamPath) return null;
    const id = String(t.id);
    // streamPath may be absolute or proxy-relative; only prefix relatives.
    const streamUrl = /^https?:\/\//i.test(t.streamPath)
      ? t.streamPath
      : `${base}${t.streamPath.startsWith("/") ? "" : "/"}${t.streamPath}`;
    return {
      id: `soundcloud:${id}`,
      source: "soundcloud",
      title: t.title ?? "Untitled",
      artist: t.user ?? "Unknown",
      artworkUrl: t.artworkUrl,
      // Proxy reports duration in ms; convert to seconds.
      durationSec:
        typeof t.duration === "number" ? Math.round(t.duration / 1000) : undefined,
      // Only the proxy can deliver decodable audio, so playability tracks it.
      playable: true,
      streamUrl,
    };
  }

  async resolveStreamUrl(track: Track): Promise<string> {
    if (!this.proxyBaseUrl) {
      throw new Error(
        track.unplayableReason ??
          "SoundCloud playback requires a configured backend proxy " +
            "(VITE_SOUNDCLOUD_PROXY_URL). Browser-only decoding of SoundCloud " +
            "HLS streams is not possible.",
      );
    }
    if (!track.playable || !track.streamUrl) {
      throw new Error(
        track.unplayableReason ?? "SoundCloud track has no resolvable stream URL.",
      );
    }
    // The proxy URL is CORS-clean and Range-enabled; use it as-is. The proxy
    // performs the OAuth + HLS/302 dance server-side and streams bytes back.
    return track.streamUrl;
  }
}
