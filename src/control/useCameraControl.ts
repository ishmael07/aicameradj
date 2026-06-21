import { useCallback, useEffect, useRef, useState } from "react";
import { HandTracker, type TrackerStatus } from "../vision/HandTracker";
import { GestureController } from "./GestureController";
import { controlRegistry } from "./ControlRegistry";
import type { CursorState } from "./types";
import type { VisionFrame } from "../vision/types";

export interface CameraControl {
  /** Start the camera + hand tracking (call from a user gesture). */
  start: () => Promise<void>;
  stop: () => void;
  status: TrackerStatus;
  statusDetail: string | null;
  /** The video element to display (owned by the tracker). */
  video: HTMLVideoElement | null;
  /** Latest cursors, updated via rAF (read in a render loop). */
  cursorsRef: React.MutableRefObject<CursorState[]>;
  latencyRef: React.MutableRefObject<number>;
}

/**
 * React hook that wires the HandTracker to the GestureController and the
 * control registry. Cursor state is exposed via a ref (updated every frame)
 * so consumers can render it without forcing a React re-render per frame.
 */
export function useCameraControl(): CameraControl {
  const [status, setStatus] = useState<TrackerStatus>("idle");
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
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
    // Proactively tear down any previous tracker (e.g. after a prior denial or
    // error) so a retry always builds a fresh one. The HandTracker only emits a
    // terminal status and never auto-clears the ref, so the retry path lives
    // here rather than in onStatus (which keeps the visible denied/error state).
    if (trackerRef.current) {
      trackerRef.current.stop();
      trackerRef.current = null;
    }
    const tracker = new HandTracker({
      numHands: 2,
      onFrame,
      onStatus: (s, detail) => {
        setStatus(s);
        setStatusDetail(detail ?? null);
        if (s === "idle" || s === "denied" || s === "error") {
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

  return { start, stop, status, statusDetail, video, cursorsRef, latencyRef };
}
