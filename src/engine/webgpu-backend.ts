@@
   private staging = new Float32Array(UNIFORM_BYTES / 4);
   private stagingU = new Uint32Array(this.staging.buffer);
   private lastPalette = "";
   private readingStats = false;
+  // Reusable temporary arrays to avoid per-frame allocations in upload paths.
+  private tmpPosPrev: Float32Array | null = null;
+  private tmpVel: Float32Array | null = null;
+  private tmpLmp: Float32Array | null = null;
+  private tmpWalls: Float32Array | null = null;
@@
   uploadSlice(soa: ParticleSoA, start: number, end: number): void {
     const n = end - start;
     if (n <= 0) return;
-    const posPrev = new Float32Array(n * 4);
-    const vel = new Float32Array(n * 2);
-    const lmp = new Float32Array(n * 4);
-
-    for (let i = 0; i < n; i++) {
-      const idx = start + i;
-      posPrev[i * 4 + 0] = soa.posX[idx]!;
-      posPrev[i * 4 + 1] = soa.posY[idx]!;
-      posPrev[i * 4 + 2] = soa.prevX[idx]!;
-      posPrev[i * 4 + 3] = soa.prevY[idx]!;
-      vel[i * 2 + 0] = soa.velX[idx]!;
-      vel[i * 2 + 1] = soa.velY[idx]!;
-      lmp[i * 4 + 0] = soa.life[idx]!;
-      lmp[i * 4 + 1] = soa.mass[idx]!;
-      lmp[i * 4 + 2] = soa.phase[idx]!;
-      lmp[i * 4 + 3] = soa.flags[idx]!;
-    }
-
-    this.device.queue.writeBuffer(this.posPrevBuf, start * 16, posPrev);
-    this.device.queue.writeBuffer(this.velBuf, start * 8, vel);
-    this.device.queue.writeBuffer(this.lifeMassPhaseBuf, start * 16, lmp);
+    // ensure temporary arrays are available and large enough
+    const needPos = n * 4;
+    const needVel = n * 2;
+    const needLmp = n * 4;
+    if (!this.tmpPosPrev || this.tmpPosPrev.length < needPos) this.tmpPosPrev = new Float32Array(needPos);
+    if (!this.tmpVel || this.tmpVel.length < needVel) this.tmpVel = new Float32Array(needVel);
+    if (!this.tmpLmp || this.tmpLmp.length < needLmp) this.tmpLmp = new Float32Array(needLmp);
+
+    const posPrev = this.tmpPosPrev.subarray(0, needPos);
+    const vel = this.tmpVel.subarray(0, needVel);
+    const lmp = this.tmpLmp.subarray(0, needLmp);
+
+    for (let i = 0; i < n; i++) {
+      const idx = start + i;
+      posPrev[i * 4 + 0] = soa.posX[idx]!;
+      posPrev[i * 4 + 1] = soa.posY[idx]!;
+      posPrev[i * 4 + 2] = soa.prevX[idx]!;
+      posPrev[i * 4 + 3] = soa.prevY[idx]!;
+      vel[i * 2 + 0] = soa.velX[idx]!;
+      vel[i * 2 + 1] = soa.velY[idx]!;
+      lmp[i * 4 + 0] = soa.life[idx]!;
+      lmp[i * 4 + 1] = soa.mass[idx]!;
+      lmp[i * 4 + 2] = soa.phase[idx]!;
+      lmp[i * 4 + 3] = soa.flags[idx]!;
+    }
+
+    this.device.queue.writeBuffer(this.posPrevBuf, start * 16, posPrev);
+    this.device.queue.writeBuffer(this.velBuf, start * 8, vel);
+    this.device.queue.writeBuffer(this.lifeMassPhaseBuf, start * 16, lmp);
   }
@@
   uploadSoA(soa: ParticleSoA): void {
     const n = soa.count;
     if (n === 0) {
       const zeros = new Float32Array(64);
       this.device.queue.writeBuffer(this.posPrevBuf, 0, zeros);
       this.device.queue.writeBuffer(this.lifeMassPhaseBuf, 0, zeros);
       return;
     }
-    const posPrev = new Float32Array(n * 4);
-    const vel = new Float32Array(n * 2);
-    const lmp = new Float32Array(n * 4);
-    for (let i = 0; i < n; i++) {
-      posPrev[i * 4 + 0] = soa.posX[i]!;
-      posPrev[i * 4 + 1] = soa.posY[i]!;
-      posPrev[i * 4 + 2] = soa.prevX[i]!;
-      posPrev[i * 4 + 3] = soa.prevY[i]!;
-      vel[i * 2 + 0] = soa.velX[i]!;
-      vel[i * 2 + 1] = soa.velY[i]!;
-      lmp[i * 4 + 0] = soa.life[i]!;
-      lmp[i * 4 + 1] = soa.mass[i]!;
-      lmp[i * 4 + 2] = soa.phase[i]!;
-      lmp[i * 4 + 3] = soa.flags[i]!;
-    }
-    this.device.queue.writeBuffer(this.posPrevBuf, 0, posPrev);
-    this.device.queue.writeBuffer(this.velBuf, 0, vel);
-    this.device.queue.writeBuffer(this.lifeMassPhaseBuf, 0, lmp);
+    // reuse temporaries to avoid per-frame allocations
+    const needPos = n * 4;
+    const needVel = n * 2;
+    const needLmp = n * 4;
+    if (!this.tmpPosPrev || this.tmpPosPrev.length < needPos) this.tmpPosPrev = new Float32Array(needPos);
+    if (!this.tmpVel || this.tmpVel.length < needVel) this.tmpVel = new Float32Array(needVel);
+    if (!this.tmpLmp || this.tmpLmp.length < needLmp) this.tmpLmp = new Float32Array(needLmp);
+    const posPrev = this.tmpPosPrev.subarray(0, needPos);
+    const vel = this.tmpVel.subarray(0, needVel);
+    const lmp = this.tmpLmp.subarray(0, needLmp);
+
+    for (let i = 0; i < n; i++) {
+      posPrev[i * 4 + 0] = soa.posX[i]!;
+      posPrev[i * 4 + 1] = soa.posY[i]!;
+      posPrev[i * 4 + 2] = soa.prevX[i]!;
+      posPrev[i * 4 + 3] = soa.prevY[i]!;
+      vel[i * 2 + 0] = soa.velX[i]!;
+      vel[i * 2 + 1] = soa.velY[i]!;
+      lmp[i * 4 + 0] = soa.life[i]!;
+      lmp[i * 4 + 1] = soa.mass[i]!;
+      lmp[i * 4 + 2] = soa.phase[i]!;
+      lmp[i * 4 + 3] = soa.flags[i]!;
+    }
+    this.device.queue.writeBuffer(this.posPrevBuf, 0, posPrev);
+    this.device.queue.writeBuffer(this.velBuf, 0, vel);
+    this.device.queue.writeBuffer(this.lifeMassPhaseBuf, 0, lmp);
   }
@@
-    // Write walls buffer
-    const wBuf = new Float32Array(256 * 4 + 4);
-    wBuf[0] = walls.length;
-    for (let i = 0; i < walls.length; i++) {
-      wBuf[4 + i * 4 + 0] = walls[i].x1;
-      wBuf[4 + i * 4 + 1] = walls[i].y1;
-      wBuf[4 + i * 4 + 2] = walls[i].x2;
-      wBuf[4 + i * 4 + 3] = walls[i].y2;
-    }
-    this.device.queue.writeBuffer(this.wallsBuf, 0, wBuf.buffer);
+    // Write walls buffer (reuse a temporary to avoid allocation churn)
+    if (!this.tmpWalls || this.tmpWalls.length < 256 * 4 + 4) this.tmpWalls = new Float32Array(256 * 4 + 4);
+    const wBuf = this.tmpWalls;
+    wBuf[0] = walls.length;
+    for (let i = 0; i < walls.length; i++) {
+      wBuf[4 + i * 4 + 0] = walls[i].x1;
+      wBuf[4 + i * 4 + 1] = walls[i].y1;
+      wBuf[4 + i * 4 + 2] = walls[i].x2;
+      wBuf[4 + i * 4 + 3] = walls[i].y2;
+    }
+    this.device.queue.writeBuffer(this.wallsBuf, 0, wBuf.buffer);
@@
   }
