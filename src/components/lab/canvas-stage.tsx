import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ParticleEngine } from "@/engine/engine";
import { useLab } from "@/store/lab-store";
import { compositeCanvases, captureScreenshotBlob } from "@/lib/capture/screenshot";
import { compositeTargetSize, exportMaxDim, exportTargetSize } from "@/lib/capture/composite";
import { captureFilename } from "@/lib/capture/filename";
import { CanvasRecorder } from "@/lib/capture/recorder";
import { downloadBlobObject } from "@/lib/perf/export";
import { GifRecorder } from "@/lib/capture/gif";
import { knockoutVoid } from "@/lib/capture/alpha";
import { drawWatermark } from "@/lib/capture/watermark";
import { Backdrop } from "./backdrop";
import { SCENES } from "@/engine/scenes";
import { SessionCursors } from "./session-cursors";
import { fillWorldScale, viewCssPanEnabled, viewCssScale } from "@/engine/camera";
import { IDLE_EXTRA_BRUSH } from "@/engine/types";
import { pickLiveExtraBrush } from "@/lib/multiplayer/protocol";
import { useSession } from "@/lib/multiplayer/session-store";


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
      const worldH = Math.max(engineRef.current?.worldH ?? 1, 1e-6);
      if (walls && walls.length > 0) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
        ctx.lineWidth = 4;
        ctx.lineCap = "round";
        ctx.beginPath();
        const scale = h / worldH;
        for (const w of walls) {
          ctx.moveTo(w.x1 * scale, w.y1 * scale);
          ctx.lineTo(w.x2 * scale, w.y2 * scale);
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

function stampComposite(
  rctx: CanvasRenderingContext2D,
  rc: HTMLCanvasElement,
  engineCanvas: HTMLCanvasElement,
  wallsCanvas: HTMLCanvasElement | null,
  entitled: boolean,
) {
  rctx.drawImage(engineCanvas, 0, 0, rc.width, rc.height);
  if (wallsCanvas && wallsCanvas.width > 0 && wallsCanvas.height > 0) {
    rctx.drawImage(wallsCanvas, 0, 0, rc.width, rc.height);
  }
  if (!entitled) drawWatermark(rctx, rc.width, rc.height);
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
  const gifRecorderRef = useRef<GifRecorder | null>(null);
  const gifRunningRef = useRef(false);
  // Guards against re-entrant stopRecording() (e.g. the user tapping Stop twice)
  // while the async recorder flush is still in flight.
  const stoppingRef = useRef(false);
  const isPointerDownRef = useRef(false);
  const activePointerIdRef = useRef<number | null>(null);
  const panRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const [viewportH, setViewportH] = useState(400);

  const brush = useLab((s) => s.brushRadius);
  const pointer = useLab((s) => s.pointer);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new ParticleEngine(canvas);
    engineRef.current = engine;
    {
      const st = useLab.getState();
      engine.setWorldScale(fillWorldScale(st.fillFrame, st.viewZoom));
    }
    // Expose live system/GL info to the perf hub WITHOUT any per-frame cost:
    // the hub calls this getter only while open, reading the engine's current
    // backend/compute/DPR/canvas resolution + raw gl context on demand.
    useLab.getState().setEngineSystemInfo(() => engine.getSystemInfo());
    // Expose a screenshot action to the store so the HUD (any user, no login)
    // can trigger a capture. Reads the engine + walls canvases at call time,
    // composites them, and downloads a PNG. See captureScreenshot() below.
    useLab.getState().setCaptureScreenshot((kind) => {
      void captureScreenshot(kind);
    });
    // Expose record start/stop to the store (any user, no login). Both no-op
    // safely until an engine frame exists; the HUD only shows these when the
    // store's `canRecord` flag is true. See startRecording/stopRecording below.
    useLab.getState().setStartRecording(() => startRecording());
    useLab.getState().setStopRecording(() => {
      void stopRecording();
    });
    useLab.getState().setStartGif(() => startGif());
    useLab.getState().setStopGif(() => {
      void stopGif();
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
      const worldScale = engine.worldScale || 1;
      const session = useSession.getState();
      const viewOnly = session.role === "view";
      const extraBrush = session.code
        ? pickLiveExtraBrush(Object.values(session.cursors), s.brushStrength, s.brushRadius * worldScale)
        : IDLE_EXTRA_BRUSH;
      engine.sync({
        params: s.params,
        pointer: viewOnly ? { ...s.pointer, down: false } : s.pointer,
        tool: s.tool,
        brushRadius: s.brushRadius * worldScale,
        brushStrength: s.brushStrength,
        paused: s.paused,
        speed: s.speed,
        cap: s.cap,
        tiltX: s.tiltX * s.params.tiltScale,
        tiltY: s.tiltY * s.params.tiltScale,
        pouring: s.pouring,
        falling: s.falling,
        firing: s.firing,
        smoking: s.smoking,
        quality: s.quality,
        extraBrush,
      });
      engine.stepFrame(dt, s.paused, s.speed, s.tiltX * s.params.tiltScale, s.tiltY * s.params.tiltScale);
      // While recording, keep the live compositing canvas in sync with the
      // freshly-rendered frame: engine first, walls overlay on top. This is the
      // canvas MediaRecorder is capturing (via captureStream), so the video
      // includes the walls the user drew — matching the screenshot fidelity.
      // Only runs during an active recording, so the hot loop is untouched
      // otherwise. Wrapped so a compositing hiccup never throws into the loop.
      if (recordingRef.current || gifRunningRef.current) {
        const rc = recordCanvasRef.current;
        const rctx = rc?.getContext("2d");
        if (rc && rctx) {
          try {
            stampComposite(rctx, rc, engine.canvas, wallsCanvasRef.current, s.entitled);
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

    const stageSize = () => {
      const wrap = wrapRef.current;
      return {
        w: wrap?.clientWidth ?? 0,
        h: wrap?.clientHeight ?? 0,
      };
    };

    const trySpawn = () => {
      if (dead || spawned || !engine.ready) return;
      const { w, h } = stageSize();
      engine.resize(w, h);
      if (engine.cssH < 80 || engine.cssW < 80) return;
      spawned = true;
      const { spawnCount, spawnKind } = useLab.getState();
      engine.spawn(spawnKind || "galaxy", true, undefined, spawnCount);
      useLab.getState().setTelemetry({ ...engine.telemetry });
    };

    const ro = new ResizeObserver(() => {
      const { w, h } = stageSize();
      engine.resize(w, h);
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
        const { w, h } = stageSize();
        engine.resize(w, h);
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
      gifRecorderRef.current?.dispose();
      gifRecorderRef.current = null;
      gifRunningRef.current = false;
      engine.dispose();
      engineRef.current = null;
      useLab.getState().setEngineSystemInfo(null);
      useLab.getState().setCaptureScreenshot(null);
      useLab.getState().setStartRecording(null);
      useLab.getState().setStopRecording(null);
      useLab.getState().setStartGif(null);
      useLab.getState().setStopGif(null);
      useLab.getState().setRecording(false);
      useLab.getState().setGifRecording(false);
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
  const captureScreenshot = async (kind: "png" | "jpg" = "png") => {
    const engine = engineRef.current;
    if (!engine) return;
    await engine.requestScreenshot();
    const s = useLab.getState();
    const size = exportTargetSize(
      {
        width: engine.canvas.width,
        height: engine.canvas.height,
      },
      s.entitled,
      s.exportSize,
      s.plan,
    );
    const composite = compositeCanvases(engine.canvas, wallsCanvasRef.current, size);
    if (!composite) {
      toast.error("Could not build that still — try a smaller size");
      return;
    }
    if (kind === "png" && s.exportAlpha) knockoutVoid(composite);
    if (!s.entitled) {
      const ctx = composite.getContext("2d");
      if (ctx) drawWatermark(ctx, composite.width, composite.height);
    }
    const blob = await captureScreenshotBlob(
      composite,
      kind === "jpg" ? "image/jpeg" : "image/png",
    );
    if (!blob) return;
    downloadBlobObject(captureFilename(kind), blob);
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
    // Build/refresh the offscreen compositing canvas at the chosen export cap
    // (1080 / 4K / 8K) so recordings honor the HUD size + fps.
    const s = useLab.getState();
    const size = compositeTargetSize(
      {
        width: engine.canvas.width,
        height: engine.canvas.height,
      },
      exportMaxDim(s.entitled, s.exportSize, s.plan),
    );
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
        stampComposite(rctx, rc, engine.canvas, wallsCanvasRef.current, s.entitled);
      } catch {
        /* ignore priming errors */
      }
    }
    const recorder = new CanvasRecorder(() => recordCanvasRef.current, s.recordFps);
    try {
      recorder.start();
    } catch (err) {
      // Should be rare since canRecord() gated us; degrade cleanly.
      console.error("Failed to start recording:", err);
      toast.error("Could not start that recording — try 1080 or 4K");
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

  const ensureCompositeCanvas = () => {
    const engine = engineRef.current;
    if (!engine || typeof document === "undefined") return null;
    const s = useLab.getState();
    const size = compositeTargetSize(
      {
        width: engine.canvas.width,
        height: engine.canvas.height,
      },
      exportMaxDim(s.entitled, s.exportSize, s.plan),
    );
    let rc = recordCanvasRef.current;
    if (!rc) {
      rc = document.createElement("canvas");
      recordCanvasRef.current = rc;
    }
    rc.width = Math.max(1, size.width);
    rc.height = Math.max(1, size.height);
    const rctx = rc.getContext("2d");
    if (rctx) {
      try {
        stampComposite(rctx, rc, engine.canvas, wallsCanvasRef.current, s.entitled);
      } catch {
        /* ignore priming errors */
      }
    }
    return rc;
  };

  const startGif = () => {
    if (gifRunningRef.current || recordingRef.current) return;
    if (!ensureCompositeCanvas()) return;
    const recorder = new GifRecorder(() => recordCanvasRef.current);
    recorder.start();
    gifRecorderRef.current = recorder;
    gifRunningRef.current = true;
    useLab.getState().setGifRecording(true);
  };

  const stopGif = async () => {
    const recorder = gifRecorderRef.current;
    if (!recorder || !gifRunningRef.current) return;
    useLab.getState().setGifRecording(false);
    let blob: Blob | null = null;
    try {
      blob = await recorder.stop();
    } catch (err) {
      console.error("Failed to encode GIF:", err);
    } finally {
      gifRunningRef.current = false;
      gifRecorderRef.current = null;
    }
    if (!blob) return;
    downloadBlobObject(captureFilename("gif"), blob);
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
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement | null)?.isContentEditable) return;
      const s = useLab.getState();
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }
      if (meta && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        s.setPaused(!s.paused);
      } else if (e.key === "1") s.setSpeed(0.25);
      else if (e.key === "2") s.setSpeed(0.5);
      else if (e.key === "3") s.setSpeed(1);
      else if (e.key === "4") s.setSpeed(2);
      else if (e.key === "5") s.setSpeed(4);
      else if (e.key === "0") s.resetView();
      else if (e.key === "+" || e.key === "=") s.setView({ zoom: s.viewZoom * 1.12 });
      else if (e.key === "-" || e.key === "_") s.setView({ zoom: s.viewZoom / 1.12 });
      else if (e.key === "f" || e.key === "F") {
        if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.();
        else void document.exitFullscreen?.();
      } else if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        s.setHelpOpen(!s.helpOpen);
      } else if (e.key === "[" ) s.setQuality(s.quality === "high" ? "medium" : "low");
      else if (e.key === "]") s.setQuality(s.quality === "low" ? "medium" : "high");
      else if (!e.metaKey && !e.ctrlKey && e.key >= "6" && e.key <= "9") {
        const scene = SCENES[Number(e.key) - 6];
        if (scene) s.applyScene(scene.id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const setPointer = useLab((s) => s.setPointer);
  const params = useLab((s) => s.params);
  const viewZoom = useLab((s) => s.viewZoom);
  const viewPanX = useLab((s) => s.viewPanX);
  const viewPanY = useLab((s) => s.viewPanY);
  const viewRotate = useLab((s) => s.viewRotate);
  const fillFrame = useLab((s) => s.fillFrame);
  const bgObjectUrl = useLab((s) => s.bgObjectUrl);
  const worldScale = fillWorldScale(fillFrame, viewZoom);
  const cssScale = viewCssScale(fillFrame, viewZoom);
  const cssPan = viewCssPanEnabled(fillFrame, viewZoom);

  useEffect(() => {
    engineRef.current?.setWorldScale(fillWorldScale(fillFrame, viewZoom));
  }, [fillFrame, viewZoom]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = useLab.getState();
      const factor = e.deltaY > 0 ? 0.9 : 1.11;
      s.setView({ zoom: s.viewZoom * factor });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const toWorld = (e: React.PointerEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const h = Math.max(rect.height, 1);
    const scale = fillWorldScale(useLab.getState().fillFrame, useLab.getState().viewZoom);
    return {
      x: ((e.clientX - rect.left) / h) * scale,
      y: ((e.clientY - rect.top) / h) * scale,
    };
  };

  const isPanEvent = (e: React.PointerEvent) => e.button === 1 || e.button === 2 || e.altKey;

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0 overflow-hidden bg-bg"
      data-fill-frame={fillFrame ? "1" : "0"}
      data-css-scale={cssScale}
    >
      <div
        className="absolute inset-0 origin-center"
        style={{
          transform: `translate(${cssPan ? viewPanX : 0}px, ${cssPan ? viewPanY : 0}px) rotate(${viewRotate}deg) scale(${cssScale})`,
        }}
      >
        <canvas
          ref={canvasRef}
          id="particle-stage"
          data-testid="particle-stage"
          className="absolute inset-0 size-full touch-none"
          style={{
            filter: params.bloom
              ? `drop-shadow(0 0 ${params.bloomStrength * 5}px var(--glow-color, rgba(255,255,255,0.6))) brightness(1.2)`
              : "none",
          }}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            try {
              (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
            } catch {
              /* ignore */
            }
            if (pointersRef.current.size >= 2) {
              const pts = [...pointersRef.current.values()];
              const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
              pinchRef.current = { dist: Math.max(dist, 1), zoom: useLab.getState().viewZoom };
              isPointerDownRef.current = false;
              setPointer({ down: false, inside: true });
              return;
            }
            if (isPanEvent(e)) {
              if (!viewCssPanEnabled(useLab.getState().fillFrame, useLab.getState().viewZoom)) {
                return;
              }
              panRef.current = {
                x: e.clientX,
                y: e.clientY,
                panX: useLab.getState().viewPanX,
                panY: useLab.getState().viewPanY,
              };
              return;
            }
            isPointerDownRef.current = true;
            activePointerIdRef.current = e.pointerId;
            const w = toWorld(e);
            const s = useLab.getState();
            s.setHelpOpen(false);
            s.setPointer({ ...w, down: true, inside: true });
          }}
          onPointerMove={(e) => {
            if (pointersRef.current.has(e.pointerId)) {
              pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
            }
            if (pinchRef.current && pointersRef.current.size >= 2) {
              const pts = [...pointersRef.current.values()];
              const dist = Math.hypot(pts[0]!.x - pts[1]!.x, pts[0]!.y - pts[1]!.y);
              useLab.getState().setView({
                zoom: pinchRef.current.zoom * (dist / pinchRef.current.dist),
              });
              return;
            }
            if (panRef.current) {
              const dx = e.clientX - panRef.current.x;
              const dy = e.clientY - panRef.current.y;
              useLab.getState().setView({
                panX: panRef.current.panX + dx,
                panY: panRef.current.panY + dy,
              });
              return;
            }
            const w = toWorld(e);
            const isDown = isPointerDownRef.current || (e.buttons & 1) !== 0 || e.pointerType === "touch";
            setPointer({
              ...w,
              inside: true,
              down: isDown,
            });
          }}
          onPointerUp={(e) => {
            pointersRef.current.delete(e.pointerId);
            if (pointersRef.current.size < 2) pinchRef.current = null;
            panRef.current = null;
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
          onPointerCancel={(e) => {
            pointersRef.current.delete(e.pointerId);
            pinchRef.current = null;
            panRef.current = null;
            isPointerDownRef.current = false;
            activePointerIdRef.current = null;
            setPointer({ down: false, inside: false });
          }}
          onPointerLeave={() => {
            if (!isPointerDownRef.current && !panRef.current && !pinchRef.current) {
              setPointer({ down: false, inside: false });
            }
          }}
        />
        <WallsOverlay engineRef={engineRef} canvasRef={wallsCanvasRef} />
        <Backdrop kind={params.background} mediaUrl={bgObjectUrl} />
        <SessionCursors viewportH={viewportH} worldScale={worldScale} />
        {pointer.inside && (
          <div
            className="pointer-events-none absolute rounded-full border border-white/40 shadow-[0_0_8px_rgba(255,255,255,0.15)]"
            style={{
              width: brush * 2 * viewportH,
              height: brush * 2 * viewportH,
              left: (pointer.x / worldScale) * viewportH,
              top: (pointer.y / worldScale) * viewportH,
              transform: "translate(-50%, -50%)",
            }}
          />
        )}
      </div>
      <div className="lab-vignette pointer-events-none absolute inset-0" />
    </div>
  );
}
