import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  RECORDING_MIME_CANDIDATES,
  pickRecordingMime,
  supportedRecordingMime,
  canRecord,
} from "./mime.ts";

/** Build an isSupported probe that only returns true for the given types. */
const only = (...types: string[]) => {
  const set = new Set(types);
  return (type: string) => set.has(type);
};

describe("pickRecordingMime", () => {
  it("prefers vp9 when everything is supported", () => {
    assert.equal(pickRecordingMime(() => true), "video/webm;codecs=vp9");
  });

  it("falls back to vp8 when vp9 is unsupported", () => {
    const probe = only(
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
    );
    assert.equal(pickRecordingMime(probe), "video/webm;codecs=vp8");
  });

  it("falls back to bare video/webm when only that is supported", () => {
    assert.equal(pickRecordingMime(only("video/webm")), "video/webm");
  });

  it("falls back to video/mp4 when only mp4 is supported (Safari-style)", () => {
    assert.equal(pickRecordingMime(only("video/mp4")), "video/mp4");
  });

  it("returns null when none are supported", () => {
    assert.equal(pickRecordingMime(() => false), null);
  });
});

describe("RECORDING_MIME_CANDIDATES", () => {
  it("is ordered vp9, vp8, webm, mp4", () => {
    assert.deepEqual(RECORDING_MIME_CANDIDATES, [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
      "video/mp4",
    ]);
  });
});

describe("SSR/node safety", () => {
  it("supportedRecordingMime returns null under node (no MediaRecorder)", () => {
    assert.equal(supportedRecordingMime(), null);
  });

  it("canRecord returns false under node without throwing", () => {
    assert.equal(canRecord(), false);
  });
});
