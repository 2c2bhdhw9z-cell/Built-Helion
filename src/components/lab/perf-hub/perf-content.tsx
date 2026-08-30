import { useMemo } from "react";
import {
  Copy,
  Download,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn, clamp, formatBytes, formatInt, formatMs } from "@/lib/utils";
import { useLab, type EngineSystemInfo } from "@/store/lab-store";
import {
  readDeviceInfo,
  readGpuInfo,
  readPerformanceMemory,
} from "@/lib/perf/env-info";
import { particleThroughput, THROUGHPUT_LABEL } from "@/lib/perf/throughput";
import { DROPPED_FRAME_MS } from "@/lib/perf/stats";
import {
  toCsvExport,
  toJsonExport,
  downloadBlob,
  type PerfSystemInfo,
} from "@/lib/perf/export";
import type { PerfSnapshot } from "./use-perf-samples";
import {
  FpsChart,
  FrameBreakdownChart,
  FrameHistogram,
  RamChart,
} from "./charts";
import {
  countTone,
  fpsTone,
  frameMsTone,
  InfoRow,
  Stat,
  type Tone,
} from "./stat";

function Section({
  title,
  children,
  right,
}: {
  title: string;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <section className="rounded-md border border-border bg-elevated/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-2xs font-medium uppercase tracking-[0.16em] text-muted">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

/** A simple token-styled utilization/fraction bar. */
function UtilBar({ fraction, tone }: { fraction: number; tone: Tone }) {
  const pct = clamp(fraction * 100, 0, 100);
  const bg =
    tone === "danger"
      ? "bg-danger"
      : tone === "warn"
        ? "bg-warn"
        : tone === "ok"
          ? "bg-ok"
          : "bg-accent";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-bg">
      <div className={cn("h-full rounded-full transition-[width]", bg)} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Read the live engine system info lazily (only invoked while the hub is open). */
function useSystemInfo(): {
  engine: EngineSystemInfo | null;
  system: PerfSystemInfo;
} {
  const getEngineSystemInfo = useLab((s) => s.getEngineSystemInfo);
  const telemetry = useLab((s) => s.telemetry);
  return useMemo(() => {
    const engine = getEngineSystemInfo ? getEngineSystemInfo() : null;
    const gpu = readGpuInfo(engine?.gl ?? null);
    const device = readDeviceInfo();
    const memory = readPerformanceMemory();
    const system: PerfSystemInfo = {
      backend: engine?.backend ?? telemetry.backend,
      compute: engine?.compute ?? telemetry.compute,
      devicePixelRatio: engine?.dpr ?? device.devicePixelRatio,
      canvasWidth: engine?.backingW,
      canvasHeight: engine?.backingH,
      gpu,
      device,
      memory,
    };
    return { engine, system };
    // Re-evaluated when the hub re-renders (throttled), which is fine: these are
    // cheap reads and the gl context lookup only runs once per render tick.
  }, [getEngineSystemInfo, telemetry.backend, telemetry.compute]);
}

export function PerfContent({
  snapshot,
  paused,
  onTogglePause,
  onReset,
  onClose,
  resetAt,
}: {
  snapshot: PerfSnapshot;
  paused: boolean;
  onTogglePause: () => void;
  onReset: () => void;
  onClose: () => void;
  resetAt: number;
}) {
  const telemetry = useLab((s) => s.telemetry);
  const compact = useLab((s) => s.perfCompact);
  const setCompact = useLab((s) => s.setPerfCompact);
  const spawnKind = useLab((s) => s.spawnKind);

  const { system } = useSystemInfo();
  const { samples, summary } = snapshot;

  const throughput = particleThroughput(telemetry.live, telemetry.fps);
  const utilization = telemetry.cap > 0 ? telemetry.live / telemetry.cap : 0;
  const secondsSinceReset = Math.max(0, (Date.now() - resetAt) / 1000);

  const buildPayload = () => ({
    generatedAt: new Date().toISOString(),
    window: samples.length,
    summary,
    system,
    samples,
  });

  const onExportJson = () => {
    downloadBlob(
      `helion-perf-${Date.now()}.json`,
      "application/json",
      toJsonExport(buildPayload()),
    );
    toast.success("Exported perf log (JSON)");
  };

  const onExportCsv = () => {
    downloadBlob(`helion-perf-${Date.now()}.csv`, "text/csv", toCsvExport(samples));
    toast.success("Exported perf log (CSV)");
  };

  const onCopySummary = async () => {
    const text = summaryText(summary, telemetry, system, throughput);
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        toast.success("Summary copied to clipboard");
      } else {
        toast.error("Clipboard unavailable");
      }
    } catch {
      toast.error("Could not copy summary");
    }
  };

  const dpr = system.devicePixelRatio;
  const cssRes =
    system.canvasWidth && system.canvasHeight && dpr
      ? `${Math.round(system.canvasWidth / dpr)}×${Math.round(system.canvasHeight / dpr)}`
      : "n/a";
  const backingRes =
    system.canvasWidth && system.canvasHeight
      ? `${system.canvasWidth}×${system.canvasHeight}`
      : "n/a";

  const memAvail = system.memory.available;
  const drawnLabel = system.backend === "canvas" ? "particles drawn" : "points";
  const drawCallLabel = system.backend === "canvas" ? "fillRect ops" : "draw calls";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Controls row */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border px-3 py-2">
        <Button
          variant={paused ? "default" : "outline"}
          size="sm"
          className="h-8 px-2"
          onClick={onTogglePause}
          aria-label={paused ? "Resume graphs" : "Pause graphs"}
          title={paused ? "Resume graphs" : "Pause graphs"}
        >
          {paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          <span className="hidden sm:inline">{paused ? "Resume" : "Pause"}</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2"
          onClick={onReset}
          aria-label="Reset stats"
          title="Reset stats"
        >
          <RotateCcw className="size-3.5" />
          <span className="hidden sm:inline">Reset</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2"
          onClick={() => setCompact(!compact)}
          aria-label={compact ? "Expanded view" : "Compact view"}
          title={compact ? "Expanded view" : "Compact view"}
        >
          {compact ? <Maximize2 className="size-3.5" /> : <Minimize2 className="size-3.5" />}
          <span className="hidden sm:inline">{compact ? "Expand" : "Compact"}</span>
        </Button>
        <div className="flex-1" />
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2"
          onClick={onCopySummary}
          aria-label="Copy summary"
          title="Copy summary"
        >
          <Copy className="size-3.5" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2"
          onClick={onExportJson}
          aria-label="Export JSON"
          title="Export perf log (JSON)"
        >
          <Download className="size-3.5" />
          <span className="hidden sm:inline">JSON</span>
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 px-2"
          onClick={onExportCsv}
          aria-label="Export CSV"
          title="Export perf log (CSV)"
        >
          <Download className="size-3.5" />
          <span className="hidden sm:inline">CSV</span>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onClose}
          aria-label="Close performance hub"
          title="Close"
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="lab-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
        {/* FRAME */}
        <Section title="Frame timing" right={paused ? <span className="text-2xs text-warn">paused</span> : undefined}>
          <div className="grid grid-cols-4 gap-2">
            <Stat label="FPS" value={summary.fpsCur.toFixed(0)} tone={fpsTone(summary.fpsCur)} />
            <Stat label="avg" value={summary.fpsAvg.toFixed(0)} tone={fpsTone(summary.fpsAvg)} />
            <Stat label="min" value={summary.fpsMin.toFixed(0)} tone={fpsTone(summary.fpsMin)} />
            <Stat label="max" value={summary.fpsMax.toFixed(0)} tone="muted" />
            <Stat label="ms" value={formatMs(summary.frameMsCur)} tone={frameMsTone(summary.frameMsCur)} />
            <Stat label="ms avg" value={formatMs(summary.frameMsAvg)} tone={frameMsTone(summary.frameMsAvg)} />
            <Stat label="ms min" value={formatMs(summary.frameMsMin)} tone="muted" />
            <Stat label="ms max" value={formatMs(summary.frameMsMax)} tone={frameMsTone(summary.frameMsMax)} />
            <Stat label="1% low" value={summary.onePctLow.toFixed(0)} tone={fpsTone(summary.onePctLow)} sub="fps" />
            <Stat label="0.1% low" value={summary.pointOnePctLow.toFixed(0)} tone={fpsTone(summary.pointOnePctLow)} sub="fps" />
            <Stat label="p50" value={formatMs(summary.p50)} tone="muted" />
            <Stat label="p95" value={formatMs(summary.p95)} tone={frameMsTone(summary.p95)} />
            <Stat label="p99" value={formatMs(summary.p99)} tone={frameMsTone(summary.p99)} />
            <Stat
              label="dropped"
              value={formatInt(summary.droppedFrames)}
              tone={countTone(summary.droppedFrames, false)}
              sub={`>${DROPPED_FRAME_MS.toFixed(0)}ms`}
            />
            <Stat label="longest" value={formatMs(summary.longestFrameMs)} tone={frameMsTone(summary.longestFrameMs)} />
            <Stat label="samples" value={formatInt(samples.length)} tone="muted" />
          </div>
          <div className="mt-3">
            <div className="mb-1 text-2xs uppercase tracking-[0.12em] text-faint">FPS over time</div>
            <FpsChart samples={samples} />
          </div>
          {!compact && (
            <>
              <div className="mt-3">
                <div className="mb-1 flex items-center gap-3 text-2xs uppercase tracking-[0.12em] text-faint">
                  <span>Frame breakdown (ms)</span>
                  <span className="text-accent">compute</span>
                  <span className="text-warn">render</span>
                  <span className="text-faint">other</span>
                </div>
                <FrameBreakdownChart samples={samples} />
              </div>
              <div className="mt-3">
                <div className="mb-1 text-2xs uppercase tracking-[0.12em] text-faint">
                  Frame-time histogram (ms buckets)
                </div>
                <FrameHistogram samples={samples} />
              </div>
            </>
          )}
        </Section>

        {/* PARTICLES */}
        <Section title="Particles">
          <div className="grid grid-cols-4 gap-2">
            <Stat label="live" value={formatInt(telemetry.live)} tone="accent" />
            <Stat label="sleeping" value={formatInt(telemetry.sleeping)} tone="muted" />
            <Stat label="cap" value={formatInt(telemetry.cap)} tone="muted" />
            <Stat label="limit" value={formatInt(telemetry.limit)} tone="muted" />
          </div>
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-2xs uppercase tracking-[0.12em] text-faint">
              <span>Utilization (live / cap)</span>
              <span className="font-mono tabular-nums">{(utilization * 100).toFixed(1)}%</span>
            </div>
            <UtilBar fraction={utilization} tone={utilization > 0.9 ? "warn" : "accent"} />
          </div>
          <div className="mt-3">
            <Stat label="Throughput" value={formatInt(throughput)} tone="accent" sub={THROUGHPUT_LABEL} />
          </div>
        </Section>

        {/* HEALTH */}
        <Section title="Health">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="NaN count" value={formatInt(telemetry.nanCount)} tone={countTone(telemetry.nanCount)} />
            <Stat label="OOB count" value={formatInt(telemetry.oobCount)} tone={countTone(telemetry.oobCount)} />
          </div>
        </Section>

        {/* COST */}
        <Section title="Cost & GPU">
          <div className="grid grid-cols-2 gap-2">
            <Stat
              label="Active generator"
              value={telemetry.activeGenerator || spawnKind || "none"}
              tone="muted"
            />
            <Stat label={drawCallLabel} value={formatInt(telemetry.drawCalls)} tone="muted" />
            <Stat label={drawnLabel} value={formatInt(telemetry.drawnPoints)} tone="muted" />
            <Stat label="Compute path" value={telemetry.compute} tone="muted" />
          </div>
          <div className="mt-3">
            <div className="mb-1 text-2xs uppercase tracking-[0.12em] text-faint">
              Subsystem CPU cost {telemetry.compute === "cpu" ? "(aggregate for active modes)" : "(GPU compute — n/a)"}
            </div>
            {telemetry.subsystems.length > 0 ? (
              <div className="flex flex-col divide-y divide-border/60">
                {telemetry.subsystems.map((sub) => (
                  <InfoRow key={sub.name} label={sub.name} value={formatMs(sub.ms)} />
                ))}
              </div>
            ) : (
              <div className="text-xs text-faint">
                {telemetry.compute === "cpu" ? "no active subsystems" : "n/a on GPU compute"}
              </div>
            )}
          </div>
        </Section>

        {/* MEMORY */}
        {!compact && (
          <Section title="Memory">
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Particle RAM" value={formatBytes(telemetry.ramBytes)} tone="muted" />
              {memAvail ? (
                <>
                  <Stat
                    label="JS heap used"
                    value={system.memory.usedJSHeapSize != null ? formatBytes(system.memory.usedJSHeapSize) : "n/a"}
                    tone="muted"
                  />
                  <Stat
                    label="JS heap total"
                    value={system.memory.totalJSHeapSize != null ? formatBytes(system.memory.totalJSHeapSize) : "n/a"}
                    tone="muted"
                  />
                  <Stat
                    label="JS heap limit"
                    value={system.memory.jsHeapSizeLimit != null ? formatBytes(system.memory.jsHeapSizeLimit) : "n/a"}
                    tone="muted"
                  />
                </>
              ) : (
                <Stat label="JS heap" value="unavailable" tone="muted" sub="Chromium only" />
              )}
            </div>
            <div className="mt-3">
              <div className="mb-1 text-2xs uppercase tracking-[0.12em] text-faint">Particle RAM trend</div>
              <RamChart samples={samples} />
            </div>
          </Section>
        )}

        {/* SYSTEM / BACKEND */}
        {!compact && (
          <Section title="System & backend">
            <div className="flex flex-col divide-y divide-border/60">
              <InfoRow label="Backend" value={system.backend} />
              <InfoRow label="Compute" value={system.compute} />
              <InfoRow label="Device pixel ratio" value={dpr != null ? String(dpr) : "n/a"} />
              <InfoRow label="Canvas CSS size" value={cssRes} />
              <InfoRow label="Backing resolution" value={backingRes} />
              <InfoRow
                label="GPU vendor"
                value={system.gpu.available && system.gpu.vendor ? system.gpu.vendor : "masked / unavailable"}
                tone={system.gpu.available ? undefined : "muted"}
              />
              <InfoRow
                label="GPU renderer"
                value={system.gpu.available && system.gpu.renderer ? system.gpu.renderer : "masked / unavailable"}
                tone={system.gpu.available ? undefined : "muted"}
              />
              <InfoRow
                label="Cores"
                value={
                  system.device.hardwareConcurrency != null
                    ? String(system.device.hardwareConcurrency)
                    : "n/a"
                }
              />
              <InfoRow label="Platform" value={system.device.platform ?? "n/a"} />
              <InfoRow label="Language" value={system.device.language ?? "n/a"} />
              <InfoRow label="Time since reset" value={`${secondsSinceReset.toFixed(0)}s`} />
            </div>
            {system.device.userAgent ? (
              <p className="mt-2 break-words text-2xs text-faint" title={system.device.userAgent}>
                {system.device.userAgent}
              </p>
            ) : null}
          </Section>
        )}
      </div>
    </div>
  );
}

function summaryText(
  summary: PerfSnapshot["summary"],
  telemetry: ReturnType<typeof useLab.getState>["telemetry"],
  system: PerfSystemInfo,
  throughput: number,
): string {
  const lines = [
    "Helion Performance Summary",
    `Backend: ${system.backend} | Compute: ${system.compute}`,
    `FPS cur/avg/min/max: ${summary.fpsCur.toFixed(0)}/${summary.fpsAvg.toFixed(0)}/${summary.fpsMin.toFixed(0)}/${summary.fpsMax.toFixed(0)}`,
    `Frame ms cur/avg/min/max: ${summary.frameMsCur.toFixed(2)}/${summary.frameMsAvg.toFixed(2)}/${summary.frameMsMin.toFixed(2)}/${summary.frameMsMax.toFixed(2)}`,
    `1% low / 0.1% low (fps): ${summary.onePctLow.toFixed(0)} / ${summary.pointOnePctLow.toFixed(0)}`,
    `p50/p95/p99 (ms): ${summary.p50.toFixed(2)}/${summary.p95.toFixed(2)}/${summary.p99.toFixed(2)}`,
    `Dropped frames: ${summary.droppedFrames} | Longest: ${summary.longestFrameMs.toFixed(2)}ms`,
    `Particles live/sleeping/cap: ${telemetry.live}/${telemetry.sleeping}/${telemetry.cap}`,
    `Throughput: ${Math.round(throughput)} (${THROUGHPUT_LABEL})`,
    `Draw calls / points: ${telemetry.drawCalls} / ${telemetry.drawnPoints}`,
    `NaN / OOB: ${telemetry.nanCount} / ${telemetry.oobCount}`,
    `GPU: ${system.gpu.available ? `${system.gpu.vendor ?? "?"} — ${system.gpu.renderer ?? "?"}` : "masked / unavailable"}`,
  ];
  return lines.join("\n");
}
