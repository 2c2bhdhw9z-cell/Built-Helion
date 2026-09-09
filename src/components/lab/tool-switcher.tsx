import { useEffect } from "react";
import {
  Grid3x3,
  Magnet,
  Orbit,
  Paintbrush,
  PenLine,
  Snowflake,
  Waves,
  Wind,
} from "lucide-react";
import type { ToolKind } from "@/engine/types";
import { useLab } from "@/store/lab-store";
import { cn } from "@/lib/utils";

/**
 * Long-press tool switcher (Item 17). Opened by a long-press on the canvas at
 * the press point (touch only); tap a tool to select it and dismiss, tap the
 * backdrop or press Escape to cancel. Mirrors the ToolBar's tool set so the two
 * never drift. Kept as a lightweight absolutely-positioned popover (not a Radix
 * dialog) so it lands exactly where the finger was and does not steal the whole
 * screen.
 */

const TOOLS: { id: ToolKind; label: string; icon: typeof Magnet }[] = [
  { id: "attract", label: "Attract", icon: Magnet },
  { id: "repel", label: "Repel", icon: Wind },
  { id: "repulsor", label: "Repulsor", icon: Waves },
  { id: "vortex", label: "Vortex", icon: Orbit },
  { id: "paint", label: "Paint", icon: Paintbrush },
  { id: "wall", label: "Wall", icon: PenLine },
  { id: "field", label: "Field", icon: Grid3x3 },
  { id: "freeze", label: "Freeze", icon: Snowflake },
];

export function ToolSwitcher({
  x,
  y,
  onClose,
}: {
  x: number;
  y: number;
  onClose: () => void;
}) {
  const tool = useLab((s) => s.tool);
  const setTool = useLab((s) => s.setTool);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Clamp the popover into the viewport so a press near an edge stays on-screen.
  const vw = typeof window !== "undefined" ? window.innerWidth : 360;
  const vh = typeof window !== "undefined" ? window.innerHeight : 640;
  const width = 168;
  const height = 232;
  const left = Math.min(Math.max(8, x - width / 2), vw - width - 8);
  const top = Math.min(Math.max(8, y - height - 12), vh - height - 8);

  return (
    <div
      className="fixed inset-0 z-40"
      // Backdrop: a tap anywhere dismisses without selecting.
      onPointerDown={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        role="menu"
        aria-label="Switch tool"
        className="absolute grid grid-cols-2 gap-1 rounded-lg border border-border bg-surface/95 p-1.5 shadow-xl backdrop-blur-md"
        style={{ left, top, width }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {TOOLS.map((t) => {
          const Icon = t.icon;
          const active = tool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="menuitemradio"
              aria-checked={active}
              aria-label={`${t.label} tool`}
              onPointerDown={(e) => {
                e.stopPropagation();
                setTool(t.id);
                onClose();
              }}
              className={cn(
                "flex h-11 items-center gap-1.5 rounded-sm px-2 text-xs font-medium tracking-wide transition-colors",
                active ? "bg-fg text-accent-fg" : "bg-elevated text-muted hover:text-fg",
              )}
            >
              <Icon className="size-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
