import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PerfSample } from "@/lib/perf/ring-buffer";
import { histogram, type HistogramBin } from "@/lib/perf/stats";

/**
 * Concrete colors for recharts (which needs real color strings, not Tailwind
 * classes). These mirror the design tokens in src/styles.css so the charts stay
 * on-palette.
 */
export const CHART = {
  accent: "#8ec8c3",
  ok: "#7dba8a",
  warn: "#c4a574",
  danger: "#d4726a",
  faint: "#5c6272",
  fg: "#eceef2",
  grid: "#ffffff14",
  surface: "#101218",
};

const AXIS_TICK = { fill: "#5c6272", fontSize: 9 };

const tooltipStyle = {
  contentStyle: {
    background: CHART.surface,
    border: "1px solid #ffffff24",
    borderRadius: 8,
    fontSize: 11,
    color: CHART.fg,
  } as const,
  labelStyle: { display: "none" } as const,
  itemStyle: { color: CHART.fg } as const,
};

function num(v: number, digits = 1): string {
  if (!Number.isFinite(v)) return "n/a";
  return v.toFixed(digits);
}

/** FPS over the rolling window. */
export function FpsChart({ samples, height = 96 }: { samples: PerfSample[]; height?: number }) {
  const data = samples.map((s, i) => ({ i, fps: Math.round(s.fps * 10) / 10 }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
        <XAxis dataKey="i" hide />
        <YAxis tick={AXIS_TICK} width={34} domain={[0, "auto"]} allowDecimals={false} />
        <Tooltip
          {...tooltipStyle}
          formatter={(v: number) => [`${num(v)} fps`, "FPS"]}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="fps"
          stroke={CHART.accent}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Stacked frame-time breakdown: compute vs render vs other (all ms). */
export function FrameBreakdownChart({
  samples,
  height = 110,
}: {
  samples: PerfSample[];
  height?: number;
}) {
  const data = samples.map((s, i) => ({
    i,
    compute: Math.round(s.computeMs * 100) / 100,
    render: Math.round(s.renderMs * 100) / 100,
    other: Math.round(s.other * 100) / 100,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
        <XAxis dataKey="i" hide />
        <YAxis tick={AXIS_TICK} width={34} allowDecimals />
        <Tooltip
          {...tooltipStyle}
          formatter={(v: number, name: string) => [`${num(v, 2)} ms`, name]}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="compute"
          stackId="1"
          stroke={CHART.accent}
          fill={CHART.accent}
          fillOpacity={0.35}
          strokeWidth={1}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="render"
          stackId="1"
          stroke={CHART.warn}
          fill={CHART.warn}
          fillOpacity={0.35}
          strokeWidth={1}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="other"
          stackId="1"
          stroke={CHART.faint}
          fill={CHART.faint}
          fillOpacity={0.35}
          strokeWidth={1}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const BIN_LABELS = ["<8.3", "8-17", "17-33", "33-50", "50-100", "100+"];

/** Frame-time histogram (BarChart) from stats.histogram. */
export function FrameHistogram({
  samples,
  height = 104,
}: {
  samples: PerfSample[];
  height?: number;
}) {
  const bins: HistogramBin[] = histogram(samples.map((s) => s.frameMs));
  const data = bins.map((b, i) => ({
    label: BIN_LABELS[i] ?? `${b.lo}`,
    count: b.count,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
        <XAxis dataKey="label" tick={AXIS_TICK} interval={0} />
        <YAxis tick={AXIS_TICK} width={34} allowDecimals={false} />
        <Tooltip
          {...tooltipStyle}
          formatter={(v: number) => [`${v} frames`, "count"]}
          isAnimationActive={false}
        />
        <Bar dataKey="count" fill={CHART.accent} radius={[2, 2, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** RAM (bytes) trend as an area sparkline. */
export function RamChart({ samples, height = 80 }: { samples: PerfSample[]; height?: number }) {
  const data = samples.map((s, i) => ({ i, mb: Math.round((s.ramBytes / (1024 * 1024)) * 100) / 100 }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
        <XAxis dataKey="i" hide />
        <YAxis tick={AXIS_TICK} width={34} allowDecimals />
        <Tooltip
          {...tooltipStyle}
          formatter={(v: number) => [`${num(v, 2)} MB`, "RAM"]}
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="mb"
          stroke={CHART.ok}
          fill={CHART.ok}
          fillOpacity={0.3}
          strokeWidth={1}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
