import { AudiusSource } from "./audius";
import { JamendoSource } from "./jamendo";
import { LocalSource } from "./local";
import { SoundCloudSource } from "./soundcloud";
import type { MusicSource } from "./types";
import type { SourceId } from "../types";

export { LocalSource } from "./local";
export type { MusicSource, SearchResult } from "./types";

/**
 * Registry of all music sources. Order here is the order tabs appear in the UI.
 * Audius and Local are ready out of the box; Jamendo needs a free client id;
 * SoundCloud needs a backend proxy.
 */
export function createSources(): Record<SourceId, MusicSource> {
  return {
    audius: new AudiusSource(),
    jamendo: new JamendoSource(),
    soundcloud: new SoundCloudSource(),
    local: new LocalSource(),
  };
}

export const SOURCE_ORDER: SourceId[] = [
  "audius",
  "jamendo",
  "soundcloud",
  "local",
];
