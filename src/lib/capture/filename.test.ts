import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { captureFilename } from "./filename.ts";

describe("captureFilename", () => {
  it("formats a png filename from an injected Date", () => {
    // 2026-08-30 16:24:29 local time.
    const now = new Date(2026, 7, 30, 16, 24, 29);
    assert.equal(captureFilename("png", now), "helion-20260830-162429.png");
  });

  it("formats a webm filename from an injected Date", () => {
    const now = new Date(2026, 7, 30, 16, 24, 29);
    assert.equal(captureFilename("webm", now), "helion-20260830-162429.webm");
  });

  it("zero-pads single-digit month, day, hour, minute, second", () => {
    // 2026-01-05 03:07:09 -> every component needs padding.
    const now = new Date(2026, 0, 5, 3, 7, 9);
    assert.equal(captureFilename("png", now), "helion-20260105-030709.png");
  });

  it("does not throw when called with no arguments (default Date)", () => {
    const name = captureFilename("webm");
    assert.match(name, /^helion-\d{8}-\d{6}\.webm$/);
  });
});
