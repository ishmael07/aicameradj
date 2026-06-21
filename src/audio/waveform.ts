/**
 * Extract min/max peaks per pixel column from an AudioBuffer for waveform
 * rendering. Computed once after decode and cached.
 */
export interface WaveformPeaks {
  /** Number of columns. */
  length: number;
  /** Interleaved [min0, max0, min1, max1, ...] in -1..1. */
  data: Float32Array;
}

export function extractPeaks(buffer: AudioBuffer, columns = 2000): WaveformPeaks {
  const chan = buffer.getChannelData(0);
  const samplesPerColumn = Math.max(1, Math.floor(chan.length / columns));
  const data = new Float32Array(columns * 2);
  for (let c = 0; c < columns; c++) {
    const start = c * samplesPerColumn;
    const end = Math.min(chan.length, start + samplesPerColumn);
    let min = 1.0;
    let max = -1.0;
    for (let i = start; i < end; i++) {
      const v = chan[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (start >= end) {
      min = 0;
      max = 0;
    }
    data[c * 2] = min;
    data[c * 2 + 1] = max;
  }
  return { length: columns, data };
}
