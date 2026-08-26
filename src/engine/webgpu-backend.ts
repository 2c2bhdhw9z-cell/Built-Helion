import { bakePalette } from "./palettes";
import { HASH_MAX_PER_CELL } from "./types";
import { WGSL_FADE, WGSL_INTEGRATE, WGSL_POST, WGSL_RENDER_VS } from "./shaders";
import type { ParticleSoA } from "./soa";
import type { LabParams, PointerState, ToolKind } from "./types";

const UNIFORM_BYTES = 256;

function toolMode(tool: ToolKind, down: boolean): number {
  if (!down) return 0;
  switch (tool) {
    case "attract":
      return 1;
    case "repel":
      return 2;
    case "repulsor":
      return 3;
    case "vortex":
      return 4;
    case "freeze":
      return 6;
    default:
      return 0;
  }
}

export class WebGPUBackend {
  device: GPUDevice;
  context: GPUCanvasContext | null = null;
  format: GPUTextureFormat;
  uniformBuf: GPUBuffer;
  wallsBuf: GPUBuffer;
  posPrevBuf: GPUBuffer;
  velBuf: GPUBuffer;
  lifeMassPhaseBuf: GPUBuffer;
  hashCountBuf: GPUBuffer;
  hashBucketBuf: GPUBuffer;
  statsBuf: GPUBuffer;
  statsRead: GPUBuffer;
  palTex: GPUTexture;
  palView: GPUTextureView;
  palSamp: GPUSampler;
  computeLayout: GPUBindGroupLayout;
  renderLayout: GPUBindGroupLayout;
  sampleLayout: GPUBindGroupLayout;
  fadeLayout: GPUBindGroupLayout;
  postLayout: GPUBindGroupLayout;
  computeBG: GPUBindGroup;
  renderBG: GPUBindGroup;
  sampleBG: GPUBindGroup;
  fadeBG: GPUBindGroup;
  postBG: GPUBindGroup | null = null;
  clearPipe: GPUComputePipeline;
  insertPipe: GPUComputePipeline;
  integratePipe: GPUComputePipeline;
  renderPipeAdd: GPURenderPipeline;
  renderPipeAlpha: GPURenderPipeline;
  fadePipe: GPURenderPipeline;
  postPipe: GPURenderPipeline;
  fadeUniformBuf: GPUBuffer;
  postUniformBuf: GPUBuffer;
  postSamp: GPUSampler;
  accumTex: GPUTexture | null = null;
  accumView: GPUTextureView | null = null;
  accumW = 0;
  accumH = 0;
  firstFrame = true;
  cap: number;
  cells: number;
  cols = 96;
  rows = 96;
  lastAlive = 0;
  lastNan = 0;
  lastOob = 0;
  private staging = new Float32Array(UNIFORM_BYTES / 4);
  private stagingU = new Uint32Array(this.staging.buffer);
  private lastPalette = "";
  private readingStats = false;

  constructor(device: GPUDevice, format: GPUTextureFormat, cap: number) {
    this.device = device;
    this.format = format;
    this.cap = cap;
    const storage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
    this.posPrevBuf = device.createBuffer({ size: cap * 16, usage: storage });
    this.velBuf = device.createBuffer({ size: cap * 8, usage: storage });
    this.lifeMassPhaseBuf = device.createBuffer({ size: cap * 16, usage: storage });
    this.cells = this.cols * this.rows;
    this.hashCountBuf = device.createBuffer({
      size: this.cells * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.hashBucketBuf = device.createBuffer({
      size: this.cells * HASH_MAX_PER_CELL * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.statsBuf = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    this.statsRead = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });
    this.wallsBuf = device.createBuffer({
      size: 256 * 16 + 16, // max 256 walls (4 floats each) + 16 bytes for count/pad
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.uniformBuf = device.createBuffer({
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.palTex = device.createTexture({
      size: [256, 1],
      format: "rgba8unorm",
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.palView = this.palTex.createView();
    this.palSamp = device.createSampler({ magFilter: "linear", minFilter: "linear" });

    this.computeLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
        { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
      ],
    });

    this.renderLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
        { binding: 2, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
        { binding: 3, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
      ],
    });

    this.sampleLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });

    // Fade layout for trails
    this.fadeLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
      ],
    });
    this.fadeUniformBuf = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.fadeBG = device.createBindGroup({
      layout: this.fadeLayout,
      entries: [
        { binding: 0, resource: { buffer: this.fadeUniformBuf } },
      ],
    });

    // Post / Bloom layout
    this.postLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
      ],
    });
    this.postUniformBuf = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.postSamp = device.createSampler({ magFilter: "linear", minFilter: "linear" });

    const computeMod = device.createShaderModule({ code: WGSL_INTEGRATE });
    const renderMod = device.createShaderModule({ code: WGSL_RENDER_VS });
    const fadeMod = device.createShaderModule({ code: WGSL_FADE });
    const postMod = device.createShaderModule({ code: WGSL_POST });

    this.clearPipe = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.computeLayout] }),
      compute: { module: computeMod, entryPoint: "clear_hash" },
    });
    this.insertPipe = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.computeLayout] }),
      compute: { module: computeMod, entryPoint: "insert_hash" },
    });
    this.integratePipe = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.computeLayout] }),
      compute: { module: computeMod, entryPoint: "integrate" },
    });

    const pipeLayout = device.createPipelineLayout({ bindGroupLayouts: [this.renderLayout, this.sampleLayout] });
    this.renderPipeAdd = device.createRenderPipeline({
      layout: pipeLayout,
      vertex: { module: renderMod, entryPoint: "vs" },
      fragment: {
        module: renderMod,
        entryPoint: "fs",
        targets: [{
          format,
          blend: {
            color: { srcFactor: "one", dstFactor: "one", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
          },
        }],
      },
      primitive: { topology: "triangle-list" },
    });
    this.renderPipeAlpha = device.createRenderPipeline({
      layout: pipeLayout,
      vertex: { module: renderMod, entryPoint: "vs" },
      fragment: {
        module: renderMod,
        entryPoint: "fs",
        targets: [{
          format,
          blend: {
            color: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
          },
        }],
      },
      primitive: { topology: "triangle-list" },
    });

    this.fadePipe = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.fadeLayout] }),
      vertex: { module: fadeMod, entryPoint: "vs" },
      fragment: {
        module: fadeMod,
        entryPoint: "fs",
        targets: [{
          format,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
          },
        }],
      },
      primitive: { topology: "triangle-list" },
    });

    this.postPipe = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [this.postLayout] }),
      vertex: { module: postMod, entryPoint: "vs_post" },
      fragment: {
        module: postMod,
        entryPoint: "fs_post",
        targets: [{ format }],
      },
      primitive: { topology: "triangle-list" },
    });

    this.computeBG = this.makeComputeBG();
    this.renderBG = this.makeRenderBG();
    this.sampleBG = device.createBindGroup({
      layout: this.sampleLayout,
      entries: [
        { binding: 0, resource: this.palView },
        { binding: 1, resource: this.palSamp },
      ],
    });
  }

  private makeComputeBG(): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.computeLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuf } },
        { binding: 1, resource: { buffer: this.posPrevBuf } },
        { binding: 2, resource: { buffer: this.velBuf } },
        { binding: 3, resource: { buffer: this.lifeMassPhaseBuf } },
        { binding: 4, resource: { buffer: this.hashCountBuf } },
        { binding: 5, resource: { buffer: this.hashBucketBuf } },
        { binding: 6, resource: { buffer: this.wallsBuf } },
        { binding: 7, resource: { buffer: this.statsBuf } },
      ],
    });
  }

  private makeRenderBG(): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.renderLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuf } },
        { binding: 1, resource: { buffer: this.posPrevBuf } },
        { binding: 2, resource: { buffer: this.velBuf } },
        { binding: 3, resource: { buffer: this.lifeMassPhaseBuf } },
      ],
    });
  }

  attachCanvas(canvas: HTMLCanvasElement): boolean {
    const context = canvas.getContext("webgpu");
    if (!context) return false;
    this.context = context;
    context.configure({
      device: this.device,
      format: this.format,
      alphaMode: "opaque",
    });
    return true;
  }

  configureContext(canvas: HTMLCanvasElement): void {
    if (this.context) {
      this.context.configure({
        device: this.device,
        format: this.format,
        alphaMode: "opaque",
      });
    } else {
      this.attachCanvas(canvas);
    }
  }

  uploadSlice(soa: ParticleSoA, start: number, end: number): void {
    const n = end - start;
    if (n <= 0) return;
    const posPrev = new Float32Array(n * 4);
    const vel = new Float32Array(n * 2);
    const lmp = new Float32Array(n * 4);

    for (let i = 0; i < n; i++) {
      const idx = start + i;
      posPrev[i * 4 + 0] = soa.posX[idx]!;
      posPrev[i * 4 + 1] = soa.posY[idx]!;
      posPrev[i * 4 + 2] = soa.prevX[idx]!;
      posPrev[i * 4 + 3] = soa.prevY[idx]!;
      vel[i * 2 + 0] = soa.velX[idx]!;
      vel[i * 2 + 1] = soa.velY[idx]!;
      lmp[i * 4 + 0] = soa.life[idx]!;
      lmp[i * 4 + 1] = soa.mass[idx]!;
      lmp[i * 4 + 2] = soa.phase[idx]!;
      lmp[i * 4 + 3] = soa.flags[idx]!;
    }

    this.device.queue.writeBuffer(this.posPrevBuf, start * 16, posPrev);
    this.device.queue.writeBuffer(this.velBuf, start * 8, vel);
    this.device.queue.writeBuffer(this.lifeMassPhaseBuf, start * 16, lmp);
  }

  uploadSoA(soa: ParticleSoA): void {
    const n = soa.count;
    if (n === 0) {
      const zeros = new Float32Array(64);
      this.device.queue.writeBuffer(this.posPrevBuf, 0, zeros);
      this.device.queue.writeBuffer(this.lifeMassPhaseBuf, 0, zeros);
      return;
    }
    const posPrev = new Float32Array(n * 4);
    const vel = new Float32Array(n * 2);
    const lmp = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      posPrev[i * 4 + 0] = soa.posX[i]!;
      posPrev[i * 4 + 1] = soa.posY[i]!;
      posPrev[i * 4 + 2] = soa.prevX[i]!;
      posPrev[i * 4 + 3] = soa.prevY[i]!;
      vel[i * 2 + 0] = soa.velX[i]!;
      vel[i * 2 + 1] = soa.velY[i]!;
      lmp[i * 4 + 0] = soa.life[i]!;
      lmp[i * 4 + 1] = soa.mass[i]!;
      lmp[i * 4 + 2] = soa.phase[i]!;
      lmp[i * 4 + 3] = soa.flags[i]!;
    }
    this.device.queue.writeBuffer(this.posPrevBuf, 0, posPrev);
    this.device.queue.writeBuffer(this.velBuf, 0, vel);
    this.device.queue.writeBuffer(this.lifeMassPhaseBuf, 0, lmp);
  }

  writeParams(
    params: LabParams,
    pointer: PointerState,
    tool: ToolKind,
    brushRadius: number,
    brushStrength: number,
    count: number,
    worldW: number,
    worldH: number,
    dt: number,
    tiltX: number,
    tiltY: number,
    time: number,
    walls: Array<{x1:number, y1:number, x2:number, y2:number}> = [],
  ): void {
    const s = this.staging;
    const u = this.stagingU;
    s[0] = dt;
    s[1] = params.tiltEnabled ? tiltX : params.gravityX;
    s[2] = params.tiltEnabled ? tiltY : params.gravityY;
    s[3] = params.drag;
    s[4] = pointer.x;
    s[5] = pointer.y;
    s[6] = brushStrength;
    s[7] = brushRadius;
    s[8] = worldW;
    s[9] = worldH;
    s[10] = params.restitution;
    s[11] = params.particleRadius;
    s[12] = params.centralX;
    s[13] = params.centralY;
    s[14] = params.centralMass;
    s[15] = params.softening;
    s[16] = params.flockSep;
    s[17] = params.flockAli;
    s[18] = params.flockCoh;
    s[19] = params.flockRadius;
    s[20] = params.nbodyG;
    s[21] = params.settleThreshold;
    s[22] = params.sph
      ? Math.max(params.sphSmoothing, params.particleRadius * 4, 0.02)
      : Math.max(params.particleRadius * 4, params.flockRadius, 0.02);
    s[23] = params.pointSize;
    const mouseOn = pointer.down || (pointer.inside && tool === "attract");
    u[24] = toolMode(tool, mouseOn);
    u[25] = count;
    u[26] = params.boundary === "wrap" ? 1 : params.boundary === "destroy" ? 2 : 0;
    let flags = 0;
    if (params.collide) flags |= 1;
    if (params.flock) flags |= 2;
    if (params.sph) flags |= 4;
    
    let cm = 0;
    if (params.colorMap === "life") cm = 1;
    else if (params.colorMap === "density") cm = 2;
    else if (params.colorMap === "mass") cm = 3;
    else if (params.colorMap === "palette") cm = 4;
    
    flags |= (cm << 8);
    
    let shp = 0;
    if (params.shape === "square") shp = 1;
    else if (params.shape === "ring") shp = 2;
    else if (params.shape === "diamond") shp = 3;
    flags |= (shp << 11);
    u[27] = flags;
    u[28] = this.cols;
    u[29] = this.rows;
    u[30] = HASH_MAX_PER_CELL;
    s[32] = params.flow ? params.flowStrength : 0;
    s[33] = params.flowScale;
    s[34] = params.flowSpeed;
    s[35] = time;
    s[36] = params.sphRestDensity;
    s[37] = params.sphPressure;
    s[38] = params.sphViscosity;
    s[39] = params.sphSmoothing;
    this.device.queue.writeBuffer(this.uniformBuf, 0, this.staging.buffer);
    
    // Write walls buffer
    const wBuf = new Float32Array(256 * 4 + 4);
    wBuf[0] = walls.length;
    for (let i = 0; i < walls.length; i++) {
      wBuf[4 + i * 4 + 0] = walls[i].x1;
      wBuf[4 + i * 4 + 1] = walls[i].y1;
      wBuf[4 + i * 4 + 2] = walls[i].x2;
      wBuf[4 + i * 4 + 3] = walls[i].y2;
    }
    this.device.queue.writeBuffer(this.wallsBuf, 0, wBuf.buffer);

    if (this.lastPalette !== params.palette) {
      this.lastPalette = params.palette;
      const pal = bakePalette(params.palette);
      this.device.queue.writeTexture(
        { texture: this.palTex },
        pal as unknown as GPUAllowSharedBufferSource,
        { bytesPerRow: 256 * 4 },
        { width: 256, height: 1 },
      );
    }
  }

  dispatch(count: number): void {
    const enc = this.device.createCommandEncoder();
    const groupsP = Math.ceil(Math.max(count, 1) / 64);
    const groupsC = Math.ceil(this.cells / 64);
    const passA = enc.beginComputePass();
    passA.setPipeline(this.clearPipe);
    passA.setBindGroup(0, this.computeBG);
    passA.dispatchWorkgroups(groupsC);
    passA.end();
    const passB = enc.beginComputePass();
    passB.setPipeline(this.insertPipe);
    passB.setBindGroup(0, this.computeBG);
    passB.dispatchWorkgroups(groupsP);
    passB.end();
    const passC = enc.beginComputePass();
    passC.setPipeline(this.integratePipe);
    passC.setBindGroup(0, this.computeBG);
    passC.dispatchWorkgroups(groupsP);
    passC.end();
    if (this.statsRead.mapState === "unmapped" && !this.readingStats) {
      enc.copyBufferToBuffer(this.statsBuf, 0, this.statsRead, 0, 16);
    }
    this.device.queue.submit([enc.finish()]);
  }

  async readStats(): Promise<void> {
    if (this.statsRead.mapState !== "unmapped" || this.readingStats) return;
    this.readingStats = true;
    try {
      await this.statsRead.mapAsync(GPUMapMode.READ);
      const data = new Uint32Array(this.statsRead.getMappedRange().slice(0));
      this.statsRead.unmap();
      this.lastNan = data[0] ?? 0;
      this.lastOob = data[1] ?? 0;
      this.lastAlive = data[3] ?? 0;
    } catch {
      /* skip */
    } finally {
      this.readingStats = false;
    }
  }

  private ensureAccum(w: number, h: number): void {
    const width = Math.max(1, w);
    const height = Math.max(1, h);
    if (this.accumTex && this.accumW === width && this.accumH === height) return;
    if (this.accumTex) {
      this.accumTex.destroy();
    }
    this.accumW = width;
    this.accumH = height;
    this.firstFrame = true;
    this.accumTex = this.device.createTexture({
      size: [width, height],
      format: this.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    this.accumView = this.accumTex.createView();
    this.postBG = this.device.createBindGroup({
      layout: this.postLayout,
      entries: [
        { binding: 0, resource: { buffer: this.postUniformBuf } },
        { binding: 1, resource: this.accumView },
        { binding: 2, resource: this.postSamp },
      ],
    });
  }

  render(count: number, params: LabParams): void {
    if (!this.context) return;
    const canvas = this.context.canvas as HTMLCanvasElement;
    const w = Math.max(1, canvas.width);
    const h = Math.max(1, canvas.height);
    this.ensureAccum(w, h);
    if (!this.accumView || !this.postBG) return;

    const enc = this.device.createCommandEncoder();

    // 1. Trails / Clear pass on accumulation texture
    if (this.firstFrame || !params.trails) {
      const clearPass = enc.beginRenderPass({
        colorAttachments: [
          {
            view: this.accumView,
            clearValue: { r: 0.031, g: 0.035, b: 0.047, a: 1 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      clearPass.end();
      this.firstFrame = false;
    } else {
      const fade = Math.min(0.45, Math.max(0.04, params.trailDecay));
      const fadeData = new Float32Array([0.031, 0.035, 0.047, fade]);
      this.device.queue.writeBuffer(this.fadeUniformBuf, 0, fadeData);

      const fadePass = enc.beginRenderPass({
        colorAttachments: [
          {
            view: this.accumView,
            loadOp: "load",
            storeOp: "store",
          },
        ],
      });
      fadePass.setPipeline(this.fadePipe);
      fadePass.setBindGroup(0, this.fadeBG);
      fadePass.draw(6);
      fadePass.end();
    }

    // 2. Render particles into accumView
    if (count > 0) {
      const additive = params.blend === "additive";
      const partPass = enc.beginRenderPass({
        colorAttachments: [
          {
            view: this.accumView,
            loadOp: "load",
            storeOp: "store",
          },
        ],
      });
      partPass.setPipeline(additive ? this.renderPipeAdd : this.renderPipeAlpha);
      partPass.setBindGroup(0, this.renderBG);
      partPass.setBindGroup(1, this.sampleBG);
      partPass.draw(6, Math.max(count, 0));
      partPass.end();
    }

    // 3. Post pass (Bloom + Blit) onto final swapchain target
    const swapView = this.context.getCurrentTexture().createView();
    const postData = new Float32Array([
      params.bloomStrength,
      params.bloom ? 1.0 : 0.0,
      w,
      h,
    ]);
    this.device.queue.writeBuffer(this.postUniformBuf, 0, postData);

    const postPass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: swapView,
          clearValue: { r: 0.031, g: 0.035, b: 0.047, a: 1 },
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });
    postPass.setPipeline(this.postPipe);
    postPass.setBindGroup(0, this.postBG);
    postPass.draw(6);
    postPass.end();

    this.device.queue.submit([enc.finish()]);
  }

  dispose(): void {
    this.posPrevBuf.destroy();
    this.velBuf.destroy();
    this.lifeMassPhaseBuf.destroy();
    this.hashCountBuf.destroy();
    this.hashBucketBuf.destroy();
    this.statsBuf.destroy();
    this.statsRead.destroy();
    this.uniformBuf.destroy();
    this.wallsBuf.destroy();
    this.palTex.destroy();
    this.fadeUniformBuf.destroy();
    this.postUniformBuf.destroy();
    if (this.accumTex) {
      this.accumTex.destroy();
    }
  }
}

export async function tryCreateWebGPU(
  canvas: HTMLCanvasElement,
  cap: number,
): Promise<WebGPUBackend | null> {
  try {
    const gpu = navigator.gpu;
    if (!gpu || typeof gpu.requestAdapter !== "function") return null;
    const adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return null;
    const device = await adapter.requestDevice();
    const format = gpu.getPreferredCanvasFormat();
    const backend = new WebGPUBackend(device, format, cap);
    if (!backend.attachCanvas(canvas)) {
      backend.dispose();
      return null;
    }
    return backend;
  } catch (e) {
    console.warn("WebGPU init failed, will use fallback:", e);
    return null;
  }
}
