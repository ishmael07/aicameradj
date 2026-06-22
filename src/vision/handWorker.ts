/// <reference lib="webworker" />
import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";
import type {
  Handedness,
  RawVisionFrame,
  WorkerInMessage,
  WorkerOutMessage,
} from "./types";

/**
 * Dedicated worker that runs MediaPipe HandLandmarker off the main thread.
 * detectForVideo is synchronous and would jank the DJ UI if run inline, so all
 * inference happens here. The main thread sends ImageBitmaps and gets back raw
 * landmarks; mirroring + gesture logic is applied on the main thread.
 */

let landmarker: HandLandmarker | null = null;
let lastTimestamp = -1;

const ctx = self as unknown as DedicatedWorkerGlobalScope;

function post(msg: WorkerOutMessage, transfer?: Transferable[]): void {
  if (transfer) ctx.postMessage(msg, transfer);
  else ctx.postMessage(msg);
}

async function init(
  modelAssetPath: string,
  wasmBasePath: string,
  numHands: number,
): Promise<void> {
  const vision = await FilesetResolver.forVisionTasks(wasmBasePath);
  const make = (delegate: "GPU" | "CPU"): Promise<HandLandmarker> =>
    HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath, delegate },
      numHands,
      runningMode: "VIDEO",
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  // GPU is fastest but silently unavailable on some machines/browsers; fall
  // back to CPU so tracking still works rather than throwing a "weird error".
  try {
    landmarker = await make("GPU");
  } catch {
    landmarker = await make("CPU");
  }
  post({ type: "ready" });
}

function toRaw(
  result: HandLandmarkerResult,
  timestampMs: number,
  latencyMs: number,
): RawVisionFrame {
  const hands: RawVisionFrame["hands"] = [];
  const count = result.landmarks?.length ?? 0;
  for (let i = 0; i < count; i++) {
    const lm = result.landmarks[i];
    const handed = result.handedness?.[i]?.[0]?.categoryName as
      | Handedness
      | undefined;
    hands.push({
      handedness: handed === "Left" ? "Left" : "Right",
      landmarks: lm.map((p) => ({ x: p.x, y: p.y, z: p.z })),
    });
  }
  return { hands, timestampMs, latencyMs };
}

ctx.onmessage = async (ev: MessageEvent<WorkerInMessage>): Promise<void> => {
  const msg = ev.data;
  if (msg.type === "init") {
    try {
      await init(msg.modelAssetPath, msg.wasmBasePath, msg.numHands);
    } catch (err) {
      post({ type: "error", message: String(err) });
    }
    return;
  }
  if (msg.type === "frame") {
    if (!landmarker) {
      msg.bitmap.close();
      return;
    }
    // Timestamps must strictly increase in VIDEO mode.
    let ts = msg.timestampMs;
    if (ts <= lastTimestamp) ts = lastTimestamp + 1;
    lastTimestamp = ts;

    const start = performance.now();
    try {
      const result = landmarker.detectForVideo(msg.bitmap, ts);
      const latency = performance.now() - start;
      post({ type: "result", frame: toRaw(result, ts, latency) });
    } catch (err) {
      post({ type: "error", message: String(err) });
    } finally {
      msg.bitmap.close();
    }
  }
};

export {};
