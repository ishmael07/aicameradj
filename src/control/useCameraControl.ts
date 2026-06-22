import { useCallback, useEffect, useRef, useState } from "react";
import { HandTracker, type CameraState } from "../vision/HandTracker";
import { GestureController } from "./GestureController";
import { controlRegistry } from "./ControlRegistry";
import type { CursorState } from "./types";
import type { VisionFrame } from "../vision/types";

const INITIAL_STATE: CameraState = {
  phase: "idle",
  tracking: false,
  trackingError: null,
  detail: null,
};

export interface CameraControl {
  /** Start the camera (call from a user gesture). Camera shows immediately;
   *  hand tracking spins up best-effort afterwards. */
  start: () => Promise<void>;
  stop: () => void;
  /** Full camera + tracking state. */
  state: CameraState;
  /** The video element to display (owned by the tracker). */
  video: HTMLVideoElement | null;
  /** Latest cursors, updated via rAF (read in a render loop). */
  cursorsRef: React.MutableRefObject<CursorState[]>;
  latencyRef: React.MutableRefObject<number>;
}

/**
 * React hook wiring the HandTracker to the GestureController and the control
 * registry. Cursor state is exposed via a ref (updated every frame) so the
 * overlay can render without a React re-render per frame.
 */
export function useCameraControl(): CameraControl {
  const [state, setState] = useState<CameraState>(INITIAL_STATE);
  const [video, setVideo] = useState<HTMLVideoElement | null>(null);

  const trackerRef = useRef<HandTracker | null>(null);
  const controllerRef = useRef<GestureController | null>(null);
  const cursorsRef = useRef<CursorState[]>([]);
  const latencyRef = useRef<number>(0);

  if (!controllerRef.current) {
    controllerRef.current = new GestureController(controlRegistry);
  }

  const onFrame = useCallback((frame: VisionFrame) => {
    const controller = controllerRef.current;
    if (!controller) return;
    controller.process(frame, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    cursorsRef.current = controller.getCursors();
    latencyRef.current = frame.latencyMs;
  }, []);

  const start = useCallback(async () => {
    // Tear down any stale tracker (e.g. after a prior denial/error) so a retry
    // always builds a fresh one.
    if (trackerRef.current) {
      trackerRef.current.stop();
      trackerRef.current = null;
    }
    const tracker = new HandTracker({
      numHands: 2,
      onFrame,
      onState: (s) => {
        setState(s);
        if (s.phase === "idle" || s.phase === "denied" || s.phase === "error") {
          cursorsRef.current = [];
        }
      },
    });
    trackerRef.current = tracker;
    setVideo(tracker.video);
    await tracker.start();
  }, [onFrame]);

  const stop = useCallback(() => {
    trackerRef.current?.stop();
    trackerRef.current = null;
    cursorsRef.current = [];
    setVideo(null);
  }, []);

  useEffect(() => {
    return () => {
      trackerRef.current?.stop();
      trackerRef.current = null;
    };
  }, []);

  return { start, stop, state, video, cursorsRef, latencyRef };
}
