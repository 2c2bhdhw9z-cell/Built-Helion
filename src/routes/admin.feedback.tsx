import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import {
  feedbackStatuses,
  type FeedbackItem,
  type FeedbackStatus,
} from "@/lib/feedback/types";

/** Extract the admin token from `?token=...` (client-supplied, verified server-side). */
type AdminSearch = { token?: string };

export const Route = createFileRoute("/admin/feedback")({
  component: AdminFeedback,
  validateSearch: (search: Record<string, unknown>): AdminSearch => ({
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  loaderDeps: ({ search }) => ({ token: search.token }),
  loader: async ({ deps }) => {
    // The admin surface is authorized SERVER-SIDE inside listFeedbackFn
    // (assertAdmin). We forward the token from the URL; an unauthorized caller
    // gets a ForbiddenError, which we surface as an access-denied state rather
    // than fabricating rows. Never render PII to an unauthorized viewer.
    //
    // Import the server fn dynamically INSIDE the loader (not at module top
    // level) so its `createServerFn(...).handler(createSsrRpc(...))` call is not
    // co-located into the route-tree SSR chunk. A top-level call there formed a
    // circular ESM chunk dependency with the chunk that defines `createSsrRpc`,
    // throwing `TypeError: createSsrRpc is not a function` and 500ing every
    // route (see the FEAT-001 login fix). Keep this route matching that pattern.
    try {
      const { listFeedbackFn } = await import("@/lib/feedback/functions");
      const items = await listFeedbackFn({ data: { token: deps.token } });
      return { items, authorized: true as const };
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 403) return { items: [], authorized: false as const };
      throw err;
    }
  },
});

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  under_review: "Under review",
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  declined: "Declined",
};

function StatusSelect({
  item,
  token,
  onChanged,
}: {
  item: FeedbackItem;
  token?: string;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);

  return (
    <select
      className="rounded-md border border-border bg-elevated px-2 py-1 text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
      value={item.status}
      disabled={pending}
      onChange={async (e) => {
        const status = e.target.value as FeedbackStatus;
        setPending(true);
        try {
          // Import dynamically (not at module top level) so this createServerFn
          // never anchors a top-level createSsrRpc() call into the route-tree
          // SSR chunk (the circular-chunk crash class fixed in FEAT-001).
          const { updateFeedbackStatusFn } = await import(
            "@/lib/feedback/functions"
          );
          await updateFeedbackStatusFn({ data: { id: item.id, status, token } });
          toast.success("Status updated");
          onChanged();
        } catch (err) {
          console.error("Status update failed", err);
          toast.error("Could not update status");
        } finally {
          setPending(false);
        }
      }}
    >
      {feedbackStatuses.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABELS[s]}
        </option>
      ))}
    </select>
  );
}

/**
 * created_at comes back from Postgres as a timestamptz. The pg/PGLite drivers
 * parse that OID into a Date object (db.ts only string-normalizes the plain
 * `date` OID), so coerce to an ISO string for display regardless of shape.
 */
function formatCreatedAt(value: FeedbackItem["created_at"]): string {
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

function AdminFeedback() {
  const { items, authorized } = Route.useLoaderData();
  const { token } = Route.useSearch();
  const router = useRouter();

  const refresh = () => router.invalidate();

  if (!authorized) {
    return (
      <div className="min-h-dvh bg-bg text-fg">
        <header className="border-b border-border bg-surface/80 px-4 py-3 backdrop-blur-md">
          <h1 className="text-sm font-medium tracking-[0.18em]">FEEDBACK ADMIN</h1>
        </header>
        <main className="p-4">
          <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-24 text-center">
            <p className="text-sm text-fg">Access denied</p>
            <p className="text-2xs leading-relaxed text-faint">
              This admin view is protected. Sign in with an allowlisted,
              verified email (add it to
              <span className="mx-1 font-mono">ADMIN_EMAILS</span>), or open it
              with the shared token, e.g.
              <span className="mx-1 font-mono">/admin/feedback?token=&lt;FEEDBACK_ADMIN_TOKEN&gt;</span>
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
          <h1 className="text-sm font-medium tracking-[0.18em]">FEEDBACK ADMIN</h1>
          <span className="text-2xs uppercase tracking-[0.12em] text-faint">
            {items.length} {items.length === 1 ? "submission" : "submissions"}
          </span>
        </div>
      </header>

      <main className="p-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-24 text-center">
            <p className="text-sm text-fg">No submissions yet</p>
            <p className="text-2xs text-faint">
              Feedback submitted through the app will appear here.
            </p>
          </div>
        ) : (
          <div className="lab-scroll overflow-x-auto rounded-lg border border-border">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-elevated">
                  {[
                    "Type",
                    "Title",
                    "Category",
                    "Description",
                    "Steps / Use cases",
                    "Severity / Priority",
                    "Rating",
                    "Votes",
                    "Email",
                    "Created",
                    "Status",
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
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-elevated/50">
                    <Cell>
                      <span className="font-mono uppercase">{item.type}</span>
                    </Cell>
                    <Cell>{item.title}</Cell>
                    <Cell>{item.category ?? "—"}</Cell>
                    <Cell>
                      <div className="max-w-xs whitespace-pre-wrap">
                        {item.description}
                      </div>
                    </Cell>
                    <Cell>
                      <div className="max-w-xs whitespace-pre-wrap">
                        {item.steps_or_use_cases ?? "—"}
                      </div>
                    </Cell>
                    <Cell>{item.severity_or_priority ?? "—"}</Cell>
                    <Cell>{item.rating ?? "—"}</Cell>
                    <Cell>{item.votes}</Cell>
                    <Cell>{item.user_email ?? "—"}</Cell>
                    <Cell>
                      <span className="whitespace-nowrap font-mono">
                        {formatCreatedAt(item.created_at)}
                      </span>
                    </Cell>
                    <Cell>
                      <StatusSelect
                        item={item}
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
      </main>
    </div>
  );
}
