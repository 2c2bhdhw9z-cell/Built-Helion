@@
-import { SYSTEM_LIMIT } from "./types";
-
-export class ParticleSoA {
-  capacity: number;
-  count = 0;
-
-  posX: Float32Array;
-  posY: Float32Array;
-  velX: Float32Array;
-  velY: Float32Array;
-  prevX: Float32Array;
-  prevY: Float32Array;
-  accX: Float32Array;
-  accY: Float32Array;
-  life: Float32Array;
-  maxLife: Float32Array;
-  mass: Float32Array;
-  density: Float32Array;
-  pressure: Float32Array;
-  phase: Float32Array;
-  flags: Uint32Array;
-  sleep: Uint16Array;
-
-  constructor(capacity: number) {
-    this.capacity = 0;
-    this.posX = new Float32Array(0);
-    this.posY = new Float32Array(0);
-    this.velX = new Float32Array(0);
-    this.velY = new Float32Array(0);
-    this.prevX = new Float32Array(0);
-    this.prevY = new Float32Array(0);
-    this.accX = new Float32Array(0);
-    this.accY = new Float32Array(0);
-    this.life = new Float32Array(0);
-    this.maxLife = new Float32Array(0);
-    this.mass = new Float32Array(0);
-    this.density = new Float32Array(0);
-    this.pressure = new Float32Array(0);
-    this.phase = new Float32Array(0);
-    this.flags = new Uint32Array(0);
-    this.sleep = new Uint16Array(0);
-    this.allocate(capacity);
-  }
-
-  byteSize(): number {
-    const n = this.capacity;
-    return n * (4 * 14 + 4 + 2);
-  }
-
-  allocate(capacity: number): void {
-    const cap = Math.max(1, Math.min(SYSTEM_LIMIT, capacity | 0));
-    const old = this.capacity;
-    const keep = Math.min(this.count, cap);
-    const alloc = (Ctor: Float32ArrayConstructor | Uint32ArrayConstructor | Uint16ArrayConstructor, prev: ArrayBufferView) => {
-      const next = new Ctor(cap);
-      if (keep > 0) (next as Float32Array).set((prev as Float32Array).subarray(0, keep));
-      return next;
-    };
-    this.posX = alloc(Float32Array, this.posX) as Float32Array;
-    this.posY = alloc(Float32Array, this.posY) as Float32Array;
-    this.velX = alloc(Float32Array, this.velX) as Float32Array;
-    this.velY = alloc(Float32Array, this.velY) as Float32Array;
-    this.prevX = alloc(Float32Array, this.prevX) as Float32Array;
-    this.prevY = alloc(Float32Array, this.prevY) as Float32Array;
-    this.accX = alloc(Float32Array, this.accX) as Float32Array;
-    this.accY = alloc(Float32Array, this.accY) as Float32Array;
-    this.life = alloc(Float32Array, this.life) as Float32Array;
-    this.maxLife = alloc(Float32Array, this.maxLife) as Float32Array;
-    this.mass = alloc(Float32Array, this.mass) as Float32Array;
-    this.density = alloc(Float32Array, this.density) as Float32Array;
-    this.pressure = alloc(Float32Array, this.pressure) as Float32Array;
-    this.phase = alloc(Float32Array, this.phase) as Float32Array;
-    this.flags = alloc(Uint32Array, this.flags) as Uint32Array;
-    this.sleep = alloc(Uint16Array, this.sleep) as Uint16Array;
-    this.capacity = cap;
-    this.count = keep;
-    void old;
-  }
-
-  clear(): void {
-    this.count = 0;
-  }
-
-  spawnSlot(): number {
-    if (this.count >= this.capacity) return -1;
-    const i = this.count++;
-    this.flags[i] = 0;
-    this.sleep[i] = 0;
-    this.density[i] = 0;
-    this.pressure[i] = 0;
-    this.accX[i] = 0;
-    this.accY[i] = 0;
-    return i;
-  }
-
-  writeParticle(
-    i: number,
-    x: number,
-    y: number,
-    vx: number,
-    vy: number,
-    life: number,
-    mass: number,
-    flags = 0,
-    phase?: number,
-  ): void {
-    this.posX[i] = x;
-    this.posY[i] = y;
-    this.prevX[i] = x;
-    this.prevY[i] = y;
-    this.velX[i] = vx;
-    this.velY[i] = vy;
-    this.life[i] = life;
-    this.maxLife[i] = life < 0 ? 1 : Math.max(life, 1e-4);
-    this.mass[i] = mass;
-    this.phase[i] = phase ?? Math.random();
-    this.flags[i] = flags;
-    this.sleep[i] = 0;
-  }
-
-  scaleX(sx: number): void {
-    if (!Number.isFinite(sx) || sx === 1) return;
-    const n = this.count;
-    for (let i = 0; i < n; i++) {
-      this.posX[i] *= sx;
-      this.prevX[i] *= sx;
-      this.velX[i] *= sx;
-    }
-  }
-
-  /** Shift live particles (and their Verlet prev) by a world-space delta. */
-  translate(dx: number, dy: number): void {
-    if ((!dx && !dy) || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
-    const n = this.count;
-    for (let i = 0; i < n; i++) {
-      this.posX[i] += dx;
-      this.posY[i] += dy;
-      this.prevX[i] += dx;
-      this.prevY[i] += dy;
-    }
-  }
-
-  killSwap(i: number): void {
-    const last = this.count - 1;
-    if (i < 0 || i >= this.count) return;
-    if (i !== last) {
-      this.posX[i] = this.posX[last];
-      this.posY[i] = this.posY[last];
-      this.velX[i] = this.velX[last];
-      this.velY[i] = this.velY[last];
-      this.prevX[i] = this.prevX[last];
-      this.prevY[i] = this.prevY[last];
-      this.accX[i] = this.accX[last];
-      this.accY[i] = this.accY[last];
-      this.life[i] = this.life[last];
-      this.maxLife[i] = this.maxLife[last];
-      this.mass[i] = this.mass[last];
-      this.density[i] = this.density[last];
-      this.pressure[i] = this.pressure[last];
-      this.phase[i] = this.phase[last];
-      this.flags[i] = this.flags[last];
-      this.sleep[i] = this.sleep[last];
-    }
-    this.count = last;
-  }
-}
+import { SYSTEM_LIMIT } from "./types";
+
+export class ParticleSoA {
+  capacity: number;
+  count = 0;
+
+  posX: Float32Array;
+  posY: Float32Array;
+  velX: Float32Array;
+  velY: Float32Array;
+  prevX: Float32Array;
+  prevY: Float32Array;
+  accX: Float32Array;
+  accY: Float32Array;
+  life: Float32Array;
+  maxLife: Float32Array;
+  mass: Float32Array;
+  density: Float32Array;
+  pressure: Float32Array;
+  phase: Float32Array;
+  flags: Uint32Array;
+  sleep: Uint16Array;
+
+  constructor(capacity: number) {
+    // start empty and let allocate create buffers
+    this.capacity = 0;
+    this.posX = new Float32Array(0);
+    this.posY = new Float32Array(0);
+    this.velX = new Float32Array(0);
+    this.velY = new Float32Array(0);
+    this.prevX = new Float32Array(0);
+    this.prevY = new Float32Array(0);
+    this.accX = new Float32Array(0);
+    this.accY = new Float32Array(0);
+    this.life = new Float32Array(0);
+    this.maxLife = new Float32Array(0);
+    this.mass = new Float32Array(0);
+    this.density = new Float32Array(0);
+    this.pressure = new Float32Array(0);
+    this.phase = new Float32Array(0);
+    this.flags = new Uint32Array(0);
+    this.sleep = new Uint16Array(0);
+    this.allocate(capacity);
+  }
+
+  /**
+   * Return the true byte size of all typed-arrays backing the SoA.
+   * This is the accurate sum of BYTES_PER_ELEMENT across the current capacity.
+   */
+  byteSize(): number {
+    const n = this.capacity;
+    // sum bytes for each typed-array field
+    let bytes = 0;
+    bytes += this.posX.BYTES_PER_ELEMENT * n;
+    bytes += this.posY.BYTES_PER_ELEMENT * n;
+    bytes += this.velX.BYTES_PER_ELEMENT * n;
+    bytes += this.velY.BYTES_PER_ELEMENT * n;
+    bytes += this.prevX.BYTES_PER_ELEMENT * n;
+    bytes += this.prevY.BYTES_PER_ELEMENT * n;
+    bytes += this.accX.BYTES_PER_ELEMENT * n;
+    bytes += this.accY.BYTES_PER_ELEMENT * n;
+    bytes += this.life.BYTES_PER_ELEMENT * n;
+    bytes += this.maxLife.BYTES_PER_ELEMENT * n;
+    bytes += this.mass.BYTES_PER_ELEMENT * n;
+    bytes += this.density.BYTES_PER_ELEMENT * n;
+    bytes += this.pressure.BYTES_PER_ELEMENT * n;
+    bytes += this.phase.BYTES_PER_ELEMENT * n;
+    bytes += this.flags.BYTES_PER_ELEMENT * n;
+    bytes += this.sleep.BYTES_PER_ELEMENT * n;
+    return bytes;
+  }
+
+  /**
+   * Allocate or resize backing typed-arrays. Grow geometrically to avoid
+   * repeated small reallocations which cause GC / frame hitches. Shrink only
+   * when requested capacity is less than half the current capacity.
+   */
+  allocate(requested: number): void {
+    const want = Math.max(1, Math.min(SYSTEM_LIMIT, requested | 0));
+    // if current capacity already satisfies request and we're not shrinking, do nothing
+    if (want <= this.capacity && want >= Math.floor(this.capacity / 2)) {
+      // keep existing buffers
+      this.count = Math.min(this.count, want);
+      return;
+    }
+
+    // geometric growth: grow to at least requested, but at least 1.5x current to reduce churn
+    let cap = want;
+    if (cap > this.capacity && this.capacity > 0) {
+      cap = Math.max(cap, Math.floor(this.capacity * 1.5));
+      cap = Math.min(cap, SYSTEM_LIMIT);
+    }
+
+    const oldCap = this.capacity;
+    const keep = Math.min(this.count, cap);
+
+    const copy = <T extends ArrayBufferView>(Ctor: any, prev: T): T => {
+      const next = new Ctor(cap);
+      if (keep > 0 && prev.length > 0) next.set(prev.subarray(0, keep) as any);
+      return next as T;
+    };
+
+    this.posX = copy(Float32Array, this.posX);
+    this.posY = copy(Float32Array, this.posY);
+    this.velX = copy(Float32Array, this.velX);
+    this.velY = copy(Float32Array, this.velY);
+    this.prevX = copy(Float32Array, this.prevX);
+    this.prevY = copy(Float32Array, this.prevY);
+    this.accX = copy(Float32Array, this.accX);
+    this.accY = copy(Float32Array, this.accY);
+    this.life = copy(Float32Array, this.life);
+    this.maxLife = copy(Float32Array, this.maxLife);
+    this.mass = copy(Float32Array, this.mass);
+    this.density = copy(Float32Array, this.density);
+    this.pressure = copy(Float32Array, this.pressure);
+    this.phase = copy(Float32Array, this.phase);
+    this.flags = copy(Uint32Array, this.flags);
+    this.sleep = copy(Uint16Array, this.sleep);
+
+    this.capacity = cap;
+    this.count = keep;
+    void oldCap;
+  }
+
+  clear(): void {
+    // fast clear: reset count without zeroing buffers
+    this.count = 0;
+  }
+
+  spawnSlot(): number {
+    if (this.count >= this.capacity) return -1;
+    const i = this.count++;
+    // initialize common fields to safe defaults to avoid reading uninitialized garbage
+    this.posX[i] = 0;
+    this.posY[i] = 0;
+    this.prevX[i] = 0;
+    this.prevY[i] = 0;
+    this.velX[i] = 0;
+    this.velY[i] = 0;
+    this.flags[i] = 0;
+    this.sleep[i] = 0;
+    this.density[i] = 0;
+    this.pressure[i] = 0;
+    this.accX[i] = 0;
+    this.accY[i] = 0;
+    this.life[i] = 0;
+    this.maxLife[i] = 1;
+    this.mass[i] = 1;
+    this.phase[i] = Math.random();
+    return i;
+  }
+
+  writeParticle(
+    i: number,
+    x: number,
+    y: number,
+    vx: number,
+    vy: number,
+    life: number,
+    mass: number,
+    flags = 0,
+    phase?: number,
+  ): void {
+    this.posX[i] = x;
+    this.posY[i] = y;
+    this.prevX[i] = x;
+    this.prevY[i] = y;
+    this.velX[i] = vx;
+    this.velY[i] = vy;
+    this.life[i] = life;
+    this.maxLife[i] = life < 0 ? 1 : Math.max(life, 1e-4);
+    this.mass[i] = mass;
+    this.phase[i] = phase ?? Math.random();
+    this.flags[i] = flags;
+    this.sleep[i] = 0;
+  }
+
+  scaleX(sx: number): void {
+    if (!Number.isFinite(sx) || sx === 1) return;
+    const n = this.count;
+    for (let i = 0; i < n; i++) {
+      this.posX[i] *= sx;
+      this.prevX[i] *= sx;
+      this.velX[i] *= sx;
+    }
+  }
+
+  /** Shift live particles (and their Verlet prev) by a world-space delta. */
+  translate(dx: number, dy: number): void {
+    if ((!dx && !dy) || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
+    const n = this.count;
+    for (let i = 0; i < n; i++) {
+      this.posX[i] += dx;
+      this.posY[i] += dy;
+      this.prevX[i] += dx;
+      this.prevY[i] += dy;
+    }
+  }
+
+  killSwap(i: number): void {
+    const last = this.count - 1;
+    if (i < 0 || i >= this.count) return;
+    if (i !== last) {
+      this.posX[i] = this.posX[last];
+      this.posY[i] = this.posY[last];
+      this.velX[i] = this.velX[last];
+      this.velY[i] = this.velY[last];
+      this.prevX[i] = this.prevX[last];
+      this.prevY[i] = this.prevY[last];
+      this.accX[i] = this.accX[last];
+      this.accY[i] = this.accY[last];
+      this.life[i] = this.life[last];
+      this.maxLife[i] = this.maxLife[last];
+      this.mass[i] = this.mass[last];
+      this.density[i] = this.density[last];
+      this.pressure[i] = this.pressure[last];
+      this.phase[i] = this.phase[last];
+      this.flags[i] = this.flags[last];
+      this.sleep[i] = this.sleep[last];
+    }
+    this.count = last;
+  }
+}
