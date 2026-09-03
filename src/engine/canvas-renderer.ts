import { parseTint, samplePalette } from "./palettes";
import type { ParticleSoA } from "./soa";
import type { LabParams } from "./types";

export class Canvas2DRenderer {
  /** fillRect ops issued during the last render() (background clear + each drawn particle). */
  lastDrawCalls = 0;
  /** Particles actually drawn during the last render() (honoring `step` decimation). */
  lastDrawnPoints = 0;

  constructor(private ctx: CanvasRenderingContext2D) {}

  render(
    soa: ParticleSoA,
    params: LabParams,
    worldW: number,
    worldH: number,
    cssW: number,
    cssH: number,
    dpr: number,
  ): void {
    const ctx = this.ctx;
    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    this.lastDrawCalls = 0;
    this.lastDrawnPoints = 0;
    if (params.trails) {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(8,9,12,${Math.min(0.55, params.trailDecay + 0.08)})`;
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#08090c";
      ctx.fillRect(0, 0, w, h);
    }
    this.lastDrawCalls++;
    ctx.globalCompositeOperation = params.blend === "additive" ? "lighter" : "source-over";
    if (params.bloom) {
      ctx.shadowBlur = Math.min(24, 8 * params.bloomStrength);
      ctx.shadowColor = "rgba(255,255,255,0.6)";
    } else {
      ctx.shadowBlur = 0;
    }
    const n = soa.count;
    const sx = w / Math.max(worldW, 1e-6);
    const sy = h / Math.max(worldH, 1e-6);
    const size = Math.max(1, params.pointSize * dpr * 0.5);
    const energy = params.blend === "additive" ? 0.55 / (1 + params.pointSize * params.pointSize * 0.02) : 0.9;
    const step = n > 12000 ? Math.ceil(n / 12000) : 1;
    let drawn = 0;
    for (let i = 0; i < n; i += step) {
      const life = soa.life[i]!;
      if (life === 0) continue;
      let metric = soa.phase[i]!;
      if (params.colorMap === "speed") metric = Math.min(1, Math.hypot(soa.velX[i]!, soa.velY[i]!) / 2.4);
      else if (params.colorMap === "life")
        metric = life < 0 ? 1 : life / Math.max(soa.maxLife[i]!, 1e-4);
      else if (params.colorMap === "density") metric = Math.min(1, soa.density[i]! / 40);
      else if (params.colorMap === "mass") metric = Math.min(1, soa.mass[i]! / 3);
      else if (params.colorMap === "position") {
        const cx = worldW * 0.5;
        const cy = worldH * 0.5;
        metric = Math.min(1, Math.hypot(soa.posX[i]! - cx, soa.posY[i]! - cy) / Math.max(0.5 * Math.min(worldW, worldH), 1e-4));
      }
      const [pr, pg, pb] = samplePalette(params.palette, metric);
      const [tr, tg, tb] = parseTint(params.tint);
      const r = pr * tr;
      const g = pg * tg;
      const b = pb * tb;
      const a = (life < 0 ? 1 : Math.min(1, life)) * energy;
      ctx.fillStyle = `rgba(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0},${a})`;
      const px = soa.posX[i]! * sx;
      const py = soa.posY[i]! * sy;
      drawDot(ctx, params.shape, params.emoji, px, py, size);
      drawn++;
    }
    this.lastDrawnPoints = drawn;
    // Each drawn particle is a fillRect op; add to the background clear already counted.
    this.lastDrawCalls += drawn;
    void cssW;
    void cssH;
  }
}

function drawDot(
  ctx: CanvasRenderingContext2D,
  shape: LabParams["shape"],
  emoji: string,
  x: number,
  y: number,
  size: number,
): void {
  const s = Math.max(1.2, size);
  if (shape === "emoji") {
    const prev = ctx.fillStyle;
    ctx.font = `${Math.max(12, s * 2.6)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji || "✨", x, y);
    ctx.fillStyle = prev;
    return;
  }
  ctx.beginPath();
  if (shape === "square") {
    ctx.rect(x - s, y - s, s * 2, s * 2);
  } else if (shape === "ring") {
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.lineWidth = Math.max(1, s * 0.28);
    ctx.strokeStyle = ctx.fillStyle;
    ctx.stroke();
    return;
  } else if (shape === "diamond") {
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s, y);
    ctx.closePath();
  } else if (shape === "triangle") {
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s, y + s);
    ctx.lineTo(x - s, y + s);
    ctx.closePath();
  } else if (shape === "heart") {
    ctx.moveTo(x, y + s * 0.7);
    ctx.bezierCurveTo(x, y + s * 0.2, x - s, y - s * 0.1, x - s * 0.5, y - s * 0.55);
    ctx.bezierCurveTo(x, y - s, x, y - s * 0.15, x, y);
    ctx.bezierCurveTo(x, y - s * 0.15, x, y - s, x + s * 0.5, y - s * 0.55);
    ctx.bezierCurveTo(x + s, y - s * 0.1, x, y + s * 0.2, x, y + s * 0.7);
  } else if (shape === "plus" || shape === "spark") {
    const t = shape === "spark" ? s * 0.22 : s * 0.35;
    ctx.rect(x - t, y - s, t * 2, s * 2);
    ctx.rect(x - s, y - t, s * 2, t * 2);
  } else if (shape === "hex") {
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 3) * k;
      const hx = x + Math.cos(a) * s;
      const hy = y + Math.sin(a) * s;
      if (k === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
  } else if (shape === "star") {
    for (let k = 0; k < 10; k++) {
      const r = k % 2 === 0 ? s : s * 0.4;
      const a = -Math.PI / 2 + (Math.PI / 5) * k;
      const hx = x + Math.cos(a) * r;
      const hy = y + Math.sin(a) * r;
      if (k === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
  } else {
    ctx.arc(x, y, s, 0, Math.PI * 2);
  }
  ctx.fill();
}
