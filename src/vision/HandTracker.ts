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
const MODEL_PATH = "/models/hand_landmarker.task";

export type TrackerStatus =
  | "idle"
  | "starting"
  | "running"
  | "error"
  | "denied";

export interface HandTrackerOptions {
  numHands?: number;
  /** One smoothing latch per hand slot keeps pinch state stable. */
  onFrame: (frame: VisionFrame) => void;
  onStatus?: (status: TrackerStatus, detail?: string) => void;
}

/**
 * Owns the camera stream + vision worker. Captures frames, ships ImageBitmaps
 * to the worker, and post-processes raw landmarks into a display-space
 * VisionFrame (mirroring, cursor, pinch hysteresis, gesture).
 *
 * Mirroring: the camera preview is shown mirrored (CSS scaleX(-1)), so we flip
 * model x to xDisplay = 1 - x and flip the handedness label so it matches what
 * the user sees.
 */
export class HandTracker {
  readonly video: HTMLVideoElement;
  private worker: Worker | null = null;
  private stream: MediaStream | null = null;
  private rafId = 0;
  private running = false;
  private busy = false;
  private lastVideoTime = -1;
  private frameTimestamp = 0;

  private readonly numHands: number;
  private readonly onFrame: (frame: VisionFrame) => void;
  private readonly onStatus?: (status: TrackerStatus, detail?: string) => void;

  // One latch per hand index slot (left/right rarely swap mid-gesture).
  private readonly latches: PinchLatch[] = [new PinchLatch(), new PinchLatch()];

  constructor(opts: HandTrackerOptions) {
    this.numHands = opts.numHands ?? 2;
    this.onFrame = opts.onFrame;
    this.onStatus = opts.onStatus;
    this.video = document.createElement("video");
    this.video.playsInline = true;
    this.video.muted = true;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.onStatus?.("starting");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, frameRate: 30, facingMode: "user" },
        audio: false,
      });
    } catch (err) {
      this.onStatus?.("denied", String(err));
      return;
    }
    this.video.srcObject = this.stream;
    try {
      await this.video.play();
    } catch (err) {
      this.onStatus?.("error", String(err));
      return;
    }

    this.worker = new HandWorker();
    this.worker.onmessage = (ev: MessageEvent<WorkerOutMessage>) =>
      this.handleWorkerMessage(ev.data);
    const initMsg: WorkerInMessage = {
      type: "init",
      modelAssetPath: MODEL_PATH,
      wasmBasePath: WASM_BASE,
      numHands: this.numHands,
    };
    this.worker.postMessage(initMsg);
  }

  private handleWorkerMessage(msg: WorkerOutMessage): void {
    if (msg.type === "ready") {
      this.running = true;
      this.onStatus?.("running");
      this.loop();
      return;
    }
    if (msg.type === "error") {
      // Clear busy so a transient inference error doesn't permanently stall
      // the capture loop.
      this.busy = false;
      this.onStatus?.("error", msg.message);
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
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.loop);
    if (this.busy || !this.worker) return;
    if (this.video.readyState < 2) return;
    // Only process new frames.
    if (this.video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = this.video.currentTime;

    this.busy = true;
    this.frameTimestamp += 1;
    createImageBitmap(this.video)
      .then((bitmap) => {
        if (!this.worker || !this.running) {
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
    this.running = false;
    cancelAnimationFrame(this.rafId);
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.video.srcObject = null;
    this.onStatus?.("idle");
  }
}
