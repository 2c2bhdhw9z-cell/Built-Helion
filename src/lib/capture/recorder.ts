/**
 * Browser-only canvas -> video recorder built on `canvas.captureStream()` +
 * `MediaRecorder`. All feature detection is delegated to the pure helpers in
 * `mime.ts` (`canRecord`, `supportedRecordingMime`) so the codec is NEVER
 * hard-coded — the preferred order is vp9 -> vp8 -> webm -> mp4.
 *
 * Everything here touches DOM/MediaRecorder APIs, so it is reasoned about, not
 * unit tested (headless node has no real MediaRecorder/captureStream); the mime
 * selection it depends on IS covered by mime.test.ts via the injectable
 * `pickRecordingMime`.
 *
 * Degradation: `CanvasRecorder.canRecord()` mirrors `canRecord()` from mime.ts.
 * The UI is expected to check it BEFORE calling `start()` and simply disable the
 * record button when false (notably many iOS Safari versions lack a working
 * MediaRecorder + canvas.captureStream, so recording is expected to be disabled
 * there rather than throwing).
 */
import { canRecord, supportedRecordingMime } from "./mime.ts";

/** Default frame rate for the captured stream. */
export const DEFAULT_RECORD_FPS = 60;

/** Timeslice (ms) passed to MediaRecorder.start so chunks flush periodically. */
const RECORD_TIMESLICE_MS = 1000;

export class CanvasRecorder {
  /** Returns the canvas to capture at start() time (engine or a live composite). */
  private readonly getCanvas: () => HTMLCanvasElement | null;
  private readonly fps: number;
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private mimeType: string | null = null;
  private startedAt = 0;

  constructor(getCanvas: () => HTMLCanvasElement | null, fps: number = DEFAULT_RECORD_FPS) {
    this.getCanvas = getCanvas;
    this.fps = fps;
  }

  /** Whether recording is supported in this environment (SSR-safe). */
  static canRecord(): boolean {
    return canRecord();
  }

  /** Whether a recording is currently in progress. */
  get isRecording(): boolean {
    return this.recorder !== null && this.recorder.state === "recording";
  }

  /** The picked mime type once recording has started (null before start). */
  get currentMimeType(): string | null {
    return this.mimeType;
  }

  /** Milliseconds elapsed since start(), or 0 when not recording. */
  elapsedMs(now: number = typeof performance !== "undefined" ? performance.now() : Date.now()): number {
    if (!this.isRecording || this.startedAt === 0) return 0;
    return Math.max(0, now - this.startedAt);
  }

  /**
   * Begin recording. Feature-detects via canRecord()/supportedRecordingMime()
   * (never hard-codes the mime). Throws a descriptive Error if unsupported or if
   * the canvas/stream can't be obtained — callers should gate on
   * `CanvasRecorder.canRecord()` first so this only ever throws on a genuine
   * runtime failure, not the common unsupported-browser case.
   */
  start(): void {
    if (this.isRecording) return;
    if (!canRecord()) {
      throw new Error("Recording is not supported in this environment.");
    }
    const canvas = this.getCanvas();
    if (!canvas || typeof canvas.captureStream !== "function") {
      throw new Error("No capturable canvas available for recording.");
    }
    const mimeType = supportedRecordingMime();
    if (!mimeType) {
      throw new Error("No supported recording mime type.");
    }
    const stream = canvas.captureStream(this.fps);
    const recorder = new MediaRecorder(stream, { mimeType });
    this.chunks = [];
    recorder.ondataavailable = (e: BlobEvent) => {
      if (e.data && e.data.size > 0) this.chunks.push(e.data);
    };
    this.stream = stream;
    this.recorder = recorder;
    this.mimeType = mimeType;
    recorder.start(RECORD_TIMESLICE_MS);
    this.startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  /**
   * Stop recording and resolve with a single Blob of the picked mime type,
   * assembled from all collected chunks after `onstop` fires (so the final
   * `dataavailable` is included). Resolves null if nothing was recorded. Always
   * releases the stream tracks. Safe to call when not recording (resolves null).
   */
  stop(): Promise<Blob | null> {
    const recorder = this.recorder;
    if (!recorder) {
      this.release();
      return Promise.resolve(null);
    }
    const mimeType = this.mimeType ?? "video/webm";
    return new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const blob = this.chunks.length > 0 ? new Blob(this.chunks, { type: mimeType }) : null;
        this.release();
        resolve(blob);
      };
      try {
        if (recorder.state !== "inactive") {
          recorder.stop();
        } else {
          // Already inactive (e.g. never actually started) — clean up now.
          const blob = this.chunks.length > 0 ? new Blob(this.chunks, { type: mimeType }) : null;
          this.release();
          resolve(blob);
        }
      } catch {
        this.release();
        resolve(null);
      }
    });
  }

  /**
   * Tear down without waiting for a blob: stop the recorder if live and release
   * all stream tracks. Used on unmount so navigating away never leaks a
   * MediaRecorder or an active capture stream.
   */
  dispose(): void {
    const recorder = this.recorder;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* ignore stop errors during teardown */
      }
    }
    this.release();
  }

  /** Stop all stream tracks and drop references. Idempotent. */
  private release(): void {
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        try {
          track.stop();
        } catch {
          /* ignore */
        }
      }
    }
    this.stream = null;
    this.recorder = null;
    this.startedAt = 0;
  }
}
