import { HASH_MAX_PER_CELL } from "./types";

export class SpatialHash {
  cellSize = 0.04;
  cols = 1;
  rows = 1;
  maxPerCell = HASH_MAX_PER_CELL;
  counts: Uint32Array = new Uint32Array(1);
  buckets: Uint32Array = new Uint32Array(HASH_MAX_PER_CELL);

  configure(worldW: number, worldH: number, cellSize: number): void {
    const cs = Math.max(cellSize, 1e-4);
    const cols = Math.max(1, Math.ceil(worldW / cs));
    const rows = Math.max(1, Math.ceil(worldH / cs));
    if (cols === this.cols && rows === this.rows && Math.abs(cs - this.cellSize) < 1e-8) return;
    this.cellSize = cs;
    this.cols = cols;
    this.rows = rows;
    const cells = cols * rows;
    this.counts = new Uint32Array(cells);
    this.buckets = new Uint32Array(cells * this.maxPerCell);
  }

  clear(): void {
    this.counts.fill(0);
  }

  cellIndex(x: number, y: number): number {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellSize)));
    return cy * this.cols + cx;
  }

  insert(i: number, x: number, y: number): void {
    const c = this.cellIndex(x, y);
    const slot = this.counts[c]!;
    if (slot < this.maxPerCell) {
      this.buckets[c * this.maxPerCell + slot] = i;
      this.counts[c] = slot + 1;
    }
  }

  query(x: number, y: number, fn: (j: number) => void): void {
    const cx = Math.min(this.cols - 1, Math.max(0, Math.floor(x / this.cellSize)));
    const cy = Math.min(this.rows - 1, Math.max(0, Math.floor(y / this.cellSize)));
    const x0 = Math.max(0, cx - 1);
    const x1 = Math.min(this.cols - 1, cx + 1);
    const y0 = Math.max(0, cy - 1);
    const y1 = Math.min(this.rows - 1, cy + 1);
    const counts = this.counts;
    const buckets = this.buckets;
    const mpc = this.maxPerCell;
    const cols = this.cols;
    for (let gy = y0; gy <= y1; gy++) {
      for (let gx = x0; gx <= x1; gx++) {
        const c = gy * cols + gx;
        const n = counts[c]!;
        const base = c * mpc;
        for (let s = 0; s < n; s++) fn(buckets[base + s]!);
      }
    }
  }
}
