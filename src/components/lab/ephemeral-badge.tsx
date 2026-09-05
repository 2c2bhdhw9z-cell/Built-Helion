import { Database } from "lucide-react";
import { useBackendInfo } from "@/lib/db-info/use-backend-info";

/**
 * Subtle, non-blocking indicator that the active database backend is ephemeral
 * (Req 1.4).
 *
 * When the app is running against the in-memory Embedded_Database (PGLite,
 * active when `DATABASE_URL` is unset), saved data does not survive a process
 * restart. This badge warns the user that storage is not persistent.
 *
 * It renders NOTHING while the one-shot backend probe is loading, on error, or
 * when the backend is durable (Neon) — see `useBackendInfo`, which fails
 * neutral. It therefore never blocks or overlays the simulator and never warns
 * speculatively; it appears only once the server confirms `ephemeral: true`.
 *
 * Styling mirrors the compact HUD affordances (h-9 pill, 1px ring border via
 * the shared `shadow-[0_0_0_1px_...]` idiom, Tailwind tokens) so it reads as a
 * quiet status chip beside the account controls rather than an alert.
 */
export function EphemeralBadge() {
  const { ephemeral } = useBackendInfo();
  if (!ephemeral) return null;

  return (
    <span
      role="status"
      title="Storage is not persistent — this backend is in-memory and resets on restart. Saved creations may be lost."
      aria-label="Storage is not persistent"
      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-amber-500 shadow-[0_0_0_1px_var(--color-amber-500,#f59e0b)]"
    >
      <Database className="size-3.5" />
      <span className="hidden sm:inline">Ephemeral</span>
    </span>
  );
}
