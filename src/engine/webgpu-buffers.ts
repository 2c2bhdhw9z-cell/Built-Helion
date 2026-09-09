/**
 * Pure, dependency-free byte-size math for the WebGPU backend's three
 * per-particle storage buffers. Kept in its own leaf module (no GPU/DOM
 * imports) so it is unit-testable in node without pulling in the whole backend.
 *
 * Layout per particle (must match uploadSoA()/uploadSlice() strides and the
 * WGSL storage-buffer declarations):
 * - posPrev:       vec4<f32> (posX, posY, prevX, prevY)   -> 16 bytes
 * - vel:           vec2<f32> (velX, velY)                 -> 8 bytes
 * - lifeMassPhase: vec4<f32> (life, mass, phase, flags)   -> 16 bytes
 *
 * If these strides disagree with the SoA capacity the backend allocates, writes
 * overflow the buffer and the GPU drops the extra particles — the root cause of
 * the "cap slider does nothing past its original value" bug.
 */
export function particleBufferSizes(cap: number): {
  posPrev: number;
  vel: number;
  lifeMassPhase: number;
} {
  const c = Math.max(1, cap | 0);
  return { posPrev: c * 16, vel: c * 8, lifeMassPhase: c * 16 };
}
