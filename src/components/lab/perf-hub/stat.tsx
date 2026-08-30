import { cn } from "@/lib/utils";
import { toneColor, type Tone } from "./stat-tones";

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
