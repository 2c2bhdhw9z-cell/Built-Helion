/**
 * Free-plan export mark. Drawn onto the composite canvas after engine + walls.
 * Kept tiny and unobtrusive — stills and recordings still look like the sim.
 */

export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  const size = Math.max(11, Math.round(Math.min(width, height) * 0.026));
  ctx.save();
  ctx.font = `600 ${size}px "IBM Plex Sans", ui-sans-serif, sans-serif`;
  ctx.fillStyle = "rgba(236, 238, 242, 0.42)";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 6;
  ctx.fillText("HELION", width - size * 0.7, height - size * 0.55);
  ctx.restore();
}
