import { useEffect, useRef, useState } from "react";
import { ParticleEngine } from "@/engine/engine";
import { useLab } from "@/store/lab-store";
import { compositeCanvases, captureScreenshotBlob } from "@/lib/capture/screenshot";
import { compositeTargetSize } from "@/lib/capture/composite";
import { captureFilename } from "@/lib/capture/filename";
import { CanvasRecorder } from "@/lib/capture/recorder";
import { downloadBlobObject } from "@/lib/perf/export";


function WallsOverlay({
  engineRef,
  canvasRef,
}: {
  engineRef: import("react").MutableRefObject<any>;
  canvasRef: import("react").RefObject<HTMLCanvasElement | null>;
}) {
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
  }, [engineRef, canvasRef]);

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
  }, [canvasRef]);
  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 size-full" />;
}

export function CanvasStage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ParticleEngine | null>(null);
  const wallsCanvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Video recording: the recorder captures a LIVE compositing canvas (engine +
  // walls blitted each rAF tick) so drawn walls appear in the video, matching
  // the screenshot fidelity. Both are refs so they survive re-renders and the
  // rAF loop / teardown can reach them without re-subscribing.
  const recorderRef = useRef<CanvasRecorder | null>(null);
  const recordCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recordingRef = useRef(false);
  // Guards against re-entrant stopRecording() (e.g. the user tapping Stop twice)
  // while the async recorder flush is still in flight.
  const stoppingRef = useRef(false);
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
    // Expose live system/GL info to the perf hub WITHOUT any per-frame cost:
    // the hub calls this getter only while open, reading the engine's current
    // backend/compute/DPR/canvas resolution + raw gl context on demand.
    useLab.getState().setEngineSystemInfo(() => engine.getSystemInfo());
    // Expose a screenshot action to the store so the HUD (any user, no login)
    // can trigger a capture. Reads the engine + walls canvases at call time,
    // composites them, and downloads a PNG. See captureScreenshot() below.
    useLab.getState().setCaptureScreenshot(() => {
      void captureScreenshot();
    });
    // Expose record start/stop to the store (any user, no login). Both no-op
    // safely until an engine frame exists; the HUD only shows these when the
    // store's `canRecord` flag is true. See startRecording/stopRecording below.
    useLab.getState().setStartRecording(() => startRecording());
    useLab.getState().setStopRecording(() => {
      void stopRecording();
    });
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
      // While recording, keep the live compositing canvas in sync with the
      // freshly-rendered frame: engine first, walls overlay on top. This is the
      // canvas MediaRecorder is capturing (via captureStream), so the video
      // includes the walls the user drew — matching the screenshot fidelity.
      // Only runs during an active recording, so the hot loop is untouched
      // otherwise. Wrapped so a compositing hiccup never throws into the loop.
      if (recordingRef.current) {
        const rc = recordCanvasRef.current;
        const rctx = rc?.getContext("2d");
        if (rc && rctx) {
          try {
            rctx.drawImage(engine.canvas, 0, 0, rc.width, rc.height);
            const wc = wallsCanvasRef.current;
            if (wc && wc.width > 0 && wc.height > 0) {
              rctx.drawImage(wc, 0, 0, rc.width, rc.height);
            }
          } catch {
            /* never throw into the render loop */
          }
        }
      }
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
      // Tear down any in-progress recording so navigating away never leaks a
      // MediaRecorder or an active capture stream (dispose stops both).
      recordingRef.current = false;
      stoppingRef.current = false;
      recorderRef.current?.dispose();
      recorderRef.current = null;
      recordCanvasRef.current = null;
      engine.dispose();
      engineRef.current = null;
      useLab.getState().setEngineSystemInfo(null);
      useLab.getState().setCaptureScreenshot(null);
      useLab.getState().setStartRecording(null);
      useLab.getState().setStopRecording(null);
      useLab.getState().setRecording(false);
    };
  }, []);

  /**
   * Capture the sim as it looks (engine canvas + walls overlay) and download it
   * as a PNG. Works across all three engine backends: the engine reads its own
   * canvas at the END of a freshly rendered frame (requestScreenshot handles the
   * WebGPU same-tick requirement and forces a render for a paused sim), and we
   * composite the walls overlay on top so drawn walls appear in the image. Never
   * gated on login — anyone can screenshot.
   */
  const captureScreenshot = async () => {
    const engine = engineRef.current;
    if (!engine) return;
    // Fresh, non-blank engine frame (correct for WebGPU/WebGL2/Canvas2D, and for
    // a paused sim — see engine.requestScreenshot). We don't use its blob
    // directly because it lacks the walls overlay; we composite the raw canvases
    // below. Awaiting it guarantees a fresh render has run this frame.
    await engine.requestScreenshot();
    const size = compositeTargetSize({
      width: engine.canvas.width,
      height: engine.canvas.height,
    });
    const composite = compositeCanvases(engine.canvas, wallsCanvasRef.current, size);
    if (!composite) return;
    const blob = await captureScreenshotBlob(composite);
    if (!blob) return;
    downloadBlobObject(captureFilename("png"), blob);
  };

  /**
   * Start recording the sim to a video. Sets up a LIVE compositing canvas sized
   * to the engine backing resolution and points a CanvasRecorder at it; the rAF
   * loop blits engine + walls into that canvas each frame while
   * `recordingRef.current` is true, so the recorded stream includes the walls
   * overlay (same fidelity as the screenshot). Feature-support is already gated
   * by the store's `canRecord` flag (the HUD hides/disables the button when
   * false), but we double-check here and swallow failures rather than throwing.
   * Never gated on login — anyone can record.
   */
  const startRecording = () => {
    const engine = engineRef.current;
    if (!engine || recordingRef.current) return;
    if (!CanvasRecorder.canRecord() || typeof document === "undefined") return;
    // Build/refresh the offscreen compositing canvas at the engine's current
    // backing resolution so the video matches on-screen pixels.
    const size = compositeTargetSize({
      width: engine.canvas.width,
      height: engine.canvas.height,
    });
    let rc = recordCanvasRef.current;
    if (!rc) {
      rc = document.createElement("canvas");
      recordCanvasRef.current = rc;
    }
    rc.width = Math.max(1, size.width);
    rc.height = Math.max(1, size.height);
    // Prime the first frame so captureStream starts with real content, not blank.
    const rctx = rc.getContext("2d");
    if (rctx) {
      try {
        rctx.drawImage(engine.canvas, 0, 0, rc.width, rc.height);
        const wc = wallsCanvasRef.current;
        if (wc && wc.width > 0 && wc.height > 0) {
          rctx.drawImage(wc, 0, 0, rc.width, rc.height);
        }
      } catch {
        /* ignore priming errors */
      }
    }
    const recorder = new CanvasRecorder(() => recordCanvasRef.current);
    try {
      recorder.start();
    } catch (err) {
      // Should be rare since canRecord() gated us; degrade cleanly.
      console.error("Failed to start recording:", err);
      return;
    }
    recorderRef.current = recorder;
    recordingRef.current = true;
    useLab.getState().setRecording(true);
  };

  /**
   * Stop the in-progress recording, download the assembled video blob, and
   * release the stream. Uses captureFilename('webm') for webm mimes (the picked
   * mime is webm-first); if a non-webm mime was picked (e.g. mp4 on Safari) we
   * pick the matching extension so the file is named correctly.
   */
  const stopRecording = async () => {
    const recorder = recorderRef.current;
    if (!recorder || !recordingRef.current || stoppingRef.current) return;
    // Re-entrancy guard: a second Stop tap while the flush is in flight is a
    // no-op. We flip the store `recording` flag to false immediately so the HUD
    // indicator stops right away, but we deliberately KEEP recordingRef.current
    // true so the rAF loop keeps blitting the live composite until the recorder
    // has actually flushed its final timeslice — otherwise the tail of the
    // video would freeze on the last blitted frame. recordingRef is only
    // cleared in the finally below, after recorder.stop() resolves.
    stoppingRef.current = true;
    useLab.getState().setRecording(false);
    const mime = recorder.currentMimeType;
    let blob: Blob | null = null;
    try {
      blob = await recorder.stop();
    } catch (err) {
      console.error("Failed to stop recording:", err);
    } finally {
      recordingRef.current = false;
      recorderRef.current = null;
      stoppingRef.current = false;
    }
    if (!blob) return;
    // webm for webm mimes (the common path); mp4 only if that was the picked
    // codec. captureFilename only knows 'webm' extension, so build the mp4 name
    // inline to keep the pure helper's kind union tight.
    const filename =
      mime && mime.startsWith("video/mp4")
        ? captureFilename("webm").replace(/\.webm$/, ".mp4")
        : captureFilename("webm");
    downloadBlobObject(filename, blob);
  };

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
      <WallsOverlay engineRef={engineRef} canvasRef={wallsCanvasRef} />
      {pointer.inside && (
        <div
          className="pointer-events-none absolute rounded-full border border-white/40 shadow-[0_0_8px_rgba(255,255,255,0.15)]"
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
