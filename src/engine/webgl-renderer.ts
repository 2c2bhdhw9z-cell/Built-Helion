import { bakePalette } from "./palettes";
import { GL_FADE_FS, GL_FS, GL_QUAD_VS, GL_VS } from "./shaders";
import type { ParticleSoA } from "./soa";
import type { ColorMap, LabParams, PaletteId } from "./types";

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type);
  if (!sh) throw new Error("shader alloc");
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) ?? "compile failed";
    gl.deleteShader(sh);
    throw new Error(log);
  }
  return sh;
}

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error("program alloc");
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) ?? "link failed";
    gl.deleteProgram(p);
    throw new Error(log);
  }
  return p;
}

export class WebGLRenderer {
  private gl: WebGL2RenderingContext;
  private particleProg: WebGLProgram;
  private fadeProg: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private quadVao: WebGLVertexArrayObject;
  private buf: WebGLBuffer;
  private quad: WebGLBuffer;
  private palTex: WebGLTexture;
  private packed: Float32Array;
  private packedCap = 0;
  private paletteId: PaletteId | null = null;
  private firstFrame = true;
  private maxPoint = 64;
  private uWorld: WebGLUniformLocation | null;
  private uSize: WebGLUniformLocation | null;
  private uLifeCurve: WebGLUniformLocation | null;
  private uPalette: WebGLUniformLocation | null;
  private uEnergy: WebGLUniformLocation | null;
  uShape: WebGLUniformLocation | null;
  private uFade: WebGLUniformLocation | null;

  constructor(gl: WebGL2RenderingContext, cap: number) {
    this.gl = gl;
    this.particleProg = program(gl, GL_VS, GL_FS);
    this.fadeProg = program(gl, GL_QUAD_VS, GL_FADE_FS);
    this.uWorld = gl.getUniformLocation(this.particleProg, "u_world");
    this.uSize = gl.getUniformLocation(this.particleProg, "u_size");
    this.uLifeCurve = gl.getUniformLocation(this.particleProg, "u_lifeCurve");
    this.uPalette = gl.getUniformLocation(this.particleProg, "u_palette");
    this.uEnergy = gl.getUniformLocation(this.particleProg, "u_energy");
    this.uShape = gl.getUniformLocation(this.particleProg, "u_shape");
    this.uFade = gl.getUniformLocation(this.fadeProg, "u_color");

    const range = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    if (range && range[1] > 1) this.maxPoint = range[1];

    const vao = gl.createVertexArray();
    const quadVao = gl.createVertexArray();
    const buf = gl.createBuffer();
    const quad = gl.createBuffer();
    const pal = gl.createTexture();
    if (!vao || !quadVao || !buf || !quad || !pal) throw new Error("gl alloc");
    this.vao = vao;
    this.quadVao = quadVao;
    this.buf = buf;
    this.quad = quad;
    this.palTex = pal;
    this.packed = new Float32Array(Math.max(1, cap) * 4);
    this.packedCap = Math.max(1, cap);

    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

    gl.bindVertexArray(quadVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 16, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 16, 12);
    gl.bindVertexArray(null);

    gl.bindTexture(gl.TEXTURE_2D, pal);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.disable(gl.STENCIL_TEST);
  }

  ensurePacked(cap: number): void {
    if (cap > this.packedCap) {
      this.packed = new Float32Array(cap * 4);
      this.packedCap = cap;
    }
  }

  resize(_w: number, _h: number): void {
    this.firstFrame = true;
  }

  private setPalette(id: PaletteId): void {
    if (this.paletteId === id) return;
    this.paletteId = id;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.palTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, bakePalette(id));
  }

  pack(soa: ParticleSoA, map: ColorMap, maxSpeed: number): number {
    this.ensurePacked(soa.count);
    const dst = this.packed;
    const n = soa.count;
    const px = soa.posX;
    const py = soa.posY;
    const vx = soa.velX;
    const vy = soa.velY;
    const life = soa.life;
    const maxL = soa.maxLife;
    const mass = soa.mass;
    const dens = soa.density;
    const phase = soa.phase;
    const invS = 1 / Math.max(maxSpeed, 1e-4);
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      dst[o] = px[i]!;
      dst[o + 1] = py[i]!;
      dst[o + 2] = life[i]!;
      let metric = phase[i]!;
      if (map === "speed") metric = Math.min(1, Math.hypot(vx[i]!, vy[i]!) * invS);
      else if (map === "life") metric = life[i]! < 0 ? 1 : life[i]! / Math.max(maxL[i]!, 1e-4);
      else if (map === "density") metric = Math.min(1, dens[i]! / 40);
      else if (map === "mass") metric = Math.min(1, mass[i]! / 3);
      dst[o + 3] = metric;
    }
    return n;
  }

  render(
    soa: ParticleSoA,
    params: LabParams,
    worldW: number,
    worldH: number,
    cssW: number,
    cssH: number,
    dpr: number,
  ): void {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    const n = this.pack(soa, params.colorMap, 2.4);
    this.setPalette(params.palette);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    if (n > 0) gl.bufferData(gl.ARRAY_BUFFER, this.packed.subarray(0, n * 4), gl.DYNAMIC_DRAW);

    const dw = Math.max(1, gl.drawingBufferWidth);
    const dh = Math.max(1, gl.drawingBufferHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, dw, dh);

    const bgR = 0.031;
    const bgG = 0.035;
    const bgB = 0.047;

    if (this.firstFrame || !params.trails) {
      gl.disable(gl.BLEND);
      gl.clearColor(bgR, bgG, bgB, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.firstFrame = false;
    } else {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.useProgram(this.fadeProg);
      gl.bindVertexArray(this.quadVao);
      const fade = Math.min(0.45, Math.max(0.08, params.trailDecay));
      gl.uniform4f(this.uFade, bgR, bgG, bgB, fade);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.bindVertexArray(null);
    }

    if (n > 0) {
      const additive = params.blend === "additive";
      gl.useProgram(this.particleProg);
      gl.bindVertexArray(this.vao);
      gl.uniform2f(this.uWorld, worldW, worldH);
      const sizePx = Math.min(this.maxPoint, Math.max(1.0, params.pointSize * dpr));
      gl.uniform1f(this.uSize, sizePx);
      gl.uniform2f(this.uLifeCurve, params.lifeFadeIn, params.lifeFadeOut);
      const energy = additive
        ? 0.55 / (1 + params.pointSize * params.pointSize * 0.02)
        : 1;
      gl.uniform1f(this.uEnergy, energy);
      let shp = 0;
      if (params.shape === "square") shp = 1;
      else if (params.shape === "ring") shp = 2;
      else if (params.shape === "diamond") shp = 3;
      gl.uniform1f(this.uShape, shp);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.palTex);
      gl.uniform1i(this.uPalette, 0);
      gl.enable(gl.BLEND);
      if (additive) gl.blendFunc(gl.ONE, gl.ONE);
      else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArrays(gl.POINTS, 0, n);
      gl.bindVertexArray(null);
    }

    void cssW;
    void cssH;
  }

  dispose(): void {
    const gl = this.gl;
    gl.deleteProgram(this.particleProg);
    gl.deleteProgram(this.fadeProg);
    gl.deleteBuffer(this.buf);
    gl.deleteBuffer(this.quad);
    gl.deleteVertexArray(this.vao);
    gl.deleteVertexArray(this.quadVao);
    gl.deleteTexture(this.palTex);
  }
}
