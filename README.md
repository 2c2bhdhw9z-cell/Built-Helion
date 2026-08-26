# Helion

GPU-backed particle lab in the browser. WebGL2 point sprites, CPU SoA physics, spatial hash, and a two-arm rainbow galaxy that holds its shape while it rotates.

## Run

```bash
npm install
npm run dev
```

Open the printed local URL. Default generator is **Galaxy**.

## Controls

- **Count / Add / Clear** — inject or wipe particles
- **Size** — particle diameter in pixels
- **Galaxy, Ring, Burst, Pour, Fall, Flock, Cloth, N-body** — generators
- **Attract / Repel / Vortex / Paint / Freeze** — pointer tools
- Visuals tab — palettes including **rainbow**

Built with Vite, React, and WebGL2 (Canvas2D fallback).
