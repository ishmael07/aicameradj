import type { SourceInfo, Track } from "../types";

export interface SearchResult {
  tracks: Track[];
  /** Opaque token for the next page, if the source paginates. */
  nextPage?: string;
}

/**
 * A music source provider. Implementations must be safe to construct eagerly;
 * network work happens only in `search`/`resolveStreamUrl`.
 */
export interface MusicSource {
  info(): SourceInfo;
  /**
   * Free-text search. Sources that don't support search (local) should set
   * `info().canSearch = false` and may throw if called.
   */
  search(query: string, page?: string): Promise<SearchResult>;
  /**
   * Some sources hand back a track whose `streamUrl` must be resolved lazily
   * (e.g. a redirecting endpoint). Default: return track.streamUrl unchanged.
   * Throws if the track cannot be made playable.
   */
  resolveStreamUrl(track: Track): Promise<string>;
}
