import { useEffect, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { COMMENT_BODY_MAX, type PublicComment } from "@/lib/comments/types";

/**
 * Comments section for a PUBLIC creation (Item 9).
 *
 * Reading comments requires NO login — the list comes from the public,
 * PII-free `listCommentsFn` (author display name only, hidden comments
 * excluded). Posting is authenticated (it writes): a signed-out visitor is
 * prompted to sign in rather than forced. Server functions are imported
 * dynamically inside effects/handlers, matching the SSR-safe app pattern.
 *
 * Rendered as a collapsible floating panel so it overlays the running sim on
 * the share route without taking over the chromeless canvas.
 */
export function CreationComments({ creationId }: { creationId: string }) {
  const { user } = useCurrentUserState();
  const signedIn = Boolean(user);

  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [body, setBody] = useState("");
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const { listCommentsFn } = await import("@/lib/comments/functions");
        const rows = await listCommentsFn({ data: { creationId } });
        if (!cancelled) setComments(rows);
      } catch {
        if (!cancelled) setComments([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, creationId]);

  const onPost = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    if (!signedIn) {
      toast.message("Sign in to comment");
      return;
    }
    setPosting(true);
    try {
      const { postCommentFn } = await import("@/lib/comments/functions");
      const created = await postCommentFn({ data: { creationId, body: trimmed } });
      if (!created) {
        toast.error("Comments are only open on published creations");
        return;
      }
      setComments((prev) => [created, ...prev]);
      setBody("");
      toast.success("Comment posted");
    } catch {
      toast.error("Could not post your comment");
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-20 flex max-w-[min(92vw,22rem)] flex-col">
      {open ? (
        <div className="mb-2 flex max-h-[60dvh] flex-col overflow-hidden rounded-lg border border-border bg-surface/90 text-fg shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-2xs uppercase tracking-[0.12em] text-faint">
              Comments · {comments.length}
            </span>
          </div>
          <div className="lab-scroll flex flex-col gap-2 overflow-y-auto px-3 py-2">
            {comments.length === 0 ? (
              <p className="py-4 text-center text-2xs text-faint">
                No comments yet — be the first.
              </p>
            ) : (
              comments.map((c) => (
                <div key={c.id} className="rounded-md bg-elevated/40 px-2.5 py-1.5">
                  <p className="text-2xs text-faint">{c.author}</p>
                  <p className="whitespace-pre-wrap break-words text-xs text-fg">{c.body}</p>
                </div>
              ))
            )}
          </div>
          <div className="flex items-end gap-1.5 border-t border-border px-3 py-2">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value.slice(0, COMMENT_BODY_MAX))}
              placeholder={signedIn ? "Add a comment…" : "Sign in to comment"}
              aria-label="Comment body"
              rows={2}
              className="lab-scroll min-w-0 flex-1 resize-none rounded-md border border-border bg-bg px-2 py-1.5 text-xs text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button
              variant="default"
              size="icon"
              className="size-8 shrink-0"
              aria-label="Post comment"
              disabled={posting || body.trim().length === 0}
              onClick={() => void onPost()}
            >
              <Send className="size-3.5" />
            </Button>
          </div>
        </div>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        className="h-8 w-fit"
        data-testid="toggle-comments"
        onClick={() => setOpen((v) => !v)}
      >
        <MessageSquare className="size-3.5" />
        Comments
      </Button>
    </div>
  );
}
