/**
 * Pure thumbnail helpers for the history timeline (Item 15).
 *
 * Generating the actual dataURL touches a canvas (browser-only, reasoned about
 * in the UI). The DECISIONS here are pure and unit-tested: the downscaled
 * target size (fit a source resolution into a small box, preserving aspect and
 * never upscaling), and a selector that shapes the version list for the
 * timeline (most-recent-first, capped, with a display timestamp).
 */
import type { VersionEntry } from "./versions.ts";

/** The small box thumbnails fit inside (px). Kept tiny so the dataURL is cheap. */
export const THUMB_MAX_DIM = 96;
/** JPEG quality for the thumbnail dataURL — low, they're decorative. */
export const THUMB_QUALITY = 0.6;

/**
 * Fit a source (width×height) into a `max`-sized box, preserving aspect ratio
 * and never upscaling. Returns integer dimensions (>= 1). Pure.
 */
export function thumbSize(
  source: { width: number; height: number },
  max = THUMB_MAX_DIM,
): { width: number; height: number } {
  const w = Math.max(1, source.width);
  const h = Math.max(1, source.height);
  const scale = Math.min(1, max / Math.max(w, h));
  return {
    width: Math.max(1, Math.round(w * scale)),
    height: Math.max(1, Math.round(h * scale)),
  };
}

export type TimelineEntry = {
  id: string;
  name: string;
  at: number;
  thumb?: string;
};

/**
 * Shape a raw version list for the timeline: newest first (by `at`), capped to
 * `limit`. Pure and DOM-free so the selector is unit-testable. The stored
 * `thumb` (if any) rides along for the preview image.
 */
export function timelineEntries(
  versions: VersionEntry[],
  limit = 12,
): TimelineEntry[] {
  return [...versions]
    .sort((a, b) => b.at - a.at)
    .slice(0, Math.max(0, limit))
    .map((v) => ({ id: v.id, name: v.name, at: v.at, thumb: v.thumb }));
}
