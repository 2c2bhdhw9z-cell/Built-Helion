import { useSession } from "@/lib/multiplayer/session-store";

/** Live peer cursors, parented inside the canvas view transform. */
export function SessionCursors({
  viewportH,
  worldScale = 1,
}: {
  viewportH: number;
  worldScale?: number;
}) {
  const cursors = useSession((s) => s.cursors);
  const h = Math.max(viewportH, 1);
  const scale = Math.max(worldScale, 1e-6);
  const now = Date.now();
  const entries = Object.values(cursors).filter((c) => now - c.at < 4000);
  if (entries.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {entries.map((c) => (
        <div
          key={c.id}
          className="absolute -translate-x-1/2 -translate-y-1/2"
          style={{
            left: (c.x / scale) * h,
            top: (c.y / scale) * h,
          }}
        >
          <div
            className="size-3 rotate-45 rounded-[1px]"
            style={{
              background: c.color,
              boxShadow: c.down ? `0 0 10px ${c.color}` : undefined,
              opacity: c.down ? 1 : 0.85,
            }}
          />
          <div
            className="mt-1 max-w-28 truncate rounded-sm px-1 py-px text-[10px] font-medium tracking-wide"
            style={{ color: "#081012", background: c.color }}
          >
            {c.name}
          </div>
        </div>
      ))}
    </div>
  );
}
