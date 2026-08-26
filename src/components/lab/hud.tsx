import { MessageSquarePlus, Pause, Play, RotateCcw } from "lucide-react";
import { formatInt, formatMs } from "@/lib/utils";
import { useLab, type SpeedMul } from "@/store/lab-store";
import { Button } from "@/components/ui/button";
import { Chip } from "./controls";

const SPEEDS: SpeedMul[] = [0.25, 0.5, 1, 2, 4];

function Stat({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "danger" | "accent";
  className?: string;
}) {
  const color =
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : tone === "danger"
          ? "text-danger"
          : tone === "accent"
            ? "text-accent"
            : "text-fg";
  return (
    <div className={`flex shrink-0 items-baseline gap-1.5 ${className ?? ""}`}>
      <span className={`font-mono text-xs tabular-nums ${color}`}>{value}</span>
      <span className="text-2xs uppercase tracking-[0.12em] text-faint">{label}</span>
    </div>
  );
}

export function Hud() {
  const telemetry = useLab((s) => s.telemetry);
  const paused = useLab((s) => s.paused);
  const speed = useLab((s) => s.speed);
  const setPaused = useLab((s) => s.setPaused);
  const setSpeed = useLab((s) => s.setSpeed);
  const clearSim = useLab((s) => s.clearSim);
  const setFeedbackOpen = useLab((s) => s.setFeedbackOpen);

  return (
    <header className="relative z-20 shrink-0 border-b border-border bg-surface/80 px-3 py-2 backdrop-blur-md md:px-4">
      <div className="flex items-center gap-2">
        <div className="flex shrink-0 items-baseline gap-2 pr-1">
          <span className="text-sm font-medium tracking-[0.18em] text-fg">HELION</span>
          <span className="hidden text-2xs uppercase tracking-[0.16em] text-faint lg:inline">
            Particle Lab
          </span>
        </div>

        <div className="lab-scroll flex min-w-0 flex-1 items-center gap-3 overflow-x-auto">
          <Stat
            label="FPS"
            value={telemetry.fps.toFixed(0)}
            tone={telemetry.fps < 28 ? "warn" : "accent"}
          />
          <Stat label="ms" value={formatMs(telemetry.frameMs)} />
          <Stat label="live" value={formatInt(telemetry.live)} />
          <Stat
            label="NaN"
            value={formatInt(telemetry.nanCount)}
            tone={telemetry.nanCount ? "danger" : "ok"}
            />
          <Stat
            label={telemetry.backend}
            value={telemetry.compute}
            />
        </div>

        <div className="ml-1 flex shrink-0 items-center gap-1">
          {SPEEDS.map((s) => (
            <Chip
              key={s}
              active={speed === s}
              onClick={() => setSpeed(s)}
              className={s === 0.25 || s === 4 ? "hidden sm:inline-flex" : undefined}
            >
              {s === 1 ? "1×" : `${s}×`}
            </Chip>
          ))}
          <Button
            variant={paused ? "default" : "outline"}
            size="icon"
            aria-label={paused ? "Resume" : "Pause"}
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play className="size-3.5 translate-x-px" /> : <Pause className="size-3.5" />}
          </Button>
          <Button variant="outline" size="sm" className="h-9 px-2.5" aria-label="Clear" onClick={clearSim}>
            <RotateCcw className="size-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 border-accent/30 bg-accent/10 px-2.5 text-accent hover:bg-accent/20"
            aria-label="Feedback and Bug Reports"
            onClick={() => setFeedbackOpen(true)}
          >
            <MessageSquarePlus className="size-3.5" />
            <span className="hidden md:inline">Feedback & Bugs</span>
          </Button>
        </div>
      </div>
    </header>
  );
}
