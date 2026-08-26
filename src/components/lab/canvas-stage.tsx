import { useEffect, useRef, useState } from "react";
import { ParticleEngine } from "@/engine/engine";
import { useLab } from "@/store/lab-store";


function WallsOverlay({ engineRef }: { engineRef: import("react").MutableRefObject<any> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let raf: number;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    function draw() {
      if (!ctx || !canvasRef.current) return;
      const h = canvasRef.current.height;
      ctx.clearRect(0, 0, canvasRef.current.width, h);
      const walls = engineRef.current?.walls;
      if (walls && walls.length > 0) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        for (const w of walls) {
          ctx.moveTo(w.x1 * h, w.y1 * h);
          ctx.lineTo(w.x2 * h, w.y2 * h);
        }
        ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    }
    draw();
    return () => cancelAnimationFrame(raf);
  }, [engineRef]);

  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current && canvasRef.current.parentElement) {
        canvasRef.current.width = canvasRef.current.parentElement.clientWidth;
        canvasRef.current.height = canvasRef.current.parentElement.clientHeight;
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" />;
}

export function CanvasStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ParticleEngine | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isPointerDownRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const [viewportH, setViewportH] = useState(400);

  const brush = useLab((s) => s.brushRadius);
  const pointer = useLab((s) => s.pointer);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new ParticleEngine(canvas);
    engineRef.current = engine;
    let raf = 0;
    let last = performance.now();
    let hudAt = 0;
    let dead = false;
    let spawned = false;

    const loop = (now: number) => {
      if (dead) return;
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const s = useLab.getState();
      engine.sync({
        params: s.params,
        pointer: s.pointer,
        tool: s.tool,
        brushRadius: s.brushRadius,
        brushStrength: s.brushStrength,
        paused: s.paused,
        speed: s.speed,
        cap: s.cap,
        tiltX: s.tiltX * s.params.tiltScale,
        tiltY: s.tiltY * s.params.tiltScale,
        pouring: s.pouring,
        falling: s.falling,
      });
      engine.stepFrame(dt, s.paused, s.speed, s.tiltX * s.params.tiltScale, s.tiltY * s.params.tiltScale);
      if (now - hudAt > 120) {
        hudAt = now;
        s.setTelemetry({ ...engine.telemetry });
      }
    };

    const trySpawn = () => {
      if (dead || spawned || !engine.ready) return;
      engine.resize();
      if (engine.cssH < 80 || engine.cssW < 80) return;
      spawned = true;
      const { spawnCount, spawnKind } = useLab.getState();
      engine.spawn(spawnKind || "galaxy", true, undefined, spawnCount);
      useLab.getState().setTelemetry({ ...engine.telemetry });
    };

    const ro = new ResizeObserver(() => {
      engine.resize();
      if (wrapRef.current) {
        setViewportH(wrapRef.current.clientHeight || 400);
      }
      if (!spawned && engine.ready) {
        trySpawn();
      }
    });
    if (wrapRef.current) ro.observe(wrapRef.current);

    void engine
      .start()
      .then(() => {
        if (dead) return;
        engine.resize();
        if (wrapRef.current) {
          setViewportH(wrapRef.current.clientHeight || 400);
        }
        trySpawn();
        last = performance.now();
        raf = requestAnimationFrame(loop);
      })
      .catch((err) => {
        console.error("Engine failed to start:", err);
      });

    return () => {
      dead = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const spawnId = useLab((s) => s.spawnId);
  const spawnKind = useLab((s) => s.spawnKind);
  const clearId = useLab((s) => s.clearId);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !spawnKind || spawnId === 0) return;
    const s = useLab.getState();
    engine.spawn(spawnKind, s.replaceMode, undefined, s.spawnCount);
  }, [spawnId, spawnKind]);

  useEffect(() => {
    if (clearId === 0) return;
    engineRef.current?.clear();
  }, [clearId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useLab.getState();
      if (e.code === "Space") {
        e.preventDefault();
        s.setPaused(!s.paused);
      } else if (e.key === "1") s.setSpeed(0.25);
      else if (e.key === "2") s.setSpeed(0.5);
      else if (e.key === "3") s.setSpeed(1);
      else if (e.key === "4") s.setSpeed(2);
      else if (e.key === "5") s.setSpeed(4);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setPointer = useLab((s) => s.setPointer);
  const params = useLab((s) => s.params);

  const toWorld = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const h = Math.max(rect.height, 1);
    return {
      x: (e.clientX - rect.left) / h,
      y: (e.clientY - rect.top) / h,
    };
  };

  return (
    <div ref={wrapRef} className="absolute inset-0 bg-bg">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 size-full touch-none"
        style={{ filter: params.bloom ? `drop-shadow(0 0 ${params.bloomStrength * 5}px var(--glow-color, rgba(255,255,255,0.6))) brightness(1.2)` : "none" }}
        onPointerDown={(e) => {
          isPointerDownRef.current = true;
          activePointerIdRef.current = e.pointerId;
          try {
            (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
          } catch {
            /* ignore capture errors */
          }
          const w = toWorld(e);
          setPointer({ ...w, down: true, inside: true });
        }}
        onPointerMove={(e) => {
          const w = toWorld(e);
          const isDown = isPointerDownRef.current || (e.buttons & 1) !== 0 || e.pointerType === "touch";
          setPointer({
            ...w,
            inside: true,
            down: isDown,
          });
        }}
        onPointerUp={(e) => {
          if (e.pointerId === activePointerIdRef.current || activePointerIdRef.current === null) {
            isPointerDownRef.current = false;
            activePointerIdRef.current = null;
          }
          try {
            (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
          } catch {
            /* ignore */
          }
          const isTouch = e.pointerType === "touch";
          setPointer({ down: false, inside: !isTouch });
        }}
        onPointerCancel={() => {
          isPointerDownRef.current = false;
          activePointerIdRef.current = null;
          setPointer({ down: false, inside: false });
        }}
        onPointerLeave={() => {
          if (!isPointerDownRef.current) {
            setPointer({ down: false, inside: false });
          }
        }}
      />
      <WallsOverlay engineRef={engineRef} />
      {pointer.inside && (
        <div
          className="pointer-events-none absolute rounded-full border-2 border-white/40 bg-white/5 backdrop-blur-[1px] shadow-[0_0_12px_rgba(255,255,255,0.2)]"
          style={{
            width: brush * 2 * viewportH,
            height: brush * 2 * viewportH,
            left: pointer.x * viewportH,
            top: pointer.y * viewportH,
            transform: "translate(-50%, -50%)",
          }}
        />
      )}
      <div className="lab-vignette pointer-events-none absolute inset-0" />
    </div>
  );
}
