/**
 * Browser-only GIF capture. Frames are downscaled and quantized with gifenc so
 * a few seconds of the sim stay shareable. SSR/node imports are safe (no work
 * until start()).
 */

const MAX_WIDTH = 480;
const MAX_FRAMES = 48;
const GIF_FPS = 8;

export class GifRecorder {
  private readonly getCanvas: () => HTMLCanvasElement | null;
  private frames: { data: Uint8ClampedArray; width: number; height: number }[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(getCanvas: () => HTMLCanvasElement | null) {
    this.getCanvas = getCanvas;
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running || typeof document === "undefined") return;
    this.frames = [];
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      this.grab();
      this.timer = setTimeout(tick, 1000 / GIF_FPS);
    };
    tick();
  }

  private grab(): void {
    const src = this.getCanvas();
    if (!src || src.width < 2 || src.height < 2) return;
    const scale = Math.min(1, MAX_WIDTH / src.width);
    const w = Math.max(2, Math.floor(src.width * scale / 2) * 2);
    const h = Math.max(2, Math.floor(src.height * scale / 2) * 2);
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const ctx = tmp.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(src, 0, 0, w, h);
    const image = ctx.getImageData(0, 0, w, h);
    this.frames.push({ data: image.data, width: w, height: h });
    if (this.frames.length > MAX_FRAMES) this.frames.shift();
  }

  async stop(): Promise<Blob | null> {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.frames.length === 0) return null;
    const { GIFEncoder, quantize, applyPalette } = await import("gifenc");
    const gif = GIFEncoder();
    const delay = Math.round(1000 / GIF_FPS);
    for (const frame of this.frames) {
      const palette = quantize(frame.data, 256);
      const index = applyPalette(frame.data, palette);
      gif.writeFrame(index, frame.width, frame.height, { palette, delay, repeat: 0 });
    }
    gif.finish();
    this.frames = [];
    const bytes = gif.bytes();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return new Blob([copy.buffer], { type: "image/gif" });
  }

  dispose(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.frames = [];
  }
}
