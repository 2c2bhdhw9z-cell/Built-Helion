@@
   private staging = new Float32Array(UNIFORM_BYTES / 4);
   private stagingU = new Uint32Array(this.staging.buffer);
   private lastPalette = "";
   private readingStats = false;
   // Reusable temporary arrays to avoid per-frame allocations in upload paths.
   private tmpPosPrev: Float32Array | null = null;
   private tmpVel: Float32Array | null = null;
   private tmpLmp: Float32Array | null = null;
   private tmpWalls: Float32Array | null = null;
 @@
   uploadSoA(soa: ParticleSoA): void {
     const n = soa.count;
     if (n === 0) {
-      const zeros = new Float32Array(64);
-      this.device.queue.writeBuffer(this.posPrevBuf, 0, zeros);
-      this.device.queue.writeBuffer(this.lifeMassPhaseBuf, 0, zeros);
+      const zeros = new Float32Array(64);
+      this.device.queue.writeBuffer(this.posPrevBuf, 0, zeros);
+      this.device.queue.writeBuffer(this.velBuf, 0, zeros);
+      this.device.queue.writeBuffer(this.lifeMassPhaseBuf, 0, zeros);
       return;
     }
@@
   }
 
@@
   // Write walls buffer (reuse a temporary to avoid allocation churn)
   if (!this.tmpWalls || this.tmpWalls.length < 256 * 4 + 4) this.tmpWalls = new Float32Array(256 * 4 + 4);
   const wBuf = this.tmpWalls;
   wBuf[0] = walls.length;
   for (let i = 0; i < walls.length; i++) {
     wBuf[4 + i * 4 + 0] = walls[i].x1;
     wBuf[4 + i * 4 + 1] = walls[i].y1;
     wBuf[4 + i * 4 + 2] = walls[i].x2;
     wBuf[4 + i * 4 + 3] = walls[i].y2;
   }
   this.device.queue.writeBuffer(this.wallsBuf, 0, wBuf.buffer);
 @@
 }
