import { SpatialHash } from "./hash";
import type { ParticleSoA } from "./soa";
import {
  FLAG_PINNED,
  FLAG_SLEEP,
  IDLE_EXTRA_BRUSH,
  MAX_ACCEL,
  MAX_SPEED,
  brushMode,
  type ExtraBrush,
  type LabParams,
  type PointerState,
  type Spring,
  type ToolKind,
} from "./types";
import { applyCustomForce } from "./force-expr";

export type PhysicsStats = {
  nan: number;
  oob: number;
  sleeping: number;
};

const stats: PhysicsStats = { nan: 0, oob: 0, sleeping: 0 };

const brushAcc = {
  ax: 0,
  ay: 0,
  kickX: 0,
  kickY: 0,
  vxi: 0,
  vyi: 0,
  flags: 0,
  sleep: 0,
  inBrush: false,
};

function clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

function applyOneBrush(
  acc: typeof brushAcc,
  mode: number,
  mx: number,
  my: number,
  radius: number,
  strength: number,
  x: number,
  y: number,
  fluid: boolean,
): void {
  if (mode <= 0 || radius <= 0) return;
  const dx = mx - x;
  const dy = my - y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= radius * radius) return;
  acc.inBrush = true;
  const d = Math.sqrt(d2) + 1e-6;
  const fall = 1 - d / radius;
  const s = strength * fall;
  const nx = dx / d;
  const ny = dy / d;
  if (mode === 6) {
    acc.vxi = 0;
    acc.vyi = 0;
    acc.flags |= FLAG_SLEEP;
    acc.sleep = 40;
    return;
  }
  acc.flags &= ~FLAG_SLEEP;
  if (mode === 1) {
    acc.sleep = 0;
    if (fluid) {
      acc.kickX += nx * s * 2.2;
      acc.kickY += ny * s * 2.2;
    } else {
      acc.ax += nx * s * 24;
      acc.ay += ny * s * 24;
    }
  } else if (mode === 2) {
    if (fluid) {
      acc.kickX -= nx * s * 2.6;
      acc.kickY -= ny * s * 2.6;
    } else {
      acc.ax -= nx * s * 26;
      acc.ay -= ny * s * 26;
    }
  } else if (mode === 3) {
    if (fluid) {
      const k = (s * 0.9) / (d2 + 0.0004);
      acc.kickX -= dx * k;
      acc.kickY -= dy * k;
    } else {
      const k = (s * 32) / (d2 + 0.0004);
      acc.ax -= dx * k;
      acc.ay -= dy * k;
    }
  } else if (mode === 4) {
    if (fluid) {
      acc.kickX += -ny * s * 2.4;
      acc.kickY += nx * s * 2.4;
    } else {
      acc.ax += -ny * s * 28;
      acc.ay += nx * s * 28;
    }
  }
}

export function stepPhysics(
  soa: ParticleSoA,
  hash: SpatialHash,
  params: LabParams,
  pointer: PointerState,
  tool: ToolKind,
  brushRadius: number,
  brushStrength: number,
  springs: Spring[],
  worldW: number,
  worldH: number,
  dt: number,
  tiltX: number,
  tiltY: number,
  totalTime: number,
  walls: Array<{x1:number, y1:number, x2:number, y2:number}> = [],
  extraBrush: ExtraBrush = IDLE_EXTRA_BRUSH,
): PhysicsStats {

  stats.nan = 0;
  stats.oob = 0;
  stats.sleeping = 0;

  const n = soa.count;
  const px = soa.posX;
  const py = soa.posY;
  const vx = soa.velX;
  const vy = soa.velY;
  const prevx = soa.prevX;
  const prevy = soa.prevY;
  const axA = soa.accX;
  const ayA = soa.accY;
  const life = soa.life;
  const mass = soa.mass;
  const flags = soa.flags;
  const sleep = soa.sleep;

  const gx = params.tiltEnabled ? tiltX : params.gravityX;
  const gy = params.tiltEnabled ? tiltY : params.gravityY;
  const drag = params.drag;
  const needHash = params.collide || params.flock || params.sph || params.nbody;
  const cell =
    params.sph ? params.sphSmoothing : Math.max(params.particleRadius * 4, params.flockRadius, 0.02);

  if (needHash) {
    hash.configure(worldW, worldH, cell);
    hash.clear();
    for (let i = 0; i < n; i++) hash.insert(i, px[i]!, py[i]!);
  }

  if (params.sph && n > 0) {
    sphDensity(soa, hash, params, n);
    sphForces(soa, hash, params, n);
  } else {
    axA.fill(0, 0, n);
    ayA.fill(0, 0, n);
  }

  const mMode = pointer.down ? brushMode(tool, true) : 0;
  const extra = extraBrush ?? IDLE_EXTRA_BRUSH;
  const eMode = extra.mode | 0;

  const rest = params.restitution;
  const pr = params.particleRadius;
  const twoR = pr * 2;
  const twoR2 = twoR * twoR;
  const maxA = MAX_ACCEL;
  const maxS = MAX_SPEED;
  const damp = Math.exp(-drag * dt);
  const settleTh2 = params.settleThreshold * params.settleThreshold;
  const cx = params.centralX * worldW;
  const cy = params.centralY * worldH;
  const cMass = params.centralMass;
  const eps = params.softening * params.softening;
  const lifespan = params.lifespan;
  const pairwiseNbody = params.nbody && n <= 900;

  for (let i = 0; i < n; i++) {
    const f = flags[i]!;
    if (f & FLAG_PINNED) {
      vx[i] = 0;
      vy[i] = 0;
      prevx[i] = px[i]!;
      prevy[i] = py[i]!;
      continue;
    }

    let x = px[i]!;
    let y = py[i]!;
    let vxi = vx[i]!;
    let vyi = vy[i]!;
    let ax = axA[i]! + gx;
    let ay = ayA[i]! + gy;

    if (cMass > 0) {
      ax += (cx - x) * cMass;
      ay += (cy - y) * cMass;
    }

    if (params.forceKind !== "off") {
      const nx = x / Math.max(worldW, 1e-6);
      const ny = y / Math.max(worldH, 1e-6);
      const extra = applyCustomForce(
        params.forceKind,
        params.forceStrength,
        params.forceExprX,
        params.forceExprY,
        nx,
        ny,
        vxi,
        vyi,
      );
      ax += extra.ax;
      ay += extra.ay;
    }

    let kickX = 0;
    let kickY = 0;
    let inBrush = false;

    if (mMode > 0 || eMode > 0) {
      const acc = brushAcc;
      acc.ax = 0;
      acc.ay = 0;
      acc.kickX = 0;
      acc.kickY = 0;
      acc.vxi = vxi;
      acc.vyi = vyi;
      acc.flags = f;
      acc.sleep = sleep[i]!;
      acc.inBrush = false;
      const fluid = params.sph;
      applyOneBrush(acc, mMode, pointer.x, pointer.y, brushRadius, brushStrength, x, y, fluid);
      applyOneBrush(
        acc,
        eMode,
        extra.x,
        extra.y,
        extra.radius,
        extra.force,
        x,
        y,
        fluid,
      );
      ax += acc.ax;
      ay += acc.ay;
      kickX = acc.kickX;
      kickY = acc.kickY;
      vxi = acc.vxi;
      vyi = acc.vyi;
      flags[i] = acc.flags;
      sleep[i] = acc.sleep;
      inBrush = acc.inBrush;
    }

    if (params.flock) {
      flockForce(i, soa, hash, params, (fx, fy) => {
        ax += fx;
        ay += fy;
      });
    }

    if (params.nbody) {
      if (pairwiseNbody) {
        const mi = mass[i]!;
        const G = params.nbodyG;
        for (let j = 0; j < n; j++) {
          if (j === i) continue;
          const dx = px[j]! - x;
          const dy = py[j]! - y;
          const d2 = dx * dx + dy * dy + eps;
          const inv = (G * mi * mass[j]!) / (d2 * Math.sqrt(d2));
          ax += dx * inv;
          ay += dy * inv;
        }
      } else {
        const mi = mass[i]!;
        const G = params.nbodyG;
        hash.query(x, y, (j) => {
          if (j === i) return;
          const dx = px[j]! - x;
          const dy = py[j]! - y;
          const d2 = dx * dx + dy * dy + eps;
          const inv = (G * mi * mass[j]!) / (d2 * Math.sqrt(d2));
          ax += dx * inv;
          ay += dy * inv;
        });
      }
    }

    // SPH pressure/viscosity otherwise clamp the brush away. Weaken them in the
    // stroke so attract/repel/vortex can actually carve a fluid.
    const forceBrush = (mMode > 0 && mMode !== 6) || (eMode > 0 && eMode !== 6);
    if (inBrush && params.sph && forceBrush) {
      ax *= 0.08;
      ay *= 0.08;
    }

    ax = clamp(ax, -maxA, maxA);
    ay = clamp(ay, -maxA, maxA);

    vxi = (vxi + ax * dt) * damp + kickX;
    vyi = (vyi + ay * dt) * damp + kickY;

    const speedCap = inBrush && params.sph && forceBrush ? maxS * 1.85 : maxS;
    const speedCap2 = speedCap * speedCap;
    const sp2 = vxi * vxi + vyi * vyi;
    if (sp2 > speedCap2) {
      const invs = speedCap / Math.sqrt(sp2);
      vxi *= invs;
      vyi *= invs;
    }

    if (inBrush && params.sph && forceBrush) {
      x += kickX * 0.022;
      y += kickY * 0.022;
    }

    if (params.settle) {
      if (vxi * vxi + vyi * vyi < settleTh2 && mMode === 0 && eMode === 0) {
        const t = sleep[i]! + 1;
        sleep[i] = t;
        if (t > 18) {
          vxi = 0;
          vyi = 0;
          flags[i] = f | FLAG_SLEEP;
          stats.sleeping++;
        }
      } else {
        sleep[i] = 0;
        flags[i] = f & ~FLAG_SLEEP;
      }
    }

    prevx[i] = x;
    prevy[i] = y;
    x += vxi * dt;
    y += vyi * dt;

    if (params.collide && needHash) {
      hash.query(x, y, (j) => {
        if (j <= i) return;
        const dx = px[j]! - x;
        const dy = py[j]! - y;
        const d2 = dx * dx + dy * dy;
        if (d2 > twoR2 || d2 < 1e-12) return;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const ny = dy / d;
        const overlap = twoR - d;
        const mj = mass[j]!;
        const mi = mass[i]!;
        const inv = 1 / (mi + mj);
        x -= nx * overlap * mj * inv;
        y -= ny * overlap * mj * inv;
        px[j] = px[j]! + nx * overlap * mi * inv;
        py[j] = py[j]! + ny * overlap * mi * inv;
        const rvx = vx[j]! - vxi;
        const rvy = vy[j]! - vyi;
        const vn = rvx * nx + rvy * ny;
        if (vn > 0) return;
        const imp = (-(1 + rest) * vn) / (1 / mi + 1 / mj);
        vxi -= (imp / mi) * nx;
        vyi -= (imp / mi) * ny;
        vx[j] = vx[j]! + (imp / mj) * nx;
        vy[j] = vy[j]! + (imp / mj) * ny;
        sleep[i] = 0;
        sleep[j] = 0;
        flags[i] = flags[i]! & ~FLAG_SLEEP;
        flags[j] = flags[j]! & ~FLAG_SLEEP;
      });
    }

    let oob = false;
    
    // Wall Collisions
    if (walls && walls.length > 0) {
      for (let w = 0; w < walls.length; w++) {
        const wall = walls[w];
        const ax = wall.x1;
        const ay = wall.y1;
        const bx = wall.x2;
        const by = wall.y2;
        
        const abx = bx - ax;
        const aby = by - ay;
        const apx = x - ax;
        const apy = y - ay;
        
        const apx_prev = prevx[i]! - ax;
        const apy_prev = prevy[i]! - ay;
        
        const lenSq = abx*abx + aby*aby;
        if (lenSq > 0) {
          let t = (apx*abx + apy*aby) / lenSq;
          t = Math.max(0, Math.min(1, t));
          const closestX = ax + t * abx;
          const closestY = ay + t * aby;
          
          const dx = x - closestX;
          const dy = y - closestY;
          const distSq = dx*dx + dy*dy;
          
          if (distSq < pr * pr) {
            const dist = Math.sqrt(distSq);
            const nx = dx / (dist || 0.0001);
            const ny = dy / (dist || 0.0001);
            
            x = closestX + nx * pr;
            y = closestY + ny * pr;
            
            const vDot = vxi * nx + vyi * ny;
            if (vDot < 0) {
              vxi -= (1.0 + rest) * vDot * nx;
              vyi -= (1.0 + rest) * vDot * ny;
            }
          
          } else {
            const cp_prev = apx_prev * aby - apy_prev * abx;
            const cp_nxt = apx * aby - apy * abx;
            if (cp_prev * cp_nxt < 0) {
              const u = cp_prev / (cp_prev - cp_nxt);
              const p_int_x = apx_prev + u * (apx - apx_prev);
              const p_int_y = apy_prev + u * (apy - apy_prev);
              const t_wall = (p_int_x * abx + p_int_y * aby) / lenSq;
              
              if (t_wall >= 0.0 && t_wall <= 1.0) {
                const invLen = 1.0 / Math.sqrt(lenSq);
                let nx = -aby * invLen;
                let ny = abx * invLen;
                
                if (apx_prev * nx + apy_prev * ny < 0) {
                  nx = -nx;
                  ny = -ny;
                }
                
                const ix = ax + t_wall * abx;
                const iy = ay + t_wall * aby;
                
                x = ix + nx * pr;
                y = iy + ny * pr;
                
                const vDot = vxi * nx + vyi * ny;
                if (vDot < 0) {
                  vxi -= (1.0 + rest) * vDot * nx;
                  vyi -= (1.0 + rest) * vDot * ny;
                }
              }
            }
          }

        }
      }
    }

    if (x < 0 || x > worldW || y < 0 || y > worldH) {
      oob = true;
      stats.oob++;
      if (params.boundary === "wrap") {
        x = ((x % worldW) + worldW) % worldW;
        y = ((y % worldH) + worldH) % worldH;
      } else if (params.boundary === "destroy") {
        life[i] = 0;
      } else {
        if (x < 0) {
          x = 0;
          vxi = Math.abs(vxi) * rest;
        } else if (x > worldW) {
          x = worldW;
          vxi = -Math.abs(vxi) * rest;
        }
        if (y < 0) {
          y = 0;
          vyi = Math.abs(vyi) * rest;
        } else if (y > worldH) {
          y = worldH;
          vyi = -Math.abs(vyi) * rest;
        }
      }
    }
    void oob;

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(vxi) || !Number.isFinite(vyi)) {
      stats.nan++;
      life[i] = 0;
      x = worldW * 0.5;
      y = worldH * 0.5;
      vxi = 0;
      vyi = 0;
    }

    if (lifespan > 0 && life[i]! > 0) {
      life[i] = life[i]! - dt;
      if (life[i]! <= 0) life[i] = 0;
    }

    px[i] = x;
    py[i] = y;
    vx[i] = vxi;
    vy[i] = vyi;
  }

  if (springs.length > 0) {
    solveCloth(soa, springs, params.clothIterations);
  }

  compactDead(soa, springs);
  return stats;
}

function flockForce(
  i: number,
  soa: ParticleSoA,
  hash: SpatialHash,
  params: LabParams,
  add: (x: number, y: number) => void,
): void {
  const x = soa.posX[i]!;
  const y = soa.posY[i]!;
  const vxi = soa.velX[i]!;
  const vyi = soa.velY[i]!;
  const R = params.flockRadius;
  const R2 = R * R;
  const sepR = R * 0.45;
  const sepR2 = sepR * sepR;
  let sx = 0,
    sy = 0,
    ax = 0,
    ay = 0,
    cx = 0,
    cy = 0,
    c = 0;
  hash.query(x, y, (j) => {
    if (j === i) return;
    const dx = soa.posX[j]! - x;
    const dy = soa.posY[j]! - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > R2 || d2 < 1e-12) return;
    c++;
    ax += soa.velX[j]!;
    ay += soa.velY[j]!;
    cx += soa.posX[j]!;
    cy += soa.posY[j]!;
    if (d2 < sepR2) {
      const d = Math.sqrt(d2);
      sx -= dx / d;
      sy -= dy / d;
    }
  });
  if (c === 0) return;
  const invc = 1 / c;
  ax = ax * invc - vxi;
  ay = ay * invc - vyi;
  cx = cx * invc - x;
  cy = cy * invc - y;
  add(
    sx * params.flockSep * 6 + ax * params.flockAli * 4 + cx * params.flockCoh * 8,
    sy * params.flockSep * 6 + ay * params.flockAli * 4 + cy * params.flockCoh * 8,
  );
}

function sphDensity(soa: ParticleSoA, hash: SpatialHash, params: LabParams, n: number): void {
  const h = Math.max(params.sphSmoothing, 0.005);
  const h2 = h * h;
  const px = soa.posX;
  const py = soa.posY;
  const dens = soa.density;
  const pres = soa.pressure;
  const mass = soa.mass;
  const rest = params.sphRestDensity;
  const k = params.sphPressure;
  const invH = 1 / h;
  const normFactor = 4 / (Math.PI * h2);

  for (let i = 0; i < n; i++) {
    let rho = mass[i]! * normFactor;
    const x = px[i]!;
    const y = py[i]!;
    hash.query(x, y, (j) => {
      if (j === i) return;
      const dx = px[j]! - x;
      const dy = py[j]! - y;
      const r2 = dx * dx + dy * dy;
      if (r2 >= h2) return;
      const r = Math.sqrt(r2);
      const q = 1 - r * invH;
      rho += mass[j]! * normFactor * q * q;
    });
    dens[i] = rho;
    pres[i] = Math.max(0, k * (rho - rest));
  }
}

function sphForces(soa: ParticleSoA, hash: SpatialHash, params: LabParams, n: number): void {
  const h = Math.max(params.sphSmoothing, 0.005);
  const h2 = h * h;
  const invH = 1 / h;
  const px = soa.posX;
  const py = soa.posY;
  const vx = soa.velX;
  const vy = soa.velY;
  const dens = soa.density;
  const pres = soa.pressure;
  const mass = soa.mass;
  const ax = soa.accX;
  const ay = soa.accY;
  const mu = params.sphViscosity;

  for (let i = 0; i < n; i++) {
    let fx = 0,
      fy = 0;
    const x = px[i]!;
    const y = py[i]!;
    const pi = pres[i]!;
    const di = Math.max(dens[i]!, 0.1);

    hash.query(x, y, (j) => {
      if (j === i) return;
      const dx = x - px[j]!;
      const dy = y - py[j]!;
      const r2 = dx * dx + dy * dy;
      if (r2 >= h2 || r2 < 1e-12) return;
      const r = Math.sqrt(r2);
      const q = 1 - r * invH;
      const dj = Math.max(dens[j]!, 0.1);
      const mj = mass[j]!;

      // Spiky pressure force
      const pTerm = ((pi + pres[j]!) / (2 * dj)) * mj * q * q * 18;
      fx += (dx / r) * pTerm;
      fy += (dy / r) * pTerm;

      // Viscosity smoothing force
      const vTerm = mu * mj * (q / dj) * 35;
      fx += (vx[j]! - vx[i]!) * vTerm;
      fy += (vy[j]! - vy[i]!) * vTerm;
    });

    ax[i] = fx / di;
    ay[i] = fy / di;
  }
}

function solveCloth(soa: ParticleSoA, springs: Spring[], iterations: number): void {
  const px = soa.posX;
  const py = soa.posY;
  const flags = soa.flags;
  const iters = Math.max(1, iterations | 0);
  for (let k = 0; k < iters; k++) {
    for (let s = 0; s < springs.length; s++) {
      const sp = springs[s]!;
      const a = sp.a;
      const b = sp.b;
      if (a >= soa.count || b >= soa.count) continue;
      const dx = px[b]! - px[a]!;
      const dy = py[b]! - py[a]!;
      const dist = Math.sqrt(dx * dx + dy * dy) + 1e-8;
      const diff = (dist - sp.rest) / dist;
      const stiffness = sp.k;
      const pa = (flags[a]! & FLAG_PINNED) !== 0;
      const pb = (flags[b]! & FLAG_PINNED) !== 0;
      if (pa && pb) continue;
      const corrX = dx * diff * stiffness;
      const corrY = dy * diff * stiffness;
      if (pa) {
        px[b] = px[b]! - corrX;
        py[b] = py[b]! - corrY;
      } else if (pb) {
        px[a] = px[a]! + corrX;
        py[a] = py[a]! + corrY;
      } else {
        px[a] = px[a]! + corrX * 0.5;
        py[a] = py[a]! + corrY * 0.5;
        px[b] = px[b]! - corrX * 0.5;
        py[b] = py[b]! - corrY * 0.5;
      }
    }
  }
}

function compactDead(soa: ParticleSoA, springs: Spring[]): void {
  const life = soa.life;
  let i = 0;
  while (i < soa.count) {
    const L = life[i]!;
    if (L === 0) {
      const last = soa.count - 1;
      soa.killSwap(i);
      if (springs.length > 0) {
        for (let s = springs.length - 1; s >= 0; s--) {
          const sp = springs[s]!;
          if (sp.a === i || sp.b === i || sp.a === last || sp.b === last) {
            if (sp.a === last) sp.a = i;
            if (sp.b === last) sp.b = i;
            if (sp.a === i || sp.b === i) {
              /* keep if remapped from last */
            }
            if (sp.a === last || sp.b === last || sp.a >= soa.count || sp.b >= soa.count) {
              springs.splice(s, 1);
            }
          }
        }
      }
      continue;
    }
    i++;
  }
}
