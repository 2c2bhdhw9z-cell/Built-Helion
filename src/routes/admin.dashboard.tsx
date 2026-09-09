import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type {
  AdminAccount,
  AdminAnalytics,
  AdminBreakdownSlice,
  AdminDashboardAnalytics,
  AdminTrend,
} from "@/lib/admin/types";

/** Extract the admin token from `?token=...` (client-supplied, verified server-side). */
type AdminSearch = { token?: string };

export const Route = createFileRoute("/admin/dashboard")({
  component: AdminDashboard,
  validateSearch: (search: Record<string, unknown>): AdminSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: async ({ deps }) => {
    // The admin dashboard is authorized SERVER-SIDE inside listAccountsFn /
    // getAnalyticsFn (assertAdmin). We forward the token from the URL; an
    // unauthorized caller gets an empty list / null analytics (the fns fail
    // closed) rather than fabricated rows. Never render account rows or
    // analytics to an unauthorized viewer.
    //
    // Import the server fns dynamically INSIDE the loader (not at module top
    // level) so their `createServerFn(...).handler(createSsrRpc(...))` calls are
    // not co-located into the route-tree SSR chunk. A top-level call there
    // formed a circular ESM chunk dependency with the chunk that defines
    // `createSsrRpc`, throwing `TypeError: createSsrRpc is not a function` and
    // 500ing every route (see the FEAT-001 login fix and admin.feedback.tsx).
    // Keep this route matching that pattern.
    try {
      const { listAccountsFn, getAnalyticsFn, getDashboardAnalyticsFn, getAnalyticsTrendFn } =
        await import("@/lib/admin/functions");
      const [accounts, analytics, dashboard, trend] = await Promise.all([
        listAccountsFn({ data: { token: deps.token } }),
        getAnalyticsFn({ data: { token: deps.token } }),
        getDashboardAnalyticsFn({ data: { token: deps.token } }),
        getAnalyticsTrendFn({ data: { token: deps.token } }),
      ]);
      // The gated fns map a denial to an empty list / null analytics. Treat a
      // null analytics AND empty account list as "no admin access" so we render
      // the same access-denied panel admin.feedback.tsx shows on a 403 rather
      // than a misleading empty dashboard.
      const authorized = analytics !== null || accounts.length > 0;
      return { accounts, analytics, dashboard, trend, authorized };
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 403) {
        return {
          accounts: [] as AdminAccount[],
          analytics: null as AdminAnalytics | null,
          dashboard: null as AdminDashboardAnalytics | null,
          trend: null as AdminTrend | null,
          authorized: false,
        };
      }
      throw err;
    }
  },
});

/**
 * Per-row suspend/reinstate control. Mirrors admin.feedback.tsx's StatusSelect:
 * the mutating server fn is imported DYNAMICALLY inside the handler (never at
 * module top level) so this createServerFn never anchors a top-level
 * createSsrRpc() call into the route-tree SSR chunk (the circular-chunk crash
 * class fixed in FEAT-001). On success we toast and invalidate the route so the
 * loader re-runs and the table reflects the new suspended state.
 */
function SuspendToggle({
  account,
  token,
  onChanged,
}: {
  account: AdminAccount;
  token?: string;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);
  const suspended = account.suspended;

  return (
    <Button
      variant={suspended ? "outline" : "default"}
      size="sm"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          // Import dynamically (not at module top level) so this createServerFn
          // never anchors a top-level createSsrRpc() call into the route-tree
          // SSR chunk (the circular-chunk crash class fixed in FEAT-001).
          const { suspendAccountFn, reinstateAccountFn } = await import(
            "@/lib/admin/functions"
          );
          const result = suspended
            ? await reinstateAccountFn({
                data: { targetId: account.id, token },
              })
            : await suspendAccountFn({
                data: { targetId: account.id, token },
              });
          if (!result.ok) {
            toast.error(
              suspended ? "Could not reinstate account" : "Could not suspend account",
            );
            return;
          }
          toast.success(suspended ? "Account reinstated" : "Account suspended");
          onChanged();
        } catch (err) {
          console.error("Account action failed", err);
          toast.error("Could not update account");
        } finally {
          setPending(false);
        }
      }}
    >
      {suspended ? "Reinstate" : "Suspend"}
    </Button>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return (
    <td className="border-b border-border px-3 py-2 align-top text-xs text-fg">
      {children}
    </td>
  );
}

/** One analytics metric tile. Shows a coerced numeric total (0 when the store
 * is empty — the gated fn returns real counts, never fabricated data). */
function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-elevated px-4 py-3">
      <span className="text-2xs uppercase tracking-[0.12em] text-faint">{label}</span>
      <span className="font-mono text-lg text-fg">{value}</span>
    </div>
  );
}

/**
 * A horizontal-bar breakdown of `{ label, count }` slices (device tiers, popular
 * generators, particle buckets). Bars are scaled to the largest slice; an empty
 * list renders a genuine empty state — never fabricated rows. Aggregate only, no
 * PII (Req 12).
 */
function Breakdown({
  title,
  slices,
  empty,
}: {
  title: string;
  slices: AdminBreakdownSlice[];
  empty: string;
}) {
  const max = slices.reduce((m, s) => Math.max(m, s.count), 0);
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-elevated px-4 py-3">
      <span className="text-2xs uppercase tracking-[0.12em] text-faint">{title}</span>
      {slices.length === 0 ? (
        <p className="py-4 text-center text-2xs text-faint">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {slices.map((s) => (
            <li key={s.label} className="flex flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-xs text-fg" title={s.label}>
                  {s.label}
                </span>
                <span className="shrink-0 font-mono text-2xs text-faint">{s.count}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-fg/70"
                  style={{ width: `${max > 0 ? Math.round((s.count / max) * 100) : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * DAU/WAU time-series trend (Item 21). A grouped mini bar chart — DAU and WAU
 * per day plus a compact samples row — scaled to the largest value in the
 * window. No chart library (same hand-rolled bar idiom as `Breakdown`).
 * Aggregate only, no PII. Rolled up lazily-on-view (see getAnalyticsTrend).
 */
function TrendChart({ trend }: { trend: AdminTrend }) {
  const points = trend.points;
  const max = points.reduce((m, p) => Math.max(m, p.dau, p.wau), 0);
  const latest = points[points.length - 1];
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-elevated px-4 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-2xs uppercase tracking-[0.12em] text-faint">
          Active users · last {points.length} days
        </span>
        <span className="flex items-center gap-3 text-2xs text-faint">
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-sm bg-fg/80" aria-hidden />
            DAU {latest?.dau ?? 0}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block size-2 rounded-sm bg-fg/40" aria-hidden />
            WAU {latest?.wau ?? 0}
          </span>
        </span>
      </div>
      {points.length === 0 ? (
        <p className="py-4 text-center text-2xs text-faint">No activity recorded yet.</p>
      ) : (
        <div className="flex h-28 items-end gap-1" data-testid="admin-trend">
          {points.map((p) => (
            <div
              key={p.day}
              className="flex min-w-0 flex-1 items-end justify-center gap-0.5"
              title={`${p.day} · DAU ${p.dau} · WAU ${p.wau} · ${p.samples} samples`}
            >
              <div
                className="w-1/2 rounded-sm bg-fg/80"
                style={{ height: `${max > 0 ? Math.max(2, Math.round((p.dau / max) * 100)) : 2}%` }}
              />
              <div
                className="w-1/2 rounded-sm bg-fg/40"
                style={{ height: `${max > 0 ? Math.max(2, Math.round((p.wau / max) * 100)) : 2}%` }}
              />
            </div>
          ))}
        </div>
      )}
      <p className="text-2xs leading-relaxed text-faint">
        DAU = distinct accounts active that day; WAU = distinct accounts over the trailing 7 days.
        Rolled up on view (no scheduler).
      </p>
    </div>
  );
}

function AdminDashboard() {
  const { accounts, analytics, dashboard, trend, authorized } = Route.useLoaderData();
  const { token } = Route.useSearch();
  const router = useRouter();

  const refresh = () => router.invalidate();

  if (!authorized) {
    return (
      <div className="min-h-dvh bg-bg text-fg">
        <header className="border-b border-border bg-surface/80 px-4 py-3 backdrop-blur-md">
          <h1 className="text-sm font-medium tracking-[0.18em]">ADMIN DASHBOARD</h1>
        </header>
        <main className="p-4">
          <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-24 text-center">
            <p className="text-sm text-fg">Access denied</p>
            <p className="text-2xs leading-relaxed text-faint">
              This admin view is protected. Sign in with an allowlisted,
              verified email (add it to
              <span className="mx-1 font-mono">ADMIN_EMAILS</span>), or open it
              with the shared token, e.g.
              <span className="mx-1 font-mono">/admin/dashboard?token=&lt;FEEDBACK_ADMIN_TOKEN&gt;</span>
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
          <h1 className="text-sm font-medium tracking-[0.18em]">ADMIN DASHBOARD</h1>
          <span className="text-2xs uppercase tracking-[0.12em] text-faint">
            {accounts.length} {accounts.length === 1 ? "account" : "accounts"}
          </span>
        </div>
      </header>

      <main className="flex flex-col gap-6 p-4">
        <section>
          <h2 className="mb-3 text-2xs uppercase tracking-[0.12em] text-faint">
            Analytics
          </h2>
          {analytics === null ? (
            <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-2xs text-faint">
              No analytics available.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Accounts" value={analytics.accounts} />
              <Metric label="Saved creations" value={analytics.savedCreations} />
              <Metric label="Published" value={analytics.publishedCreations} />
              <Metric label="Total likes" value={analytics.totalLikes} />
            </div>
          )}
        </section>

        {trend !== null && (
          <section>
            <h2 className="mb-3 text-2xs uppercase tracking-[0.12em] text-faint">
              Trends
            </h2>
            <TrendChart trend={trend} />
          </section>
        )}

        {dashboard !== null && (
          <section>
            <h2 className="mb-3 text-2xs uppercase tracking-[0.12em] text-faint">
              Usage &amp; telemetry
            </h2>
            <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Active users (30d)" value={dashboard.activeUsers} />
              <Metric label="Telemetry samples" value={dashboard.telemetrySamples} />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <Breakdown
                title="Popular generators"
                slices={dashboard.popularGenerators}
                empty="No generator usage recorded yet."
              />
              <Breakdown
                title="Device tiers"
                slices={dashboard.deviceTiers}
                empty="No telemetry samples yet."
              />
              <Breakdown
                title="Particle buckets"
                slices={dashboard.particleBuckets}
                empty="No telemetry samples yet."
              />
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-2xs uppercase tracking-[0.12em] text-faint">
            Accounts
          </h2>
          {accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-24 text-center">
              <p className="text-sm text-fg">No accounts yet</p>
              <p className="text-2xs text-faint">
                Accounts that sign up will appear here.
              </p>
            </div>
          ) : (
            <div className="lab-scroll overflow-x-auto rounded-lg border border-border">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-elevated">
                    {[
                      "ID",
                      "Display name",
                      "Creations",
                      "Likes",
                      "Suspended",
                      "Action",
                    ].map((h) => (
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
                  {accounts.map((account) => (
                    <tr key={account.id} className="hover:bg-elevated/50">
                      <Cell>
                        <span className="font-mono">{account.id}</span>
                      </Cell>
                      <Cell>{account.displayName}</Cell>
                      <Cell>{account.creations}</Cell>
                      <Cell>{account.likes}</Cell>
                      <Cell>
                        <span className="font-mono uppercase">
                          {account.suspended ? "yes" : "no"}
                        </span>
                      </Cell>
                      <Cell>
                        <SuspendToggle
                          account={account}
                          token={token}
                          onChanged={refresh}
                        />
                      </Cell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
