export const GL_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
layout(location=1) in float a_life;
layout(location=2) in float a_metric;
uniform vec2 u_world;
uniform float u_size;
out float v_life;
out float v_metric;
void main() {
  vec2 ndc = vec2(
    a_pos.x / max(u_world.x, 0.000001) * 2.0 - 1.0,
    1.0 - a_pos.y / max(u_world.y, 0.000001) * 2.0
  );
  gl_Position = vec4(ndc, 0.0, 1.0);
  float alive = a_life == 0.0 ? 0.0 : 1.0;
  gl_PointSize = max(1.0, u_size) * alive;
  v_life = a_life;
  v_metric = a_metric;
}
`;

export const GL_FS = `#version 300 es
precision highp float;
in float v_life;
in float v_metric;
uniform sampler2D u_palette;
uniform sampler2D u_glyph;
uniform vec2 u_lifeCurve;
uniform float u_energy;
uniform float u_shape;
out vec4 frag;
float lifeAlpha(float life) {
  if (life < 0.0) return 1.0;
  if (life <= 0.0) return 0.0;
  return smoothstep(0.0, max(u_lifeCurve.y, 0.001), life);
}
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(p, p);
  if (u_shape == 10.0) {
    vec4 g = texture(u_glyph, gl_PointCoord);
    if (g.a < 0.06) discard;
    float metric = clamp(v_metric, 0.0, 0.92);
    vec3 pal = texture(u_palette, vec2(metric, 0.5)).rgb;
    vec3 col = mix(g.rgb, g.rgb * pal, 0.22);
    float a = g.a * lifeAlpha(v_life);
    frag = vec4(col * a, a);
    return;
  }
  if (r2 > 1.0) discard;
  float dist = sqrt(r2);
  float soft = 0.0;
  if (u_shape == 1.0) { // Square
    dist = max(abs(p.x), abs(p.y));
    if (dist > 1.0) discard;
    soft = 1.0 - smoothstep(0.8, 1.0, dist);
  } else if (u_shape == 2.0) { // Ring
    if (dist > 1.0) discard;
    float ring = abs(dist - 0.7) * 3.33;
    soft = 1.0 - smoothstep(0.6, 1.0, ring);
  } else if (u_shape == 3.0) { // Diamond
    dist = abs(p.x) + abs(p.y);
    if (dist > 1.0) discard;
    soft = 1.0 - smoothstep(0.8, 1.0, dist);
  } else if (u_shape == 4.0) { // Triangle
    float hw = 0.85 * (p.y + 1.0) / 1.7;
    if (p.y > 0.72 || abs(p.x) > hw) discard;
    float edge = max(p.y - 0.72, abs(p.x) - hw);
    soft = 1.0 - smoothstep(-0.12, 0.0, edge);
  } else if (u_shape == 5.0) { // Star
    float an = atan(p.y, p.x);
    float r = dist;
    float sector = 6.28318530718 / 5.0;
    float a = mod(an + 1.5707963, sector) - sector * 0.5;
    float t = abs(a) / (sector * 0.5);
    float edge = mix(1.0, 0.38, t);
    if (r > edge) discard;
    soft = 1.0 - smoothstep(edge * 0.78, edge, r);
  } else if (u_shape == 6.0) { // Hex
    float hex = max(abs(p.x), abs(p.x) * 0.5 + abs(p.y) * 0.866025);
    if (hex > 0.95) discard;
    soft = 1.0 - smoothstep(0.78, 0.95, hex);
  } else if (u_shape == 7.0) { // Plus
    float plus = min(max(abs(p.x) * 3.2, abs(p.y)), max(abs(p.y) * 3.2, abs(p.x)));
    if (plus > 1.0) discard;
    soft = 1.0 - smoothstep(0.8, 1.0, plus);
  } else if (u_shape == 8.0) { // Heart
    vec2 hp = vec2(p.x, p.y + 0.2);
    float ax = abs(hp.x);
    float hy = hp.y;
    float heart = pow(ax, 2.0) + pow(hy - 0.18 * sqrt(ax), 2.0);
    if (heart > 0.42) discard;
    soft = 1.0 - smoothstep(0.28, 0.42, heart);
  } else if (u_shape == 9.0) { // Spark
    float plus = min(max(abs(p.x) * 4.2, abs(p.y)), max(abs(p.y) * 4.2, abs(p.x)));
    float dia = abs(p.x) + abs(p.y);
    float spark = min(plus, dia * 0.72);
    if (spark > 1.0) discard;
    soft = 1.0 - smoothstep(0.72, 1.0, spark);
  } else { // Circle
    if (dist > 1.0) discard;
    soft = 1.0 - smoothstep(0.85, 1.0, dist);
  }
  float metric = clamp(v_metric, 0.0, 0.92);
  vec3 col = texture(u_palette, vec2(metric, 0.5)).rgb;
  float a = soft * 0.8 * lifeAlpha(v_life) * u_energy;
  frag = vec4(col * a, a);
}
`;

export const GL_QUAD_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const GL_FADE_FS = `#version 300 es
precision highp float;
uniform vec4 u_color;
out vec4 frag;
void main() {
  frag = u_color;
}
`;

export const GL_POST_VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

export const GL_POST_FS = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_screenTex;
uniform vec2 u_texSize;
uniform float u_bloom;
uniform float u_bloomStrength;
out vec4 frag;

void main() {
  vec4 baseColor = texture(u_screenTex, v_uv);
  if (u_bloom <= 0.5) {
    frag = baseColor;
    return;
  }
  vec2 step = (1.0 / u_texSize) * (2.8 * u_bloomStrength);
  vec3 bg = vec3(0.031, 0.035, 0.047);
  vec3 bloom = vec3(0.0);
  
  vec2 offsets[12] = vec2[](
    vec2(-1.0, 0.0), vec2(1.0, 0.0), vec2(0.0, -1.0), vec2(0.0, 1.0),
    vec2(-0.707, -0.707), vec2(0.707, -0.707), vec2(-0.707, 0.707), vec2(0.707, 0.707),
    vec2(-2.0, 0.0), vec2(2.0, 0.0), vec2(0.0, -2.0), vec2(0.0, 2.0)
  );
  
  for (int i = 0; i < 12; i++) {
    vec3 s = texture(u_screenTex, v_uv + offsets[i] * step).rgb;
    vec3 bright = max(s - bg, vec3(0.0));
    bloom += bright;
  }
  bloom = (bloom / 12.0) * u_bloomStrength * 1.8;
  frag = vec4(baseColor.rgb + bloom, 1.0);
}
`;

export const WGSL_INTEGRATE = /* wgsl */ `
fn mod289(x: vec3<f32>) -> vec3<f32> {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}
fn mod289_4(x: vec4<f32>) -> vec4<f32> {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}
fn permute3(x: vec4<f32>) -> vec4<f32> {
  return mod289_4(((x * 34.0) + 1.0) * x);
}
fn taylorInvSqrt(r: vec4<f32>) -> vec4<f32> {
  return 1.79284291400159 - 0.85373472095314 * r;
}
fn snoise3(v: vec3<f32>) -> f32 {
  let C = vec2<f32>(1.0/6.0, 1.0/3.0);
  let D = vec4<f32>(0.0, 0.5, 1.0, 2.0);
  var i  = floor(v + dot(v, C.yyy));
  var x0 = v - i + dot(i, C.xxx);
  var g = step(x0.yzx, x0.xyz);
  var l = 1.0 - g;
  var i1 = min(g.xyz, l.zxy);
  var i2 = max(g.xyz, l.zxy);
  var x1 = x0 - i1 + C.xxx;
  var x2 = x0 - i2 + C.yyy;
  var x3 = x0 - D.yyy;
  i = mod289(i);
  var p = permute3(permute3(permute3(
             i.z + vec4<f32>(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4<f32>(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4<f32>(0.0, i1.x, i2.x, 1.0));
  var n_ = 0.142857142857;
  var ns = n_ * D.wyz - D.xzx;
  var j = p - 49.0 * floor(p * ns.z * ns.z);
  var x_ = floor(j * ns.z);
  var y_ = floor(j - 7.0 * x_);
  var x = x_ * ns.x + ns.yyyy;
  var y = y_ * ns.x + ns.yyyy;
  var h = 1.0 - abs(x) - abs(y);
  var b0 = vec4<f32>(x.xy, y.xy);
  var b1 = vec4<f32>(x.zw, y.zw);
  var s0 = floor(b0) * 2.0 + 1.0;
  var s1 = floor(b1) * 2.0 + 1.0;
  var sh = -step(h, vec4<f32>(0.0));
  var a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  var a1 = b1.xzyw + s1.xzyw * sh.zzww;
  var p0 = vec3<f32>(a0.xy, h.x);
  var p1 = vec3<f32>(a0.zw, h.y);
  var p2 = vec3<f32>(a1.xy, h.z);
  var p3 = vec3<f32>(a1.zw, h.w);
  var d = vec4<f32>(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3));
  d = max(d, vec4<f32>(0.0001));
  var norm = taylorInvSqrt(d);
  p0 = p0 * norm.x;
  p1 = p1 * norm.y;
  p2 = p2 * norm.z;
  p3 = p3 * norm.w;
  var m = max(0.5 - vec4<f32>(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4<f32>(0.0));
  m = m * m;
  return 105.0 * dot(m * m, vec4<f32>(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

fn curlNoise(p: vec3<f32>) -> vec2<f32> {
  let e = 0.01;
  let dx = vec3<f32>(e, 0.0, 0.0);
  let dy = vec3<f32>(0.0, e, 0.0);
  
  let p_x0 = snoise3(p - dx);
  let p_x1 = snoise3(p + dx);
  let p_y0 = snoise3(p - dy);
  let p_y1 = snoise3(p + dy);
  
  let x = p_y1 - p_y0;
  let y = p_x0 - p_x1;
  
  let res = vec2<f32>(x, y);
  let len = length(res);
  if (len < 0.0001) { return vec2<f32>(0.0, 0.0); }
  return res / len;
}

struct Params {
  dt: f32,
  gravityX: f32,
  gravityY: f32,
  drag: f32,
  mouseX: f32,
  mouseY: f32,
  mouseForce: f32,
  mouseRadius: f32,
  worldW: f32,
  worldH: f32,
  restitution: f32,
  pRadius: f32,
  centralX: f32,
  centralY: f32,
  centralMass: f32,
  softening: f32,
  flockSep: f32,
  flockAli: f32,
  flockCoh: f32,
  flockRad: f32,
  nbodyG: f32,
  settleTh: f32,
  cellSize: f32,
  pointSize: f32,
  mouseMode: u32,
  count: u32,
  boundary: u32,
  flags: u32,
  gridCols: u32,
  gridRows: u32,
  maxPerCell: u32,
  _pad: u32,
  flowStrength: f32,
  flowScale: f32,
  flowSpeed: f32,
  time: f32,
  sphRestDensity: f32,
  sphPressure: f32,
  sphViscosity: f32,
  sphSmoothing: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> posPrev: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read_write> vel: array<vec2<f32>>;
@group(0) @binding(3) var<storage, read_write> lifeMassPhase: array<vec4<f32>>;
@group(0) @binding(4) var<storage, read_write> hashCounts: array<atomic<u32>>;
@group(0) @binding(5) var<storage, read_write> hashBuckets: array<u32>;
struct WallData {
  count: f32,
  pad1: f32, pad2: f32, pad3: f32,
  segments: array<vec4<f32>, 256>,
}
@group(0) @binding(6) var<storage, read_write> walls: WallData;
@group(0) @binding(7) var<storage, read_write> stats: array<atomic<u32>>;

fn is_bad(v: vec2<f32>) -> bool {
  return !(abs(v.x) < 10000000.0 && abs(v.y) < 10000000.0);
}

@compute @workgroup_size(64)
fn clear_hash(@builtin(global_invocation_id) id: vec3<u32>) {
  let cells = params.gridCols * params.gridRows;
  if (id.x < cells) {
    atomicStore(&hashCounts[id.x], 0u);
  }
  if (id.x == 0u) {
    atomicStore(&stats[0], 0u);
    atomicStore(&stats[1], 0u);
    atomicStore(&stats[2], 0u);
    atomicStore(&stats[3], 0u);
  }
}

fn cell_of(p: vec2<f32>) -> u32 {
  let cs = max(params.cellSize, 0.0001);
  let cx = u32(clamp(floor(p.x / cs), 0.0, f32(params.gridCols - 1u)));
  let cy = u32(clamp(floor(p.y / cs), 0.0, f32(params.gridRows - 1u)));
  return cy * params.gridCols + cx;
}

@compute @workgroup_size(64)
fn insert_hash(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= params.count) { return; }
  let lmp = lifeMassPhase[i];
  if (lmp.x == 0.0) { return; }
  let p = posPrev[i].xy;
  let c = cell_of(p);
  let slot = atomicAdd(&hashCounts[c], 1u);
  if (slot < params.maxPerCell) {
    hashBuckets[c * params.maxPerCell + slot] = i;
  }
}

@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= params.count) { return; }
  let pp = posPrev[i];
  var p = pp.xy;
  let prevPos = pp.zw;
  var v = vel[i];
  let lmp = lifeMassPhase[i];
  var life = lmp.x;
  let mass = lmp.y;
  let phase = lmp.z;
  let fl = u32(lmp.w);
  if ((fl & 1u) != 0u) {
    vel[i] = vec2<f32>(0.0, 0.0);
    return;
  }
  if (life == 0.0) { return; }
  var acc = vec2<f32>(params.gravityX, params.gravityY);
  if (abs(acc.x) > 100000.0) { acc.x = 0.0; }
  if (abs(acc.y) > 100000.0) { acc.y = 0.0; }
  let cpos = vec2<f32>(params.centralX * params.worldW, params.centralY * params.worldH);
  if (params.centralMass > 0.0) {
    acc += (cpos - p) * params.centralMass;
  }

  if (params.flowStrength > 0.0) {
    let nx = p.x * params.flowScale;
    let ny = p.y * params.flowScale;
    let nz = params.time * params.flowSpeed;
    let curl = curlNoise(vec3<f32>(nx, ny, nz));
    let clen = length(curl);
    if (clen > 0.0001) {
      let force = (curl / clen) * params.flowStrength;
      if (force.x == force.x && force.y == force.y && abs(force.x) < 100000.0 && abs(force.y) < 100000.0) {
        acc += force;
      }
    }
  }

  // Grid / spatial hash logic for flocking, collisions, and SPH fluid
  if ((params.flags & 7u) != 0u) {
    var numNeighbors = 0u;
    var sep = vec2<f32>(0.0, 0.0);
    var ali = vec2<f32>(0.0, 0.0);
    var coh = vec2<f32>(0.0, 0.0);

    var sphDensity: f32 = 1.0;
    var sphPressureForce = vec2<f32>(0.0, 0.0);
    var sphViscForce = vec2<f32>(0.0, 0.0);
    let sphH = max(params.sphSmoothing, 0.005);
    let sphH2 = sphH * sphH;
    let invSphH = 1.0 / sphH;

    let gridX = i32(floor(p.x / params.cellSize));
    let gridY = i32(floor(p.y / params.cellSize));
    for (var y: i32 = -1; y <= 1; y += 1) {
      for (var x: i32 = -1; x <= 1; x += 1) {
        let cx = gridX + x;
        let cy = gridY + y;
        if (cx >= 0 && cx < i32(params.gridCols) && cy >= 0 && cy < i32(params.gridRows)) {
          let cell = u32(cy) * params.gridCols + u32(cx);
          let count = min(atomicLoad(&hashCounts[cell]), params.maxPerCell);
          for (var idx: u32 = 0u; idx < count; idx += 1u) {
            let j = hashBuckets[cell * params.maxPerCell + idx];
            if (j == i) { continue; }
            let p2 = posPrev[j].xy;
            let v2 = vel[j];
            let d = p - p2;
            let d2 = dot(d, d);
            
            if ((params.flags & 1u) != 0u) { // Collisions
               let twoR = params.pRadius * 2.0;
               if (d2 > 0.000001 && d2 < twoR * twoR) {
                  let dist = sqrt(d2);
                  let overlap = twoR - dist;
                  let normal = d / dist;
                  p += normal * (overlap * 0.5);
               }
            }
            if ((params.flags & 2u) != 0u) { // Flocking
               if (d2 > 0.000001 && d2 < params.flockRad * params.flockRad) {
                  let dist = sqrt(d2);
                  let normal = d / dist;
                  sep += normal * (params.flockRad - dist);
                  ali += v2;
                  coh += p2;
                  numNeighbors += 1u;
               }
            }
            if ((params.flags & 4u) != 0u) { // SPH Fluid
               if (d2 < sphH2 && d2 > 0.0000001) {
                  let dist = sqrt(d2);
                  let q = max(0.0, 1.0 - dist * invSphH);
                  let normal = d / dist;
                  sphDensity += q * q * 4.0;
                  let press = params.sphPressure * q * q * 18.0;
                  sphPressureForce += normal * press;
                  sphViscForce += (v2 - v) * (params.sphViscosity * q * 35.0);
               }
            }
          }
        }
      }
    }
    if (numNeighbors > 0u) {
       ali /= f32(numNeighbors);
       coh /= f32(numNeighbors);
       let coh_dir = coh - p;
       acc += sep * params.flockSep;
       acc += (ali - v) * params.flockAli;
       acc += coh_dir * params.flockCoh;
    }
    if ((params.flags & 4u) != 0u) {
       let delta = max(sphDensity - params.sphRestDensity * 0.1, 0.0);
       acc += sphPressureForce * (1.0 + delta * 0.15);
       acc += sphViscForce;
    }
  }

  let mode = params.mouseMode;
  var kick = vec2<f32>(0.0);
  var inBrush = false;
  if (mode > 0u) {
    let d = vec2<f32>(params.mouseX, params.mouseY) - p;
    let d2 = dot(d, d);
    let R = params.mouseRadius;
    if (d2 < R * R) {
      inBrush = true;
      let dist = sqrt(d2) + 0.000001;
      let fall = 1.0 - dist / R;
      let fluid = (params.flags & 4u) != 0u;
      let s = params.mouseForce * fall;
      let n = d / dist;
      if (mode == 6u) {
        v = vec2<f32>(0.0, 0.0);
      } else if (mode == 1u) {
        if (fluid) { kick += n * s * 2.2; } else { acc += n * s * 24.0; }
      } else if (mode == 2u) {
        if (fluid) { kick -= n * s * 2.6; } else { acc -= n * s * 26.0; }
      } else if (mode == 3u) {
        if (fluid) { kick -= d * ((s * 0.9) / (d2 + 0.0004)); }
        else { acc -= d * ((s * 32.0) / (d2 + 0.0004)); }
      } else if (mode == 4u) {
        let tang = vec2<f32>(-n.y, n.x);
        if (fluid) { kick += tang * s * 2.4; } else { acc += tang * s * 28.0; }
      }
    }
  }
  let fluidBrush = inBrush && (params.flags & 4u) != 0u && mode != 6u;
  if (fluidBrush) {
    acc *= 0.08;
  }
  acc = clamp(acc, vec2<f32>(-80.0, -80.0), vec2<f32>(80.0, 80.0));
  let damp = exp(-params.drag * params.dt);
  v = (v + acc * params.dt) * damp + kick;
  let maxS = select(12.0, 22.2, fluidBrush);
  let sp2 = dot(v, v);
  if (sp2 > maxS * maxS) {
    v *= maxS / sqrt(sp2);
  }
  if (fluidBrush) {
    p += kick * 0.022;
  }
  let old_p = p;
  p += v * params.dt;

  // Wall Collisions
  let numWalls = u32(walls.count);
  if (numWalls > 0u) {
    for (var w = 0u; w < numWalls; w++) {
      let wall = walls.segments[w];
      let a = vec2<f32>(wall.x, wall.y);
      let b = vec2<f32>(wall.z, wall.w);
      let ab = b - a;
      let ap = p - a;
      let ap_prev = prevPos - a;
      let lenSq = dot(ab, ab);
      if (lenSq > 0.0) {
        let t = clamp(dot(ap, ab) / lenSq, 0.0, 1.0);
        let closest = a + t * ab;
        let distSq = dot(p - closest, p - closest);
        
        if (distSq < params.pRadius * params.pRadius) {
          let dist = sqrt(distSq);
          let n = (p - closest) / max(dist, 0.0001);
          p = closest + n * params.pRadius;
          let vDot = dot(v, n);
          if (vDot < 0.0) {
            v = v - (1.0 + params.restitution) * vDot * n;
          }
        } else {
          let cp_prev = ap_prev.x * ab.y - ap_prev.y * ab.x;
          let cp_nxt = ap.x * ab.y - ap.y * ab.x;
          if (cp_prev * cp_nxt < 0.0) {
            let u = cp_prev / (cp_prev - cp_nxt);
            let p_int = ap_prev + u * (ap - ap_prev);
            let t_wall = dot(p_int, ab) / lenSq;
            if (t_wall >= 0.0 && t_wall <= 1.0) {
              let normal = vec2<f32>(-ab.y, ab.x) / sqrt(lenSq);
              var n = normal;
              if (dot(ap_prev, n) < 0.0) {
                n = -n;
              }
              let intersection = a + t_wall * ab;
              p = intersection + n * params.pRadius;
              let vDot = dot(v, n);
              if (vDot < 0.0) {
                v = v - (1.0 + params.restitution) * vDot * n;
              }
            }
          }
        }
      }
    }
  }

  if (p.x < 0.0 || p.x > params.worldW || p.y < 0.0 || p.y > params.worldH) {
    atomicAdd(&stats[1], 1u);
    if (params.boundary == 1u) {
      p.x = p.x - params.worldW * floor(p.x / params.worldW);
      p.y = p.y - params.worldH * floor(p.y / params.worldH);
    } else if (params.boundary == 2u) {
      life = 0.0;
    } else {
      if (p.x < 0.0) { p.x = 0.0; v.x = abs(v.x) * params.restitution; }
      if (p.x > params.worldW) { p.x = params.worldW; v.x = -abs(v.x) * params.restitution; }
      if (p.y < 0.0) { p.y = 0.0; v.y = abs(v.y) * params.restitution; }
      if (p.y > params.worldH) { p.y = params.worldH; v.y = -abs(v.y) * params.restitution; }
    }
  }
  if (is_bad(p) || is_bad(v)) {
    atomicAdd(&stats[0], 1u);
    life = 0.0;
    p = vec2<f32>(params.worldW * 0.5, params.worldH * 0.5);
    v = vec2<f32>(0.0, 0.0);
  }
  if (life > 0.0 && life < 100000000.0) {
    life -= params.dt;
    if (life < 0.0) { life = 0.0; }
  }
  if (life != 0.0) {
    atomicAdd(&stats[3], 1u);
  }
  posPrev[i] = vec4<f32>(p.x, p.y, old_p.x, old_p.y);
  if (abs(v.x) > 100000.0 || abs(v.y) > 100000.0 || v.x != v.x || v.y != v.y) { v = vec2<f32>(0.0, 0.0); }
  vel[i] = v;
  lifeMassPhase[i] = vec4<f32>(life, mass, phase, f32(fl));
}
`;

export const WGSL_RENDER_VS = /* wgsl */ `
struct Params {
  dt: f32, gravityX: f32, gravityY: f32, drag: f32,
  mouseX: f32, mouseY: f32, mouseForce: f32, mouseRadius: f32,
  worldW: f32, worldH: f32, restitution: f32, pRadius: f32,
  centralX: f32, centralY: f32, centralMass: f32, softening: f32,
  flockSep: f32, flockAli: f32, flockCoh: f32, flockRad: f32,
  nbodyG: f32, settleTh: f32, cellSize: f32, pointSize: f32,
  mouseMode: u32, count: u32, boundary: u32, flags: u32,
  gridCols: u32, gridRows: u32, maxPerCell: u32, _pad: u32,
  flowStrength: f32, flowScale: f32, flowSpeed: f32, time: f32,
  sphRestDensity: f32, sphPressure: f32, sphViscosity: f32, sphSmoothing: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> posPrev: array<vec4<f32>>;
@group(0) @binding(2) var<storage, read> vel: array<vec2<f32>>;
@group(0) @binding(3) var<storage, read> lifeMassPhase: array<vec4<f32>>;
@group(1) @binding(0) var palTex: texture_2d<f32>;
@group(1) @binding(1) var palSamp: sampler;
@group(1) @binding(2) var glyphTex: texture_2d<f32>;

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) life: f32,
  @location(1) metric: f32,
  @location(2) coord: vec2<f32>,
}

@vertex
fn vs(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> VSOut {
  var out: VSOut;
  if (iid >= params.count) {
    out.position = vec4<f32>(2.0, 2.0, 0.0, 1.0);
    return out;
  }
  let corners = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
  );
  let corner = corners[vid];
  let p = posPrev[iid].xy;
  let lmp = lifeMassPhase[iid];
  let life = lmp.x;
  let mass = lmp.y;
  let phase = lmp.z;
  let ndc = vec2<f32>(p.x / max(params.worldW, 0.000001) * 2.0 - 1.0, 1.0 - p.y / max(params.worldH, 0.000001) * 2.0);
  let alive = select(0.0, 1.0, life != 0.0);
  let px = max(1.5, params.pointSize) * alive;
  let offset = corner * px * vec2<f32>(2.0 / max(params.worldW * 800.0, 800.0), 2.0 / max(params.worldH * 800.0, 600.0));
  out.position = vec4<f32>(ndc + offset, 0.0, 1.0);
  out.life = life;
  
  let cm = (params.flags >> 8u) & 7u;
  var metric = 0.0;
  if (cm == 0u) {
    let spd = length(vel[iid]);
    metric = clamp(spd / 2.4, 0.0, 1.0);
  } else if (cm == 1u) {
    metric = clamp(life, 0.0, 1.0);
  } else if (cm == 2u || cm == 3u) {
    metric = clamp(mass / 3.0, 0.0, 1.0);
  } else if (cm == 4u) {
    metric = clamp(phase, 0.0, 1.0);
  } else if (cm == 5u) {
    let cpos = vec2<f32>(params.worldW * 0.5, params.worldH * 0.5);
    metric = clamp(length(p - cpos) / max(0.5 * min(params.worldW, params.worldH), 0.0001), 0.0, 1.0);
  }
  
  out.metric = metric;
  out.coord = corner;
  return out;
}

@fragment
fn fs(in: VSOut) -> @location(0) vec4<f32> {
  let shp = (params.flags >> 11u) & 15u;
  var dist = length(in.coord);
  var soft = 0.0;
  
  if (shp == 1u) { // Square
    dist = max(abs(in.coord.x), abs(in.coord.y));
    if (dist > 1.0) { discard; }
    soft = 1.0 - smoothstep(0.8, 1.0, dist);
  } else if (shp == 2u) { // Ring
    if (dist > 1.0) { discard; }
    let ring = abs(dist - 0.7) * 3.33;
    soft = 1.0 - smoothstep(0.6, 1.0, ring);
  } else if (shp == 3u) { // Diamond
    dist = abs(in.coord.x) + abs(in.coord.y);
    if (dist > 1.0) { discard; }
    soft = 1.0 - smoothstep(0.8, 1.0, dist);
  } else if (shp == 4u) { // Triangle
    let hw = 0.85 * (in.coord.y + 1.0) / 1.7;
    if (in.coord.y > 0.72 || abs(in.coord.x) > hw) { discard; }
    let edge = max(in.coord.y - 0.72, abs(in.coord.x) - hw);
    soft = 1.0 - smoothstep(-0.12, 0.0, edge);
  } else if (shp == 5u) { // Star
    let an = atan2(in.coord.y, in.coord.x);
    let r = dist;
    let sector = 6.28318530718 / 5.0;
    let a = (an + 1.5707963) % sector - sector * 0.5;
    let t = abs(a) / (sector * 0.5);
    let edge = mix(1.0, 0.38, t);
    if (r > edge) { discard; }
    soft = 1.0 - smoothstep(edge * 0.78, edge, r);
  } else if (shp == 6u) { // Hex
    let hex = max(abs(in.coord.x), abs(in.coord.x) * 0.5 + abs(in.coord.y) * 0.866025);
    if (hex > 0.95) { discard; }
    soft = 1.0 - smoothstep(0.78, 0.95, hex);
  } else if (shp == 7u) { // Plus
    let plus = min(max(abs(in.coord.x) * 3.2, abs(in.coord.y)), max(abs(in.coord.y) * 3.2, abs(in.coord.x)));
    if (plus > 1.0) { discard; }
    soft = 1.0 - smoothstep(0.8, 1.0, plus);
  } else if (shp == 8u) { // Heart
    let hp = vec2<f32>(in.coord.x, in.coord.y + 0.2);
    let ax = abs(hp.x);
    let hy = hp.y;
    let heart = pow(ax, 2.0) + pow(hy - 0.18 * sqrt(ax), 2.0);
    if (heart > 0.42) { discard; }
    soft = 1.0 - smoothstep(0.28, 0.42, heart);
  } else if (shp == 9u) { // Spark
    let plus = min(max(abs(in.coord.x) * 4.2, abs(in.coord.y)), max(abs(in.coord.y) * 4.2, abs(in.coord.x)));
    let dia = abs(in.coord.x) + abs(in.coord.y);
    let spark = min(plus, dia * 0.72);
    if (spark > 1.0) { discard; }
    soft = 1.0 - smoothstep(0.72, 1.0, spark);
  } else if (shp == 10u) { // Emoji atlas
    let uv = vec2<f32>(in.coord.x * 0.5 + 0.5, 0.5 - in.coord.y * 0.5);
    let g = textureSample(glyphTex, palSamp, uv);
    if (g.a < 0.06) { discard; }
    let pal = textureSample(palTex, palSamp, vec2<f32>(clamp(in.metric, 0.0, 1.0), 0.5));
    let col = mix(g.rgb, g.rgb * pal.rgb, 0.22);
    var ea = g.a;
    if (in.life >= 0.0) {
      ea *= smoothstep(0.0, 0.22, in.life);
    }
    return vec4<f32>(col * ea, ea);
  } else { // Circle
    if (dist > 1.0) { discard; }
    soft = 1.0 - smoothstep(0.85, 1.0, dist);
  }
  
  var a = soft * 0.8;
  if (in.life >= 0.0) {
    a *= smoothstep(0.0, 0.22, in.life);
  }
  let col = textureSample(palTex, palSamp, vec2<f32>(clamp(in.metric, 0.0, 1.0), 0.5));
  return vec4<f32>(col.rgb * a, a);
}
`;

export const WGSL_FADE = /* wgsl */ `
struct FadeUniforms {
  color: vec4<f32>,
}
@group(0) @binding(0) var<uniform> fadeU: FadeUniforms;

@vertex
fn vs(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4<f32> {
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
  );
  return vec4<f32>(pos[vid], 0.0, 1.0);
}

@fragment
fn fs() -> @location(0) vec4<f32> {
  return fadeU.color;
}
`;

export const WGSL_POST = /* wgsl */ `
struct PostUniforms {
  bloomStrength: f32,
  bloomEnabled: f32,
  texWidth: f32,
  texHeight: f32,
}
@group(0) @binding(0) var<uniform> postU: PostUniforms;
@group(0) @binding(1) var screenTex: texture_2d<f32>;
@group(0) @binding(2) var screenSamp: sampler;

struct PostVSOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
}

@vertex
fn vs_post(@builtin(vertex_index) vid: u32) -> PostVSOut {
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>(1.0, -1.0), vec2<f32>(-1.0, 1.0),
    vec2<f32>(-1.0, 1.0), vec2<f32>(1.0, -1.0), vec2<f32>(1.0, 1.0)
  );
  var out: PostVSOut;
  out.pos = vec4<f32>(pos[vid], 0.0, 1.0);
  out.uv = pos[vid] * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5, 0.5);
  return out;
}

@fragment
fn fs_post(in: PostVSOut) -> @location(0) vec4<f32> {
  let baseColor = textureSample(screenTex, screenSamp, in.uv);
  if (postU.bloomEnabled <= 0.5) {
    return baseColor;
  }
  let step = (1.0 / vec2<f32>(postU.texWidth, postU.texHeight)) * (2.8 * postU.bloomStrength);
  var bloom = vec3<f32>(0.0, 0.0, 0.0);
  let bg = vec3<f32>(0.031, 0.035, 0.047);
  
  let offsets = array<vec2<f32>, 12>(
    vec2<f32>(-1.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(0.0, -1.0), vec2<f32>(0.0, 1.0),
    vec2<f32>(-0.707, -0.707), vec2<f32>(0.707, -0.707), vec2<f32>(-0.707, 0.707), vec2<f32>(0.707, 0.707),
    vec2<f32>(-2.0, 0.0), vec2<f32>(2.0, 0.0), vec2<f32>(0.0, -2.0), vec2<f32>(0.0, 2.0)
  );
  
  for (var k = 0u; k < 12u; k++) {
    let s = textureSample(screenTex, screenSamp, in.uv + offsets[k] * step).rgb;
    let bright = max(s - bg, vec3<f32>(0.0));
    bloom += bright;
  }
  bloom = (bloom / 12.0) * postU.bloomStrength * 1.8;
  return vec4<f32>(baseColor.rgb + bloom, 1.0);
}
`;

