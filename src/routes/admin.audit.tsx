import { createFileRoute } from "@tanstack/react-router";
import type { AuditEntry } from "@/lib/audit/functions";

/** Extract the admin token from `?token=...` (client-supplied, verified server-side). */
type AdminSearch = { token?: string };

export const Route = createFileRoute("/admin/audit")({
  component: AdminAudit,
  validateSearch: (search: Record<string, unknown>): AdminSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: async ({ deps }) => {
    // The audit view is authorized SERVER-SIDE inside listAllAuditFn
    // (assertAdmin, fail-closed). We forward the token from the URL; an
    // unauthorized caller is mapped to an empty list server-side and, if the
    // gate throws a ForbiddenError across the boundary, we surface an
    // access-denied state rather than fabricating rows.
    //
    // Import the server fn dynamically INSIDE the loader (not at module top
    // level) so its `createServerFn(...).handler(createSsrRpc(...))` call is not
    // co-located into the route-tree SSR chunk. A top-level call there formed a
    // circular ESM chunk dependency with the chunk that defines `createSsrRpc`,
    // throwing `TypeError: createSsrRpc is not a function` and 500ing every
    // route (see the FEAT-001 login fix and admin.feedback.tsx). Keep this route
    // matching that pattern.
    try {
      const { listAllAuditFn } = await import("@/lib/audit/functions");
      const entries = await listAllAuditFn({ data: { token: deps.token } });
      return { entries, authorized: true as const };
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 403) return { entries: [], authorized: false as const };
      throw err;
    }
  },
});

/**
 * `at` comes back from Postgres as a timestamptz. The pg/PGLite drivers parse
 * that OID into a Date object (db.ts only string-normalizes the plain `date`
 * OID), so coerce to an ISO string for display regardless of shape.
 */
function formatAt(value: AuditEntry["at"]): string {
  const raw: unknown = value;
  if (raw == null) return "—";
  if (raw instanceof Date) return raw.toISOString();
  const d = new Date(raw as string | number);
  return Number.isNaN(d.getTime()) ? String(raw) : d.toISOString();
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td className="border-b border-border px-3 py-2 align-top text-xs text-fg">
      {children}
    </td>
  );
}

function AdminAudit() {
  const { entries, authorized } = Route.useLoaderData();

  if (!authorized) {
    return (
      <div className="min-h-dvh bg-bg text-fg">
        <header className="border-b border-border bg-surface/80 px-4 py-3 backdrop-blur-md">
          <h1 className="text-sm font-medium tracking-[0.18em]">AUDIT LOG</h1>
        </header>
        <main className="p-4">
          <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-24 text-center">
            <p className="text-sm text-fg">Access denied</p>
            <p className="text-2xs leading-relaxed text-faint">
              This admin view is protected. Sign in with an allowlisted,
              verified email (add it to
              <span className="mx-1 font-mono">ADMIN_EMAILS</span>), or open it
              with the shared token, e.g.
              <span className="mx-1 font-mono">/admin/audit?token=&lt;FEEDBACK_ADMIN_TOKEN&gt;</span>
              (set <span className="font-mono">FEEDBACK_ADMIN_TOKEN</span> in your
              deploy environment).
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-border bg-surface/80 px-4 py-3 backdrop-blur-md">
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-medium tracking-[0.18em]">AUDIT LOG</h1>
          <span className="text-2xs uppercase tracking-[0.12em] text-faint">
            {entries.length} {entries.length === 1 ? "entry" : "entries"}
          </span>
        </div>
      </header>

      <main className="p-4">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-24 text-center">
            <p className="text-sm text-fg">No audit entries yet</p>
            <p className="text-2xs text-faint">
              Privileged actions (suspend, reinstate, feature) will appear here.
            </p>
          </div>
        ) : (
          <div className="lab-scroll overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-elevated">
                  {["Time", "User", "Action", "Detail"].map((h) => (
                    <th
                      key={h}
                      className="border-b border-border px-3 py-2 text-2xs uppercase tracking-[0.12em] text-faint"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-elevated/50">
                    <Cell>
                      <span className="whitespace-nowrap font-mono">
                        {formatAt(entry.at)}
                      </span>
                    </Cell>
                    <Cell>
                      <span className="font-mono">{entry.userId}</span>
                    </Cell>
                    <Cell>
                      <span className="font-mono">{entry.action}</span>
                    </Cell>
                    <Cell>
                      <div className="max-w-md whitespace-pre-wrap">
                        {entry.detail || "—"}
                      </div>
                    </Cell>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
