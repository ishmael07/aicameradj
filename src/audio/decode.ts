import { analyze, guess } from "web-audio-beat-detector";

/**
 * Fetch + decode audio bytes into an AudioBuffer.
 * For URLs this requires the response to be CORS-clean (Audius/Jamendo/local
 * blob URLs all are). Throws on network or decode failure.
 */
export async function loadAudioBuffer(
  ctx: AudioContext,
  src: { streamUrl?: string; file?: Blob },
): Promise<AudioBuffer> {
  let arrayBuf: ArrayBuffer;
  if (src.file) {
    arrayBuf = await src.file.arrayBuffer();
  } else if (src.streamUrl) {
    const res = await fetch(src.streamUrl, { mode: "cors" });
    if (!res.ok) throw new Error(`stream fetch failed: ${res.status}`);
    arrayBuf = await res.arrayBuffer();
  } else {
    throw new Error("no audio source provided");
  }
  // decodeAudioData detaches the ArrayBuffer; that's fine, we don't reuse it.
  return await ctx.decodeAudioData(arrayBuf);
}

/**
 * Detect BPM (and first-beat offset) from a decoded buffer. Returns null on
 * failure (e.g. non-4/4 or noisy material).
 */
export async function detectBpm(
  buffer: AudioBuffer,
): Promise<{ bpm: number; offset: number } | null> {
  try {
    const { bpm, offset } = await guess(buffer);
    return { bpm, offset };
  } catch {
    try {
      const bpm = await analyze(buffer);
      return { bpm, offset: 0 };
    } catch {
      return null;
    }
  }
}
