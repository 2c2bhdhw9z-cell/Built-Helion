import { createFileRoute, useRouter } from "@tanstack/react-router";
import { EyeOff, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { AdminComment } from "@/lib/comments/types";

/**
 * Comment moderation admin route: /admin/comments?creationId=…&token=…
 *
 * Mirrors the feedback admin route: the surface is authorized SERVER-SIDE
 * inside the comment admin fns (assertAdmin). We forward the token from the
 * URL; an unauthorized caller gets a ForbiddenError, surfaced as an
 * access-denied state rather than fabricated rows. Lists ALL comments for a
 * creation (including hidden) so a moderator can hide/unhide or hard-delete.
 */
type AdminSearch = { creationId?: string; token?: string };

export const Route = createFileRoute("/admin/comments")({
  component: AdminComments,
  validateSearch: (search: Record<string, unknown>): AdminSearch => ({
    creationId: typeof search.creationId === "string" ? search.creationId : undefined,
    token: typeof search.token === "string" ? search.token : undefined,
  }),
  loaderDeps: ({ search }) => ({ creationId: search.creationId, token: search.token }),
  loader: async ({ deps }) => {
    if (!deps.creationId) {
      return { items: [] as AdminComment[], authorized: true as const, hasTarget: false as const };
    }
    // Import the server fn dynamically INSIDE the loader (not at module top
    // level) so its createServerFn().handler(createSsrRpc()) call is not
    // co-located into the route-tree SSR chunk — a top-level call there forms a
    // circular ESM chunk dependency ("createSsrRpc is not a function", 500s
    // every route). Matches the feedback admin route.
    try {
      const { listAdminCommentsFn } = await import("@/lib/comments/functions");
      const items = await listAdminCommentsFn({
        data: { creationId: deps.creationId, token: deps.token },
      });
      return { items, authorized: true as const, hasTarget: true as const };
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 403) {
        return { items: [] as AdminComment[], authorized: false as const, hasTarget: true as const };
      }
      throw err;
    }
  },
});

function AdminComments() {
  const { items, authorized, hasTarget } = Route.useLoaderData();
  const { creationId, token } = Route.useSearch();
  const router = useRouter();
  const refresh = () => router.invalidate();

  const onHide = async (item: AdminComment, hidden: boolean) => {
    try {
      const { hideCommentFn } = await import("@/lib/comments/functions");
      await hideCommentFn({ data: { id: item.id, hidden, token } });
      toast.success(hidden ? "Comment hidden" : "Comment restored");
      refresh();
    } catch {
      toast.error("Could not update comment");
    }
  };

  const onDelete = async (item: AdminComment) => {
    try {
      const { deleteCommentFn } = await import("@/lib/comments/functions");
      await deleteCommentFn({ data: { id: item.id, token } });
      toast.success("Comment deleted");
      refresh();
    } catch {
      toast.error("Could not delete comment");
    }
  };

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-border bg-surface/80 px-4 py-3 backdrop-blur-md">
        <h1 className="text-sm font-medium tracking-[0.18em]">COMMENT MODERATION</h1>
      </header>
      <main className="p-4">
        {!authorized ? (
          <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border py-24 text-center">
            <p className="text-sm text-fg">Access denied</p>
            <p className="text-2xs leading-relaxed text-faint">
              This admin view is protected. Open it with the shared token, e.g.
              <span className="mx-1 font-mono">
                /admin/comments?creationId=&lt;id&gt;&amp;token=&lt;FEEDBACK_ADMIN_TOKEN&gt;
              </span>
              or sign in with an allowlisted, verified email.
            </p>
          </div>
        ) : !hasTarget || !creationId ? (
          <div className="mx-auto flex max-w-md flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-24 text-center">
            <p className="text-sm text-fg">Pick a creation to moderate</p>
            <p className="text-2xs text-faint">
              Add <span className="font-mono">?creationId=&lt;id&gt;</span> to the URL.
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-24 text-center">
            <p className="text-sm text-fg">No comments on this creation</p>
          </div>
        ) : (
          <ul className="mx-auto flex max-w-2xl flex-col gap-2">
            {items.map((item) => (
              <li
                key={item.id}
                className={`flex items-start gap-2 rounded-md border border-border px-3 py-2 ${
                  item.hidden ? "bg-elevated/20 opacity-60" : "bg-elevated/40"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-2xs text-faint">
                    {item.author}
                    {item.hidden ? <span className="ml-2 font-mono uppercase">hidden</span> : null}
                  </p>
                  <p className="whitespace-pre-wrap break-words text-xs text-fg">{item.body}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={item.hidden ? "Unhide comment" : "Hide comment"}
                  onClick={() => void onHide(item, !item.hidden)}
                >
                  {item.hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label="Delete comment"
                  onClick={() => void onDelete(item)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
