import { test, expect } from "vitest";
import {
  readPerformanceMemory,
  readGpuInfo,
  readDeviceInfo,
} from "./env-info.ts";

test("readPerformanceMemory returns {available:false} when memory absent", () => {
  const info = readPerformanceMemory({});
  expect(info.available).toBe(false);
  expect(info.usedJSHeapSize).toBeUndefined();
});

test("readPerformanceMemory reads values from a stub", () => {
  const info = readPerformanceMemory({
    memory: {
      usedJSHeapSize: 1000,
      totalJSHeapSize: 2000,
      jsHeapSizeLimit: 4000,
    },
  });
  expect(info.available).toBe(true);
  expect(info.usedJSHeapSize).toBe(1000);
  expect(info.totalJSHeapSize).toBe(2000);
  expect(info.jsHeapSizeLimit).toBe(4000);
});

test("readPerformanceMemory treats empty memory object as unavailable", () => {
  const info = readPerformanceMemory({ memory: {} });
  expect(info.available).toBe(false);
});

test("readGpuInfo returns {available:false} for null gl", () => {
  expect(readGpuInfo(null).available).toBe(false);
});

test("readGpuInfo reads unmasked vendor/renderer via stubbed gl", () => {
  const fakeGl = {
    getExtension: (name: string) =>
      name === "WEBGL_debug_renderer_info" ? {} : null,
    getParameter: (p: number) => {
      if (p === 0x9245) return "NVIDIA Corporation";
      if (p === 0x9246) return "NVIDIA GeForce RTX";
      return null;
    },
  } as unknown as WebGL2RenderingContext;
  const info = readGpuInfo(fakeGl);
  expect(info.available).toBe(true);
  expect(info.vendor).toBe("NVIDIA Corporation");
  expect(info.renderer).toBe("NVIDIA GeForce RTX");
});

test("readGpuInfo handles missing extension gracefully", () => {
  const fakeGl = {
    getExtension: () => null,
    getParameter: () => null,
  } as unknown as WebGL2RenderingContext;
  expect(readGpuInfo(fakeGl).available).toBe(false);
});

test("readGpuInfo swallows thrown errors", () => {
  const fakeGl = {
    getExtension: () => {
      throw new Error("boom");
    },
    getParameter: () => null,
  } as unknown as WebGL2RenderingContext;
  expect(readGpuInfo(fakeGl).available).toBe(false);
});

test("readDeviceInfo is available under happy-dom navigator", () => {
  const info = readDeviceInfo();
  // happy-dom provides navigator/window, so this should be available.
  expect(info.available).toBe(true);
  expect(typeof info.userAgent === "string" || info.userAgent === undefined).toBe(
    true,
  );
});
