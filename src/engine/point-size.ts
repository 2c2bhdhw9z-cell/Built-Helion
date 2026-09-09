/**
 * Pure, dependency-free point-size math shared by the WebGL and WebGPU
 * backends so on-screen particle size is identical across backends at any
 * device pixel ratio. Kept in its own leaf module (no GPU/DOM imports) so it
 * is unit-testable in node.
 *
 * gl_PointSize (WebGL) and the WGSL vertex shader both work in BACKING
 * (framebuffer) pixels, so the size must include the device pixel ratio the
 * engine used to size the canvas. WebGL already multiplied by dpr inline; the
 * WebGPU path historically omitted it, making particles visibly smaller on
 * WebGPU except at dpr === 2. Routing both through this helper keeps them in
 * lockstep.
 */
import type { ParticleShape } from "./types.ts";

/**
 * Emoji and sprite glyphs are drawn from a texture atlas that reads visually
 * smaller than a solid point of the same size, so both backends bump them by
 * the same factor.
 */
export function shapeSizeFactor(shape: ParticleShape): number {
  return shape === "emoji" || shape === "sprite" ? 1.7 : 1;
}

/**
 * Point size in BACKING pixels for the given user-facing point size and the
 * engine's current device pixel ratio. This is the value both renderers feed
 * to their vertex stage (WebGL clamps it to the GL point-size range; the WGSL
 * shader applies its own `max(1.5, ...)` floor).
 */
export function backingPointSize(pointSize: number, dpr: number, shape: ParticleShape): number {
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  const p = Number.isFinite(pointSize) ? pointSize : 0;
  return p * d * shapeSizeFactor(shape);
}
