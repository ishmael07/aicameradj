/** Format seconds as m:ss. */
export function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Map pitch fader (0..1) to a ±percent string, 0.5 = 0.0%. */
export function fmtPitch(pitch: number, rangePct = 8): string {
  const pct = (pitch - 0.5) * 2 * rangePct;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}
