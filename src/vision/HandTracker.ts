import HandWorker from "./handWorker?worker";
import { classifyGesture, INDEX_TIP, PinchLatch, pinchStrength } from "./gestures";
import type {
  HandFrame,
  Handedness,
  Landmark,
  VisionFrame,
  WorkerInMessage,
  WorkerOutMessage,
} from "./types";

const WASM_BASE =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";

// Default to the official CDN model so the app works with ZERO setup. A
// self-hosted copy at /models/hand_landmarker.task is tried first (instant if
// present, e.g. after `npm run setup:model`), otherwise we fall back to the CDN.
const LOCAL_MODEL_PATH = "/models/hand_landmarker.task";
const CDN_MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task";

/**
 * Camera/tracking lifecycle phases. The camera is LIVE (video visible) as soon
 * as `phase === "live"`, independent of whether hand tracking is working —
 * tracking is a best-effort layer that can fail without hiding the camera.
 */
export type CameraPhase = "idle" | "starting" | "live" | "denied" | "error";

export interface CameraState {
  phase: CameraPhase;
  /** Hand tracking is actively producing frames. */
  tracking: boolean;
  /** Why tracking is unavailable, if it failed (camera still works). */
  trackingError: string | null;
  /** Camera error detail (when phase === "denied" | "error"). */
  detail: string | null;
}

export interface HandTrackerOptions {
  numHands?: number;
  onFrame: (frame: VisionFrame) => void;
  onState?: (state: CameraState) => void;
}

/**
 * Owns the camera stream + (best-effort) vision worker.
 *
 * Crucially, the camera display is DECOUPLED from hand tracking: we attach and
 * play the stream first and report phase "live" immediately, then attempt to
 * spin up the MediaPipe worker. If the model/worker fails to load, the camera
 * keeps running and we only set `trackingError`.
 *
 * Mirroring: the preview is shown mirrored (CSS scaleX(-1)), so we flip model x
 * to xDisplay = 1 - x and flip the handedness label to match what the user sees.
 */
export class HandTracker {
  readonly video: HTMLVideoElement;
  private worker: Worker | null = null;
  private stream: MediaStream | null = null;
  private rafId = 0;
  private cameraLive = false;
  private tracking = false;
  private busy = false;
  private lastVideoTime = -1;

  private state: CameraState = {
    phase: "idle",
    tracking: false,
    trackingError: null,
    detail: null,
  };

  private readonly numHands: number;
  private readonly onFrame: (frame: VisionFrame) => void;
  private readonly onState?: (state: CameraState) => void;

  // One latch per hand index slot (left/right rarely swap mid-gesture).
  private readonly latches: PinchLatch[] = [new PinchLatch(), new PinchLatch()];

  constructor(opts: HandTrackerOptions) {
    this.numHands = opts.numHands ?? 2;
    this.onFrame = opts.onFrame;
    this.onState = opts.onState;
    this.video = document.createElement("video");
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.autoplay = true;
  }

  private emit(patch: Partial<CameraState>): void {
    this.state = { ...this.state, ...patch };
    this.onState?.(this.state);
  }

  async start(): Promise<void> {
    if (this.cameraLive || this.state.phase === "starting") return;
    this.emit({ phase: "starting", detail: null, trackingError: null });

    // 1) Camera first — this is what gates the visible video.
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, frameRate: 30, facingMode: "user" },
        audio: false,
      });
    } catch (err) {
      const denied =
        err instanceof DOMException &&
        (err.name === "NotAllowedError" || err.name === "SecurityError");
      this.emit({ phase: denied ? "denied" : "error", detail: String(err) });
      return;
    }

    this.video.srcObject = this.stream;
    try {
      await this.video.play();
    } catch {
      // Some browsers resolve play() late; the element still renders frames.
      // Don't fail the camera over a play() rejection.
    }

    this.cameraLive = true;
    this.emit({ phase: "live", tracking: false });

    // 2) Tracking second — best effort, never blocks/hides the camera.
    void this.startTracking();
  }

  private async startTracking(): Promise<void> {
    try {
      // Prefer a self-hosted model if it exists; otherwise use the CDN.
      const modelAssetPath = (await urlExists(LOCAL_MODEL_PATH))
        ? LOCAL_MODEL_PATH
        : CDN_MODEL_PATH;

      this.worker = new HandWorker();
      this.worker.onmessage = (ev: MessageEvent<WorkerOutMessage>) =>
        this.handleWorkerMessage(ev.data);
      this.worker.onerror = (e) => {
        this.emit({ tracking: false, trackingError: e.message || "worker error" });
      };
      const initMsg: WorkerInMessage = {
        type: "init",
        modelAssetPath,
        wasmBasePath: WASM_BASE,
        numHands: this.numHands,
      };
      this.worker.postMessage(initMsg);
    } catch (err) {
      this.emit({ tracking: false, trackingError: String(err) });
    }
  }

  private handleWorkerMessage(msg: WorkerOutMessage): void {
    if (msg.type === "ready") {
      this.tracking = true;
      this.emit({ tracking: true, trackingError: null });
      this.loop();
      return;
    }
    if (msg.type === "error") {
      // Tracking failed — keep the camera alive, surface a soft error.
      this.busy = false;
      this.emit({ tracking: this.tracking, trackingError: msg.message });
      return;
    }
    // result
    this.busy = false;
    const raw = msg.frame;
    const hands: HandFrame[] = raw.hands.map((h, i) => {
      // Mirror landmarks into display space.
      const landmarks: Landmark[] = h.landmarks.map((p) => ({
        x: 1 - p.x,
        y: p.y,
        z: p.z,
      }));
      const strength = pinchStrength(landmarks);
      const latch = this.latches[i] ?? new PinchLatch();
      const pinching = latch.update(strength);
      const gesture = classifyGesture(landmarks, pinching);
      const handedness: Handedness = h.handedness === "Left" ? "Right" : "Left";
      const tip = landmarks[INDEX_TIP];
      return {
        handedness,
        landmarks,
        cursor: { x: tip.x, y: tip.y },
        pinch: strength,
        pinching,
        gesture,
      };
    });
    this.onFrame({
      hands,
      timestampMs: raw.timestampMs,
      latencyMs: raw.latencyMs,
    });
  }

  private loop = (): void => {
    if (!this.tracking) return;
    this.rafId = requestAnimationFrame(this.loop);
    if (this.busy || !this.worker) return;
    if (this.video.readyState < 2) return;
    // Only process new frames.
    if (this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;

    this.busy = true;
    createImageBitmap(this.video)
      .then((bitmap) => {
        if (!this.worker || !this.tracking) {
          bitmap.close();
          this.busy = false;
          return;
        }
        const msg: WorkerInMessage = {
          type: "frame",
          bitmap,
          timestampMs: performance.now(),
          width: this.video.videoWidth,
          height: this.video.videoHeight,
        };
        this.worker.postMessage(msg, [bitmap]);
      })
      .catch(() => {
        this.busy = false;
      });
  };

  stop(): void {
    this.tracking = false;
    this.cameraLive = false;
    cancelAnimationFrame(this.rafId);
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
      this.worker = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
    this.emit({ phase: "idle", tracking: false, trackingError: null, detail: null });
  }
}

/** HEAD-probe a URL to see if a self-hosted asset is present. */
async function urlExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}
