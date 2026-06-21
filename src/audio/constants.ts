// Tuning constants for the audio engine. Centralized so the feel of the
// decks/EQ/crossfader can be adjusted in one place.

/** Pitch fader range, as a fraction. 0.08 => playbackRate spans 0.92..1.08. */
export const PITCH_RANGE = 0.08;

/** Smoothing time constant (seconds) for setTargetAtTime on most params. */
export const SMOOTH = 0.012;

/** Faster smoothing for scratch/jog so it feels immediate. */
export const SCRATCH_SMOOTH = 0.004;

// 3-band EQ filter frequencies (Hz).
export const EQ_LOW_FREQ = 250;
export const EQ_MID_FREQ = 1000;
export const EQ_MID_Q = 1.0;
export const EQ_HIGH_FREQ = 3500;

/** Max boost (dB) when an EQ knob is fully up. */
export const EQ_MAX_BOOST_DB = 12;
/** Cut (dB) when an EQ knob is fully down — effectively a kill. */
export const EQ_KILL_DB = -60;

/** Default loop length in beats when a beat-loop is triggered. */
export const DEFAULT_LOOP_BEATS = 4;
