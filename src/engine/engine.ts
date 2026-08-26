import { audioManager } from "./audio";
import { emitAlongStroke, emitContinuous, spawnGenerator } from "./emitters";
import { SpatialHash } from "./hash";
import { stepPhysics } from "./physics";
import { ParticleSoA } from "./soa";
import {
  DEFAULT_CAP,
  DEFAULT_PARAMS,
  FIXED_DT,
  MAX_SUBSTEPS,
  SYSTEM_LIMIT,
  type BackendKind,
  type ComputeKind,
  type ContinuousEmitter,
  type GeneratorKind,
  type LabParams,
  type PointerState,
  type Spring,
  type Telemetry,
  type ToolKind,
} from "./types";
import { Canvas2DRenderer } from "./canvas-renderer";
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
  springs: Spring[] = [];
  emitters: ContinuousEmitter[] = [];
  worldW = 1.6;
  worldH = 1;
  cssW = 1;
  cssH = 1;
  dpr = 1;
  backend: BackendKind = "canvas";
  compute: ComputeKind = "cpu";
  ready = false;
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

  setCap(cap: number): void {
    const next = Math.max(1024, Math.min(SYSTEM_LIMIT, cap | 0));
    if (next === this.soa.capacity) return;
    this.soa.allocate(next);
    this.telemetry.cap = next;
    this.telemetry.ramBytes = this.soa.byteSize();
  }

  resize(): void {
    const parent = this.canvas.parentElement ?? this.canvas;
    const rect = parent.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.max(16, Math.floor(rect.width));
    const h = Math.max(16, Math.floor(rect.height));
    const prevW = this.worldW;
    this.cssW = w;
    this.cssH = h;
    this.dpr = dpr;
    this.worldH = 1;
    this.worldW = w / Math.max(h, 1);
    if (this.soa.count > 0 && prevW > 0.05 && this.worldW > 0.05) {
      const sx = this.worldW / prevW;
      if (Math.abs(sx - 1) > 0.02) this.soa.scaleX(sx);
    }
    const bw = Math.max(16, Math.floor(w * dpr));
    const bh = Math.max(16, Math.floor(h * dpr));
    if (this.canvas.width !== bw || this.canvas.height !== bh) {
      this.canvas.width = bw;
      this.canvas.height = bh;
    }
    this.gl?.resize(bw, bh);
    this.gpu?.configureContext(this.canvas);
  }

  sync(s: EngineSync): void {
    this.params = s.params;
    this.pointer = s.pointer;
    this.tool = s.tool;
    this.brushRadius = s.brushRadius;
    this.brushStrength = s.brushStrength;
    if (s.cap !== this.soa.capacity) this.setCap(s.cap);
    if (s.pouring) this.ensureEmitter("pour", s);
    else this.emitters = this.emitters.filter((e) => e.kind !== "pour");
    if (s.falling) this.ensureEmitter("fall", s);
    else this.emitters = this.emitters.filter((e) => e.kind !== "fall");
  }

  private ensureEmitter(kind: "pour" | "fall", s: EngineSync): void {
    if (this.emitters.some((e) => e.kind === kind)) return;
    this.emitters.push({
      kind,
      x: this.worldW * 0.5,
      y: kind === "pour" ? 0.06 : 0.02,
      dirX: 0,
      dirY: 1,
      rate: kind === "pour" ? 420 : 280,
      spread: 0.35,
      speed: kind === "pour" ? 0.55 : 0.22,
      life: s.params.lifespan || -1,
      mass: s.params.mass,
      acc: 0,
    });
  }

  clear(): void {
    this.soa.clear();
    this.springs = [];
    this.totalTime = 0;
    this.emitters = [];
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
      lifespan: kind === "burst" ? this.params.lifespan || 2.8 : this.params.lifespan,
      spread: 0.85,
      speed: kind === "flock" ? 0.35 : kind === "burst" ? 0.42 : 0.7,
      originX: origin?.x ?? this.worldW * 0.5,
      originY: origin?.y ?? this.worldH * 0.5,
      centralMass: this.params.centralMass,
      textInput: this.params.textInput,
    });
    if (result.springs.length) this.springs = result.springs;
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
      );
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
      this.gpu.render(this.soa.count, this.params.blend === "additive");
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
      return Math.min(1800, cap);
    case "burst":
      return Math.min(Math.max(2400, (cap * 0.12) | 0), cap);
    case "flock":
      return Math.min(Math.max(1800, (cap * 0.35) | 0), cap);
    case "galaxy":
      return Math.min(Math.max(4500, (cap * 0.08) | 0), 9000);
    case "ring":
      return Math.min(Math.max(3500, (cap * 0.06) | 0), 7000);
    case "pour":
    case "fall":
      return Math.min(600, cap);
    default:
      return Math.min(Math.max(4000, (cap * 0.12) | 0), cap);
  }
}
