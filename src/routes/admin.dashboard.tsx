import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AdminAccount, AdminAnalytics } from "@/lib/admin/types";

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
      const { listAccountsFn, getAnalyticsFn } = await import(
        "@/lib/admin/functions"
      );
      const [accounts, analytics] = await Promise.all([
        listAccountsFn({ data: { token: deps.token } }),
        getAnalyticsFn({ data: { token: deps.token } }),
      ]);
      // The gated fns map a denial to an empty list / null analytics. Treat a
      // null analytics AND empty account list as "no admin access" so we render
      // the same access-denied panel admin.feedback.tsx shows on a 403 rather
      // than a misleading empty dashboard.
      const authorized = analytics !== null || accounts.length > 0;
      return { accounts, analytics, authorized };
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 403) {
        return {
          accounts: [] as AdminAccount[],
          analytics: null as AdminAnalytics | null,
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

function AdminDashboard() {
  const { accounts, analytics, authorized } = Route.useLoaderData();
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
