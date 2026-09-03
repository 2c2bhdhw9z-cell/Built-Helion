import { cn } from "@/lib/utils";

export function Chip({
  active,
  children,
  onClick,
  className,
  title,
}: {
  active?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "h-9 shrink-0 rounded-sm px-2.5 text-xs font-medium tracking-wide transition-[background-color,color,opacity] duration-150",
        active ? "bg-fg text-accent-fg" : "bg-elevated text-muted hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (n: number) => string;
  onChange: (n: number) => void;
}) {
  const safeVal = typeof value === "number" && !isNaN(value) ? value : (min ?? 0);
  return (
    <label className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
      <span className="text-xs text-muted">{label}</span>
      <span className="font-mono text-2xs tabular-nums text-fg">
        {format ? format(safeVal) : safeVal.toFixed(2)}
      </span>
      <input
        type="range"
        className="lab-range col-span-2 w-full"
        min={min}
        max={max}
        step={step}
        value={safeVal}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        suppressHydrationWarning
      />
    </label>
  );
}

export function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex h-8 items-center justify-between gap-3">
      <span className="text-xs text-muted">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors duration-150",
          checked ? "bg-accent" : "bg-elevated shadow-[0_0_0_1px_var(--color-border)]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-4 rounded-full bg-fg transition-transform duration-150",
            checked && "translate-x-4 bg-accent-fg",
          )}
        />
      </button>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-md bg-elevated p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          className={cn(
            "h-7 flex-1 rounded-sm px-2 text-2xs font-medium tracking-wide transition-colors duration-150",
            value === o.id ? "bg-fg text-accent-fg" : "text-muted hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
