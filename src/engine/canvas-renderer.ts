import { samplePalette } from "./palettes";
import type { ParticleSoA } from "./soa";
import type { LabParams } from "./types";

export class Canvas2DRenderer {
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
    if (params.trails) {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = `rgba(8,9,12,${Math.min(0.55, params.trailDecay + 0.08)})`;
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#08090c";
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = params.blend === "additive" ? "lighter" : "source-over";
    const n = soa.count;
    const sx = w / Math.max(worldW, 1e-6);
    const sy = h / Math.max(worldH, 1e-6);
    const size = Math.max(1, params.pointSize * dpr * 0.5);
    const energy = params.blend === "additive" ? 0.55 / (1 + params.pointSize * params.pointSize * 0.02) : 0.9;
    const step = n > 12000 ? Math.ceil(n / 12000) : 1;
    for (let i = 0; i < n; i += step) {
      const life = soa.life[i]!;
      if (life === 0) continue;
      let metric = soa.phase[i]!;
      if (params.colorMap === "speed") metric = Math.min(1, Math.hypot(soa.velX[i]!, soa.velY[i]!) / 2.4);
      else if (params.colorMap === "life")
        metric = life < 0 ? 1 : life / Math.max(soa.maxLife[i]!, 1e-4);
      else if (params.colorMap === "density") metric = Math.min(1, soa.density[i]! / 40);
      else if (params.colorMap === "mass") metric = Math.min(1, soa.mass[i]! / 3);
      const [r, g, b] = samplePalette(params.palette, metric);
      const a = (life < 0 ? 1 : Math.min(1, life)) * energy;
      ctx.fillStyle = `rgba(${(r * 255) | 0},${(g * 255) | 0},${(b * 255) | 0},${a})`;
      ctx.fillRect(soa.posX[i]! * sx, soa.posY[i]! * sy, size, size);
    }
    void cssW;
    void cssH;
  }
}
