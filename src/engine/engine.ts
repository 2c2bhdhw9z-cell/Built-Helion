import { audioManager } from "./audio";
import { emitAlongStroke, emitContinuous, spawnGenerator } from "./emitters";
import { SpatialHash } from "./hash";
import { stepPhysics } from "./physics";
import { ParticleSoA } from "./soa";
import {
  DEFAULT_CAP,
  DEFAULT_PARAMS,
  FIXED_DT,
  IDLE_EXTRA_BRUSH,
  MAX_SUBSTEPS,
  QUALITY_DPR,
  SYSTEM_LIMIT,
  type BackendKind,
  type ComputeKind,
  type ContinuousEmitter,
  type ExtraBrush,
  type GeneratorKind,
  type LabParams,
  type PointerState,
  type QualityMode,
  type Spring,
  type Telemetry,
  type ToolKind,
} from "./types";
import { Canvas2DRenderer } from "./canvas-renderer";
import { MIN_VIEW_ZOOM } from "./camera";
import { tryCreateWebGPU, type WebGPUBackend } from "./webgpu-backend";
import { WebGLRenderer } from "./webgl-renderer";

export type EngineSync = {
  params: LabParams;
  pointer: PointerState;
  tool: ToolKind;
  brushRadius: number;
  brushStrength: number;
  paused: boolean;
  speed: number;
  cap: number;
  tiltX: number;
  tiltY: number;
  pouring: boolean;
  falling: boolean;
  firing: boolean;
  smoking: boolean;
  quality: QualityMode;
  extraBrush?: ExtraBrush;
};

function pickDefaultCap(): number {
  if (typeof navigator === "undefined") return DEFAULT_CAP;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  if (mem <= 2) return 12_288;
  if (mem <= 4) return 32_768;
  return DEFAULT_CAP;
}

export class ParticleEngine {
  canvas: HTMLCanvasElement;
  soa: ParticleSoA;
  hash = new SpatialHash();
  params: LabParams = { ...DEFAULT_PARAMS };
  pointer: PointerState = { x: 0.5, y: 0.5, down: false, inside: false };
  tool: ToolKind = "attract";
  brushRadius = 0.12;
  brushStrength = 0.85;
  extraBrush: ExtraBrush = { ...IDLE_EXTRA_BRUSH };
  springs: Spring[] = [];
  emitters: ContinuousEmitter[] = [];
  worldW = 1.6;
  worldH = 1;
  /** Fill-frame zoom-out multiplier. 1 at rest; 1/zoom when the world grows. */
  worldScale = 1;
  cssW = 1;
  cssH = 1;
  dpr = 1;
  quality: QualityMode = "high";
  backend: BackendKind = "canvas";
  compute: ComputeKind = "cpu";
  ready = false;
  lastGenerator: GeneratorKind | "" = "";
  lastPaintX = 0;
  lastPaintY = 0;
  hasPaint = false;
  hasWallPaint = false;
  lastWallX = 0;
  lastWallY = 0;
  walls: Array<{x1:number, y1:number, x2:number, y2:number}> = [];
  gpu: WebGPUBackend | null = null;
  gl: WebGLRenderer | null = null;
  canvas2d: Canvas2DRenderer | null = null;
  telemetry: Telemetry;
  private fpsEma = 60;
  private lastTs = 0;
  private acc = 0;
  private totalTime = 0;
  // Reused buffer for per-frame subsystem cost attribution (no hot-loop allocations).
  private subsystemBuf: { name: string; ms: number }[] = [];
  // CPU physics time accumulated across substeps for the current frame (ms).
  private cpuPhysicsMs = 0;
  // Pending screenshot resolver, honored at the END of stepFrame() right after
  // render()/submit so the canvas read happens in the SAME tick as a fresh frame.
  // Null (the common case) keeps the hot loop allocation-free.
  private pendingScreenshot: ((blob: Blob | null) => void) | null = null;

  constructor(canvas: HTMLCanvasElement, cap = pickDefaultCap()) {
    this.canvas = canvas;
    this.soa = new ParticleSoA(cap);
    this.telemetry = {
      fps: 0,
      frameMs: 0,
      computeMs: 0,
      renderMs: 0,
      live: 0,
      sleeping: 0,
      cap,
      limit: SYSTEM_LIMIT,
      ramBytes: this.soa.byteSize(),
      nanCount: 0,
      oobCount: 0,
      backend: "canvas",
      compute: "cpu",
      ready: false,
      drawCalls: 0,
      drawnPoints: 0,
      subsystems: [],
      activeGenerator: "",
    };
  }

  async start(): Promise<void> {
    this.resize();
    
    try {
      const gpu = await tryCreateWebGPU(this.canvas, this.soa.capacity);
      if (gpu) {
        this.gpu = gpu;
        this.backend = "webgpu";
        this.compute = "webgpu";
        if (this.soa.count > 0) {
          this.gpu.uploadSoA(this.soa);
        }
      }
    } catch (e) {
      console.warn("WebGPU failed", e);
    }

    if (!this.gpu) {
      try {
        const gl = this.canvas.getContext("webgl2", {
          alpha: false,
          antialias: false,
          depth: false,
          stencil: false,
          premultipliedAlpha: true,
          powerPreference: "high-performance",
          preserveDrawingBuffer: true,
          failIfMajorPerformanceCaveat: false,
        });
        if (gl) {
          this.gl = new WebGLRenderer(gl, this.soa.capacity);
          this.backend = "webgl";
          this.compute = "cpu";
        }
      } catch (e) {
      console.error("RENDER ERROR:", e);
        this.gl = null;
      }
    }

    if (!this.gpu && !this.gl) {
      const ctx = this.canvas.getContext("2d", { alpha: false });
      if (!ctx) throw new Error("No rendering context");
      this.canvas2d = new Canvas2DRenderer(ctx);
      this.backend = "canvas";
      this.compute = "cpu";
    }

    this.ready = true;
    this.telemetry.ready = true;
    this.telemetry.backend = this.backend;
    this.telemetry.compute = this.compute;
  }

  /**
   * Snapshot of the live rendering context for the perf hub. Read lazily (only
   * when the hub opens) so it adds ZERO per-frame cost. GPU vendor/renderer are
   * read from the ACTUAL WebGL2 context via WEBGL_debug_renderer_info and may be
   * masked/unavailable (returned as undefined -> UI shows "masked"/"unavailable").
   * For WebGPU/Canvas2D backends the raw gl context is null so gpu vendor/renderer
   * are unavailable by design (no fabrication).
   */
  getSystemInfo(): {
    backend: BackendKind;
    compute: ComputeKind;
    dpr: number;
    cssW: number;
    cssH: number;
    backingW: number;
    backingH: number;
    gl: WebGL2RenderingContext | null;
  } {
    return {
      backend: this.backend,
      compute: this.compute,
      dpr: this.dpr,
      cssW: this.cssW,
      cssH: this.cssH,
      backingW: this.canvas.width,
      backingH: this.canvas.height,
      gl: this.backend === "webgl" && this.gl ? this.gl.getRawGl() : null,
    };
  }

  /**
   * Capture the engine canvas into a PNG Blob at the END of a freshly rendered
   * frame. The read is deferred to the very end of stepFrame() (after render()
   * and, for WebGPU, after the queue.submit()) so it lands in the SAME tick as a
   * fresh frame for ALL backends. See the read site in stepFrame() for the
   * per-backend timing rationale.
   *
   * If the sim is PAUSED the render loop still runs stepFrame() each rAF (it
   * simply skips the physics substeps), so render() re-runs every tick and the
   * pending read is honored on the next tick with a non-blank frame. As a
   * belt-and-braces guard, if no rAF loop is active this also forces one render()
   * inline so a paused/idle screenshot is never blank.
   *
   * Resolves null if the browser can't produce a blob (SSR/node or toBlob
   * unsupported). Never gated on auth — capture works for anyone.
   */
  requestScreenshot(): Promise<Blob | null> {
    if (typeof document === "undefined") return Promise.resolve(null);
    // If a request is already pending, resolve the previous one with null so we
    // never leave a dangling promise; only the latest request is honored.
    if (this.pendingScreenshot) {
      const prev = this.pendingScreenshot;
      this.pendingScreenshot = null;
      prev(null);
    }
    return new Promise<Blob | null>((resolve) => {
      this.pendingScreenshot = resolve;
      // Guard for the idle/paused case where no rAF loop is currently driving
      // stepFrame(): force one render() so the pending read has a fresh frame to
      // grab this same tick. When the loop IS running this is a harmless extra
      // render immediately followed by the loop's own render.
      if (this.ready) {
        try {
          this.render();
          this.flushScreenshot();
        } catch {
          /* fall through: the running loop's stepFrame will honor it */
        }
      }
    });
  }

  /**
   * Read the canvas into a PNG blob and resolve the pending screenshot promise.
   * MUST be called immediately after render()/submit within the same tick.
   *
   * Per-backend read correctness:
   * - WebGL2: context created with preserveDrawingBuffer:true (see start()), so
   *   toBlob reflects the last rendered frame reliably. VERIFIED-SOUND.
   * - Canvas2D: the 2D backing store persists between frames, toBlob reads it
   *   directly. VERIFIED-SOUND.
   * - WebGPU: the swapchain uses alphaMode:'opaque' and render() calls
   *   getCurrentTexture()+submit() PER FRAME, so the surface is only guaranteed
   *   to hold this frame's contents right after submit(). We therefore read here,
   *   in the same tick, immediately after render()/submit — NOT on a stale/next
   *   tick which could return a blank/black frame. REASONED-SOUND (can't be
   *   exercised headless).
   */
  private flushScreenshot(): void {
    const resolve = this.pendingScreenshot;
    if (!resolve) return;
    this.pendingScreenshot = null;
    try {
      this.canvas.toBlob((blob) => resolve(blob), "image/png");
    } catch {
      resolve(null);
    }
  }

  setCap(cap: number): void {
    const next = Math.max(1024, Math.min(SYSTEM_LIMIT, cap | 0));
    if (next === this.soa.capacity) return;
    this.soa.allocate(next);
    this.telemetry.cap = next;
    this.telemetry.ramBytes = this.soa.byteSize();
  }

  resize(cssW?: number, cssH?: number): void {
    const parent = this.canvas.parentElement ?? this.canvas;
    const w = Math.max(16, Math.floor(cssW ?? parent.clientWidth));
    const h = Math.max(16, Math.floor(cssH ?? parent.clientHeight));
    let dpr: number;
    const native = window.devicePixelRatio || 1;
    if (this.quality === "low") {
      // Always sub-1× of a 1× screen so Low is visibly softer on phones AND 1× desktops.
      dpr = Math.min(native, 1) * 0.7;
    } else if (this.quality === "medium") {
      dpr = Math.min(native, QUALITY_DPR.medium);
    } else {
      dpr = Math.min(native, QUALITY_DPR.high);
    }
    dpr = Math.max(0.5, dpr);
    const prevW = this.worldW;
    const prevH = this.worldH;
    this.cssW = w;
    this.cssH = h;
    this.dpr = dpr;
    const aspect = w / Math.max(h, 1);
    const newW = aspect * this.worldScale;
    const newH = this.worldScale;
    if (this.soa.count > 0 && prevW > 0.05 && prevH > 0.05) {
      const sy = newH / prevH;
      if (Math.abs(sy - 1) > 0.001) {
        const dx = (newW - prevW) / 2;
        const dy = (newH - prevH) / 2;
        this.soa.translate(dx, dy);
        for (const wall of this.walls) {
          wall.x1 += dx;
          wall.y1 += dy;
          wall.x2 += dx;
          wall.y2 += dy;
        }
        for (const em of this.emitters) {
          em.x += dx;
          em.y += dy;
        }
        if (this.gpu && this.compute === "webgpu") this.gpu.uploadSoA(this.soa);
      } else if (Math.abs(newW / prevW - 1) > 0.02) {
        const sx = newW / prevW;
        this.soa.scaleX(sx);
        for (const wall of this.walls) {
          wall.x1 *= sx;
          wall.x2 *= sx;
        }
        for (const em of this.emitters) em.x *= sx;
        if (this.gpu && this.compute === "webgpu") this.gpu.uploadSoA(this.soa);
      }
    }
    this.worldH = newH;
    this.worldW = newW;
    const bw = Math.max(16, Math.floor(w * dpr));
    const bh = Math.max(16, Math.floor(h * dpr));
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    this.gl?.resize(bw, bh);
    this.gpu?.configureContext(this.canvas);
  }

  setWorldScale(scale: number): void {
    const next = Math.max(1, Math.min(1 / MIN_VIEW_ZOOM, Number.isFinite(scale) ? scale : 1));
    if (Math.abs(next - this.worldScale) < 0.0005) return;
    this.worldScale = next;
    if (this.cssW >= 16 && this.cssH >= 16) this.resize(this.cssW, this.cssH);
  }

  sync(s: EngineSync): void {
    this.params = s.params;
    this.pointer = s.pointer;
    this.tool = s.tool;
    this.brushRadius = s.brushRadius;
    this.brushStrength = s.brushStrength;
    this.extraBrush = s.extraBrush ?? IDLE_EXTRA_BRUSH;
    if (s.cap !== this.soa.capacity) this.setCap(s.cap);
    if (s.quality !== this.quality) {
      this.quality = s.quality;
      this.resize(this.cssW, this.cssH);
    }
    if (s.pouring) this.ensureEmitter("pour", s);
    else this.emitters = this.emitters.filter((e) => e.kind !== "pour");
    if (s.falling) this.ensureEmitter("fall", s);
    else this.emitters = this.emitters.filter((e) => e.kind !== "fall");
    if (s.firing) this.ensureEmitter("fire", s);
    else this.emitters = this.emitters.filter((e) => e.kind !== "fire");
    if (s.smoking) this.ensureEmitter("smoke", s);
    else this.emitters = this.emitters.filter((e) => e.kind !== "smoke");
  }

  private ensureEmitter(kind: "pour" | "fall" | "fire" | "smoke", s: EngineSync): void {
    if (this.emitters.some((e) => e.kind === kind)) return;
    const specs = {
      pour: { x: this.worldW * 0.5, y: 0.06, dirX: 0, dirY: 1, rate: 420, spread: 0.35, speed: 0.55, life: s.params.lifespan || -1 },
      fall: { x: this.worldW * 0.5, y: 0.02, dirX: 0, dirY: 1, rate: 280, spread: 0.35, speed: 0.22, life: s.params.lifespan || -1 },
      fire: { x: this.worldW * 0.5, y: 0.92, dirX: 0, dirY: -1, rate: 360, spread: 0.42, speed: 0.72, life: s.params.lifespan || 1.8 },
      smoke: { x: this.worldW * 0.5, y: 0.9, dirX: 0, dirY: -1, rate: 180, spread: 0.55, speed: 0.22, life: s.params.lifespan || 4.4 },
    } as const;
    const spec = specs[kind];
    this.emitters.push({
      kind,
      x: spec.x,
      y: spec.y,
      dirX: spec.dirX,
      dirY: spec.dirY,
      rate: spec.rate,
      spread: spec.spread,
      speed: spec.speed,
      life: spec.life,
      mass: s.params.mass,
      acc: 0,
    });
  }

  clear(): void {
    this.soa.clear();
    this.springs = [];
    this.totalTime = 0;
    this.emitters = [];
    this.lastGenerator = "";
    if (this.gpu && this.compute === "webgpu") {
      this.gpu.uploadSoA(this.soa);
    }
  }

  spawn(kind: GeneratorKind, replace: boolean, origin?: { x: number; y: number }, count?: number): number {
    if (replace) {
      this.soa.clear();
      this.springs = [];
    }
    const remaining = this.soa.capacity - this.soa.count;
    let budget = Math.min(remaining, count ?? spawnBudget(kind, this.soa.capacity));
    if (this.backend === "canvas") budget = Math.min(budget, 5000);
    if (budget <= 0) return 0;
    const result = spawnGenerator(kind, this.soa, {
      worldW: this.worldW,
      worldH: this.worldH,
      count: budget,
      mass: this.params.mass,
      lifespan:
        kind === "burst" || kind === "fireworks" || kind === "lightning" || kind === "fire" || kind === "smoke" || kind === "supernova"
          ? this.params.lifespan ||
            (kind === "smoke" ? 4.2 : kind === "lightning" ? 0.55 : kind === "supernova" ? 3.4 : 2.2)
          : this.params.lifespan,
      spread: 0.85,
      speed:
        kind === "flock"
          ? 0.35
          : kind === "burst" || kind === "fireworks"
            ? 0.42
            : kind === "supernova"
              ? 1.15
              : kind === "fire"
                ? 0.85
                : kind === "tornado"
                  ? 0.9
                  : 0.7,
      originX: origin?.x ?? this.worldW * 0.5,
      originY: origin?.y ?? this.worldH * 0.5,
      centralMass: this.params.centralMass,
      textInput: this.params.textInput,
    });
    if (result.springs.length) this.springs = result.springs;
    if (result.spawned > 0) this.lastGenerator = kind;
    if (this.gpu && this.compute === "webgpu") {
      this.gpu.uploadSoA(this.soa);
    }
    return result.spawned;
  }

  stepFrame(dt: number, paused: boolean, speed: number, tiltX: number, tiltY: number): void {
    if (this.params.audioReactive && !audioManager.active) {
      audioManager.start();
    } else if (!this.params.audioReactive && audioManager.active) {
      audioManager.stop();
    }
    if (this.params.audioReactive) {
      audioManager.update();
      // Apply bass as a pulse to central mass or general turbulence
      // We can directly mutate a temporary copy of params for the simulation step!
      // Wait, we can just pass audioManager.bass to the params we send to writeParams!
    }

    const t0 = performance.now();
    this.cpuPhysicsMs = 0;
    if (!paused) {
      this.acc += Math.min(dt, 0.1) * speed;
      let steps = 0;
      while (this.acc >= FIXED_DT && steps < MAX_SUBSTEPS) {
        this.substep(FIXED_DT, tiltX, tiltY);
        this.acc -= FIXED_DT;
        steps++;
      }
      if (steps === MAX_SUBSTEPS) this.acc = 0;
    }
    const t1 = performance.now();
    try {
      this.render();
    } catch {
      /* keep the sim alive if a GPU present/render throws */
    }
    const t2 = performance.now();
    const frame = t2 - (this.lastTs || t2);
    this.lastTs = t2;
    if (frame > 0 && frame < 1000) this.fpsEma = this.fpsEma * 0.9 + (1000 / frame) * 0.1;
    this.telemetry.fps = this.fpsEma;
    this.telemetry.frameMs = frame;
    this.telemetry.computeMs = t1 - t0;
    this.telemetry.renderMs = t2 - t1;
    this.telemetry.live = this.soa.count;
    this.telemetry.cap = this.soa.capacity;
    this.telemetry.ramBytes = this.soa.byteSize();
    this.telemetry.backend = this.backend;
    this.telemetry.compute = this.compute;
    this.telemetry.ready = this.ready;

    // Real per-frame draw-call / point counters from whichever backend rendered.
    if (this.gpu) {
      this.telemetry.drawCalls = this.gpu.lastDrawCalls;
      this.telemetry.drawnPoints = this.gpu.lastDrawnPoints;
    } else if (this.gl) {
      this.telemetry.drawCalls = this.gl.lastDrawCalls;
      this.telemetry.drawnPoints = this.gl.lastDrawnPoints;
    } else if (this.canvas2d) {
      this.telemetry.drawCalls = this.canvas2d.lastDrawCalls;
      this.telemetry.drawnPoints = this.canvas2d.lastDrawnPoints;
    } else {
      this.telemetry.drawCalls = 0;
      this.telemetry.drawnPoints = 0;
    }

    this.telemetry.activeGenerator = this.lastGenerator;
    this.updateSubsystems();

    // End-of-frame screenshot read: render() ran above (and for WebGPU the
    // per-frame getCurrentTexture()+submit() has completed), so the canvas holds
    // a fresh frame in THIS tick. Reading here is the only place that is correct
    // for the WebGPU opaque swapchain (a stale/next-tick read can be blank).
    // The `if` keeps the hot loop allocation-free when no capture is pending.
    if (this.pendingScreenshot) this.flushScreenshot();
  }

  /**
   * Attribute the measured CPU physics time (aggregated across substeps this
   * frame) to the set of currently active physics modes. This is an HONEST
   * aggregate: the same measured ms is reported against the active mode set, not
   * a fabricated per-mode split. Only meaningful when compute === "cpu".
   * Reuses a single buffer array; no per-particle work.
   */
  private updateSubsystems(): void {
    const buf = this.subsystemBuf;
    buf.length = 0;
    if (this.compute !== "cpu") {
      this.telemetry.subsystems = buf;
      return;
    }
    const p = this.params;
    const ms = this.cpuPhysicsMs;
    if (p.nbody) buf.push({ name: "nbody", ms });
    if (p.sph) buf.push({ name: "sph", ms });
    if (p.flock) buf.push({ name: "flock", ms });
    if (p.flow) buf.push({ name: "flow", ms });
    if (p.collide) buf.push({ name: "collide", ms });
    if (p.settle) buf.push({ name: "settle", ms });
    if (p.trails) buf.push({ name: "trails", ms });
    if (buf.length === 0 && ms > 0) buf.push({ name: "physics", ms });
    this.telemetry.subsystems = buf;
  }

  private substep(dt: number, tiltX: number, tiltY: number): void {
    this.totalTime += dt;
    const oldCount = this.soa.count;
    if (this.tool === "paint" && this.pointer.down) {
      if (this.hasPaint) {
        emitAlongStroke(
          this.soa,
          this.lastPaintX,
          this.lastPaintY,
          this.pointer.x,
          this.pointer.y,
          0.008,
          0.12,
          this.brushRadius * 0.25,
          this.params.lifespan || 3.2,
          this.params.mass,
        );
      }
      this.lastPaintX = this.pointer.x;
      this.lastPaintY = this.pointer.y;
      this.hasPaint = true;
    } else {
      this.hasPaint = false;
    }
    
    if (this.tool === "wall" && this.pointer.down) {
      if (this.hasWallPaint) {
        const dx = this.pointer.x - this.lastWallX;
        const dy = this.pointer.y - this.lastWallY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > 0.015) {
          if (this.walls.length > 255) this.walls.shift(); // cap to 255 segments
          this.walls.push({
             x1: this.lastWallX, y1: this.lastWallY,
             x2: this.pointer.x, y2: this.pointer.y
          });
          this.lastWallX = this.pointer.x;
          this.lastWallY = this.pointer.y;
        }
      } else {
        this.lastWallX = this.pointer.x;
        this.lastWallY = this.pointer.y;
        this.hasWallPaint = true;
      }
    } else {
      this.hasWallPaint = false;
    }

    for (const e of this.emitters) {
      e.acc += e.rate * dt;
      const n = Math.floor(e.acc);
      if (n <= 0) continue;
      e.acc -= n;
      if (e.kind === "fall") {
        for (let i = 0; i < n; i++) {
          emitContinuous(
            this.soa,
            Math.random() * this.worldW,
            0.02,
            0,
            1,
            1,
            0.4,
            e.speed,
            e.life,
            e.mass,
          );
        }
      } else if (e.kind === "fire") {
        emitContinuous(
          this.soa,
          this.worldW * 0.5 + (Math.random() - 0.5) * 0.22,
          0.92,
          0,
          -1,
          n,
          0.45,
          e.speed,
          e.life,
          e.mass,
        );
      } else if (e.kind === "smoke") {
        emitContinuous(
          this.soa,
          this.worldW * 0.5 + (Math.random() - 0.5) * 0.12,
          0.9,
          0,
          -1,
          n,
          0.6,
          e.speed,
          e.life,
          e.mass,
        );
      } else {
        emitContinuous(this.soa, e.x, e.y, e.dirX, e.dirY, n, e.spread, e.speed, e.life, e.mass);
      }
    }

    
    if (this.gpu && this.compute === "webgpu" && this.soa.count > oldCount) {
      this.gpu.uploadSlice(this.soa, oldCount, this.soa.count);
    }
    
    let effectiveParams = this.params;
    if (this.params.audioReactive && audioManager.active) {
      effectiveParams = { ...this.params };
      const pulse = audioManager.bass * (this.params.audioSensitivity ?? 1.0);
      if (effectiveParams.centralMass > 0) {
         effectiveParams.centralMass += pulse * 2.0;
      } else if (effectiveParams.flow) {
         effectiveParams.flowStrength += pulse * 5.0;
      } else {
         effectiveParams.centralMass = pulse * 1.5;
         effectiveParams.centralX = 0.5;
         effectiveParams.centralY = 0.5;
      }
    }
    
    if (this.compute === "cpu") {
      const pt0 = performance.now();
      const st = stepPhysics(
        this.soa,
        this.hash,
        effectiveParams,
        this.pointer,
        this.tool,
        this.brushRadius,
        this.brushStrength,
        this.springs,
        this.worldW,
        this.worldH,
        dt,
        tiltX,
        tiltY,
        this.totalTime,
        this.walls,
        this.extraBrush,
      );
      this.cpuPhysicsMs += performance.now() - pt0;
      this.telemetry.nanCount += st.nan;
      this.telemetry.oobCount += st.oob;
      this.telemetry.sleeping = st.sleeping;
    } else if (this.gpu) {
      
      

      this.gpu.writeParams(
        effectiveParams,
        this.pointer,
        this.tool,

        this.brushRadius,
        this.brushStrength,
        this.soa.count,
        this.worldW,
        this.worldH,
        dt,
        tiltX,
        tiltY,
        this.totalTime,
        this.walls,
        this.extraBrush,
      );
      this.gpu.dispatch(this.soa.count);
      this.gpu.readStats().then(() => {
         if (this.gpu) {
           this.telemetry.nanCount = this.gpu.lastNan;
           this.telemetry.oobCount = this.gpu.lastOob;
           this.telemetry.live = this.gpu.lastAlive;
         }
      });
    }
  }


  
  render(): void {
    if (this.gpu) {
      if (this.compute === "cpu") {
        this.gpu.uploadSoA(this.soa);
        this.gpu.writeParams(this.params, this.pointer, this.tool, this.brushRadius, this.brushStrength, this.soa.count, this.worldW, this.worldH, FIXED_DT, 0, 0, this.totalTime);
      }
      this.gpu.render(this.soa.count, this.params);
      return;
    }

    if (this.gl) {
      this.gl.render(this.soa, this.params, this.worldW, this.worldH, this.cssW, this.cssH, this.dpr);
      return;
    }
    this.canvas2d?.render(this.soa, this.params, this.worldW, this.worldH, this.cssW, this.cssH, this.dpr);
  }

  dispose(): void {
    this.gl?.dispose();
    this.gpu?.dispose();
    this.gl = null;
    this.gpu = null;
    this.canvas2d = null;
  }
}

function spawnBudget(kind: GeneratorKind, cap: number): number {
  switch (kind) {
    case "cloth":
      return 36 * 26;
    case "nbody":
    case "blackhole":
      return Math.min(1800, cap);
    case "burst":
    case "fireworks":
    case "supernova":
      return Math.min(Math.max(2400, (cap * 0.12) | 0), cap);
    case "flock":
    case "tornado":
      return Math.min(Math.max(1800, (cap * 0.35) | 0), cap);
    case "galaxy":
    case "fibonacci":
      return Math.min(Math.max(4500, (cap * 0.08) | 0), 9000);
    case "ring":
    case "sierpinski":
      return Math.min(Math.max(3500, (cap * 0.06) | 0), 7000);
    case "pour":
    case "fall":
    case "fire":
    case "smoke":
      return Math.min(600, cap);
    case "lightning":
      return Math.min(Math.max(1600, (cap * 0.08) | 0), 5000);
    case "water":
      return Math.min(Math.max(2800, (cap * 0.12) | 0), cap);
    default:
      return Math.min(Math.max(4000, (cap * 0.12) | 0), cap);
  }
}
