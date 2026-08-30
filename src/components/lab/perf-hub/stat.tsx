import { cn } from "@/lib/utils";

export type Tone = "ok" | "warn" | "danger" | "accent" | "muted";

/**
 * Tone -> text color token. Salvaged (and extended) from the old HUD `Stat`
 * component so tone thresholds live in ONE place now that the cramped HUD strip
 * is gone.
 */
export function toneColor(tone?: Tone): string {
  switch (tone) {
    case "ok":
      return "text-ok";
    case "warn":
      return "text-warn";
    case "danger":
      return "text-danger";
    case "accent":
      return "text-accent";
    case "muted":
      return "text-faint";
    default:
      return "text-fg";
  }
}

/** FPS tone thresholds (matches the old HUD: warn under 28fps). */
export function fpsTone(fps: number): Tone {
  if (fps <= 0) return "muted";
  if (fps < 28) return "warn";
  if (fps < 50) return "accent";
  return "ok";
}

/** Frame-time tone thresholds (>20ms == dropped-frame territory). */
export function frameMsTone(ms: number): Tone {
  if (ms <= 0) return "muted";
  if (ms > 33.3) return "danger";
  if (ms > 20) return "warn";
  return "ok";
}

/** Non-zero count -> danger/warn, zero -> ok. */
export function countTone(n: number, danger = true): Tone {
  if (n <= 0) return "ok";
  return danger ? "danger" : "warn";
}

/**
 * A single labelled stat cell. Salvaged from the old HUD `Stat` but restyled for
 * the perf hub's grid layout (label above value).
 */
export function Stat({
  label,
  value,
  tone,
  sub,
  className,
}: {
  label: string;
  value: string;
  tone?: Tone;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-0.5", className)}>
      <span className="text-2xs uppercase tracking-[0.12em] text-faint">{label}</span>
      <span className={cn("font-mono text-sm tabular-nums", toneColor(tone))}>{value}</span>
      {sub ? <span className="text-2xs text-faint">{sub}</span> : null}
    </div>
  );
}

/** A labelled value row for the system/backend key-value lists. */
export function InfoRow({
  label,
  value,
  tone,
  mono = true,
}: {
  label: string;
  value: string;
  tone?: Tone;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5">
      <span className="shrink-0 text-2xs uppercase tracking-[0.12em] text-faint">{label}</span>
      <span
        className={cn(
          "min-w-0 truncate text-right text-xs",
          mono && "font-mono tabular-nums",
          toneColor(tone),
        )}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
