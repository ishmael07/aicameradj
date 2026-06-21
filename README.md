# 🎛️ AI Camera DJ

Mix two tracks **on camera, with your hands**. A live glassmorphism DJ deck appears over your webcam feed; raise a hand, pinch to grab knobs and faders, and DJ — two turntables, crossfader, 3‑band EQ, pitch, BPM, scrolling waveforms, and an 8‑pad sampler. Every control also works with mouse + keyboard, so you're never fighting the tracking.

> Runs entirely in your browser (Chrome on macOS recommended). Camera, hand‑tracking, and all audio are 100% client‑side — no servers, no data leaves your machine.

---

## ✨ Features

- **Hand control** — MediaPipe hand tracking maps your index finger to a cursor; **pinch** (thumb + index) to grab a knob/fader or trigger a button/pad.
- **Two decks** — spinning vinyl turntables with artwork labels, scratch by dragging the platter (or with your hand), nudge with the scroll wheel.
- **Real mixing** — equal‑power crossfader, per‑deck volume, pitch fader (±8%, vinyl‑style so it scratches naturally), 3‑band EQ with kill.
- **Waveforms** — scrolling Serato/rekordbox‑style waveform with a fixed playhead, beat markers, click/drag to scrub.
- **BPM** — provided by the source when available (Audius), otherwise detected from the audio.
- **8‑pad sampler** — air horn, explosion, siren, scratch, kick, snare, "hey!", laser, and more — all **synthesized in code** (no audio files to ship). Trigger by click, pinch, or number keys **1–8**.
- **Music sources**
  - **Audius** ✅ free, no setup, fully mixable (search + full‑track streaming).
  - **My Files** ✅ drag & drop your own mp3/wav/etc onto a deck.
  - **Jamendo** ⚙️ optional — free Creative Commons catalog (needs a free client id).
  - **SoundCloud** 🔒 shown but gated — see [SoundCloud note](#soundcloud) below.

---

## 🚀 Quick start

You need [Node.js](https://nodejs.org) 18+ (you said you have it).

```bash
git clone https://github.com/ishmael07/aicameradj
cd aicameradj
npm install

# One-time: download the MediaPipe hand model into public/models/
npm run setup:model      # see "Hand model" below if this script isn't present

npm run dev
```

Then open **http://localhost:5173** in **Chrome**, click **Enable Camera**, and allow camera access. (Camera + microphone APIs require a secure context — `localhost` counts, so no HTTPS setup needed.)

### Hand model

The hand‑tracking model file is not committed (it's a binary blob). Download it once into `public/models/`:

```bash
mkdir -p public/models
curl -L -o public/models/hand_landmarker.task \
  https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task
```

The WASM runtime is loaded from a pinned jsDelivr CDN at runtime (no download needed). If you'd rather fully self‑host it, see `src/vision/HandTracker.ts` (`WASM_BASE`).

---

## 🎚️ How to play

| Action | Hand gesture | Mouse / keyboard |
|---|---|---|
| Move cursor | Point your index finger | Move mouse |
| Grab a knob/fader | **Pinch** over it, move, release | Click‑drag |
| Trigger button / sampler pad | **Pinch** over it | Click, or keys **1–8** |
| Scratch a deck | (drag platter — mouse for now) | Drag the turntable |
| Nudge / beat‑match | — | Scroll wheel over the platter |
| Load a track | — | Drag a result onto a deck, or **Load A / Load B** |
| Reset a knob to center | — | Double‑click the knob |

Tips: good, even lighting and keeping your hand within frame make tracking much smoother. Both hands are tracked, so you can grab two controls at once.

---

## 🎵 Music sources & licensing

- **Audius** and **Jamendo** stream full tracks that are decoded locally for true mixing (scratch, EQ, BPM, waveform). Audius is independent/electronic‑leaning artist uploads — not Top‑40. Jamendo is Creative Commons.
- **Local files** are fully mixable and the best way to play tracks you already own.
- Respect each platform's terms. Jamendo's free API tier is **non‑commercial** and asks for artist + Jamendo attribution.

### SoundCloud

SoundCloud is intentionally **present but disabled**. As of 2026, the SoundCloud API requires a **paid Artist Pro subscription**, streams via **HLS behind short‑lived, signed, CORS‑blocked URLs**, and needs an OAuth header — none of which a pure browser app can consume. Lighting it up requires a small **backend proxy** that authenticates with SoundCloud and re‑streams CORS‑clean audio; the app already has a `SoundCloudSource` provider that activates automatically when you set `VITE_SOUNDCLOUD_PROXY_URL`. (Apps like Transitions DJ work exactly this way — with a server + paid account.)

---

## ⚙️ Optional config

Copy `.env.example` to `.env` and fill in what you want:

```bash
cp .env.example .env
```

- `VITE_JAMENDO_CLIENT_ID` — free at [developer.jamendo.com](https://developer.jamendo.com).
- `VITE_SOUNDCLOUD_PROXY_URL` — base URL of your SoundCloud proxy (advanced).

---

## 🧱 Architecture

```
src/
  audio/        Web Audio engine — Deck (AudioBufferSourceNode + EQ), AudioEngine
                (crossfader/master/analyser), code-synthesized sampler, decode + BPM, waveform peaks
  vision/       MediaPipe HandLandmarker in a Web Worker + gesture math (pinch, classify)
  control/      Maps the hand cursor + pinch onto registered UI controls (knobs/faders/buttons)
  sources/      Pluggable music providers: Audius, Jamendo, SoundCloud (gated), Local
  components/    Glassmorphism UI: Turntable, Waveform, Mixer, DeckPanel, SamplerPads, MusicBrowser, CameraOverlay
  store.ts      Zustand store wiring engine + sources + decks together
```

**Audio:** each deck decodes once into a reusable `AudioBuffer`; a fresh `AudioBufferSourceNode` is created per play/cue/scratch. `playbackRate` drives pitch and scratch (vinyl‑style — pitch and tempo move together, which is what makes scratching feel right). Signal chain: `source → low/mid/high BiquadFilter → trim → channel volume → equal‑power crossfader → master → analyser → output`.

**Vision:** `getUserMedia` → `ImageBitmap` per frame → Web Worker running `HandLandmarker.detectForVideo` → 21 landmarks → mirrored to display space → pinch/gesture classification with hysteresis → cursor + control hit‑testing.

---

## 🛠️ Scripts

```bash
npm run dev         # Vite dev server (localhost:5173)
npm run build       # type-check + production build
npm run preview     # preview the production build
npm run typecheck   # tsc --noEmit
```

---

## 📋 Notes & limitations

- Best in **Chrome** on a machine with a GPU (the hand model uses the WebGL GPU delegate).
- Gesture control of fine values is inherently a little jittery — that's why every control also works with mouse/keyboard.
- "Key lock" (independent tempo/pitch) is a future enhancement; v1 uses authentic vinyl‑style pitch.
- Built as a personal/hobby project. Mix responsibly and mind each music source's terms.
