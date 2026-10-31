import { test } from "node:test";
import assert from "node:assert/strict";
import { formatBytes } from "./utils.ts";

// The perf hub feeds this helper `jsHeapSizeLimit` values Chrome reports in the
// multi-GB range, so it needs a GB rung instead of printing "4096.0 MB".

test("formatBytes keeps the existing small-unit output", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1023), "1023 B");
  assert.equal(formatBytes(1024), "1.0 KB");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(1_048_576), "1.0 MB");
});

test("formatBytes adds a GB rung above 1 GiB", () => {
  assert.equal(formatBytes(4 * 1024 ** 3), "4.00 GB");
  assert.equal(formatBytes(1.5 * 1024 ** 3), "1.50 GB");
  assert.equal(formatBytes(1024 ** 3 - 1), "1024.0 MB");
});

test("formatBytes keeps the sign on negative deltas", () => {
  assert.equal(formatBytes(-2048), "-2.0 KB");
  assert.equal(formatBytes(-512), "-512 B");
});

test("formatBytes never prints NaN or Infinity into the HUD", () => {
  assert.equal(formatBytes(Number.NaN), "—");
  assert.equal(formatBytes(Number.POSITIVE_INFINITY), "—");
  assert.equal(formatBytes(Number.NEGATIVE_INFINITY), "—");
});
