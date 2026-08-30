/**
 * Preferred recording container/codec candidates, best first. VP9 gives the
 * best quality/size; VP8 and bare webm are broad fallbacks; mp4 covers engines
 * (e.g. Safari) that only support MediaRecorder with mp4.
 */
export const RECORDING_MIME_CANDIDATES: string[] = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4",
];

/**
 * Pick the first recording mime type the environment supports. Pure: the
 * support probe is dependency-injected so tests can pass a fake
 * `MediaRecorder.isTypeSupported`. Returns null when none are supported.
 */
export function pickRecordingMime(
  isSupported: (type: string) => boolean,
): string | null {
  for (const candidate of RECORDING_MIME_CANDIDATES) {
    if (isSupported(candidate)) return candidate;
  }
  return null;
}

/**
 * Resolve the best supported recording mime using the real MediaRecorder, or
 * null under SSR/node (or when nothing is supported). SSR-safe: guards the
 * `MediaRecorder` global before touching it.
 */
export function supportedRecordingMime(): string | null {
  const isSupported =
    typeof MediaRecorder !== "undefined"
      ? (type: string) => MediaRecorder.isTypeSupported(type)
      : () => false;
  return pickRecordingMime(isSupported);
}

/**
 * Whether this environment can record a canvas to video: needs MediaRecorder,
 * a canvas `captureStream`, and at least one supported recording mime. All
 * globals are guarded so this is a safe no-throw `false` under SSR/node.
 */
export function canRecord(): boolean {
  if (typeof MediaRecorder === "undefined") return false;
  if (
    typeof HTMLCanvasElement === "undefined" ||
    typeof HTMLCanvasElement.prototype.captureStream !== "function"
  ) {
    return false;
  }
  return supportedRecordingMime() !== null;
}
