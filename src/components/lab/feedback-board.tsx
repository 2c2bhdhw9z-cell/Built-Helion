import { useCallback, useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowBigUp, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLab } from "@/store/lab-store";
import { listPublicFeedbackFn, voteFeedbackFn } from "@/lib/feedback/functions";
import { type FeedbackStatus, type PublicFeedbackItem } from "@/lib/feedback/types";
import { kv } from "@/lib/platform/storage";

/**
 * PUBLIC, votable feedback board rendered inside the sim (Radix Dialog mirroring
 * feedback-dialog.tsx). It fetches PII-free rows via listPublicFeedbackFn (no
 * user_email ever crosses this boundary) and lets anyone upvote via
 * voteFeedbackFn — no login required to view or vote.
 *
 * One-vote-per-item is BEST-EFFORT without login: voted ids are tracked in
 * platform KV ('helion.voted-feedback'); an already-voted item's control is
 * disabled and skips the server call. This is a nicety, not a hard guarantee —
 * the server-side per-IP throttle is the real flood guard.
 */

const VOTED_STORAGE_KEY = "helion.voted-feedback";

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  under_review: "Under review",
  planned: "Planned",
  in_progress: "In progress",
  completed: "Completed",
  declined: "Declined",
};

const TYPE_LABELS: Record<PublicFeedbackItem["type"], string> = {
  bug: "Bug",
  feature: "Feature",
  general: "General",
};

/** Coerce created_at (Date on server, ISO string across the fn boundary). */
function formatCreatedAt(value: PublicFeedbackItem["created_at"]): string {
  const raw: unknown = value;
  if (raw == null) return "—";
  const d = raw instanceof Date ? raw : new Date(raw as string | number);
  return Number.isNaN(d.getTime()) ? String(raw) : d.toLocaleDateString();
}

function readVotedIds(): Set<string> {
  try {
    const raw = kv().get(VOTED_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? new Set(parsed.filter((v): v is string => typeof v === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

function persistVotedIds(ids: Set<string>): void {
  try {
    kv().set(VOTED_STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage unavailable — the in-memory set still guards this session.
  }
}

function StatusBadge({ status }: { status: FeedbackStatus }) {
  return (
    <span className="rounded-full border border-border px-2 py-0.5 text-2xs uppercase tracking-[0.1em] text-faint">
      {STATUS_LABELS[status]}
    </span>
  );
}

export function FeedbackBoard() {
  const open = useLab((s) => s.boardOpen);
  const setOpen = useLab((s) => s.setBoardOpen);

  const [items, setItems] = useState<PublicFeedbackItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [votedIds, setVotedIds] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listPublicFeedbackFn();
      setItems(rows);
      setLoaded(true);
    } catch (err) {
      console.error("Failed to load feedback board", err);
      toast.error("Could not load the feedback board.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch fresh public feedback each time the board opens; sync voted ids.
  useEffect(() => {
    if (!open) return;
    setVotedIds(readVotedIds());
    void load();
  }, [open, load]);

  const onVote = useCallback(
    async (item: PublicFeedbackItem) => {
      if (votedIds.has(item.id)) return; // best-effort local guard
      // Optimistic increment + mark voted.
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, votes: it.votes + 1 } : it,
        ),
      );
      const nextVoted = new Set(votedIds).add(item.id);
      setVotedIds(nextVoted);
      persistVotedIds(nextVoted);
      try {
        const updated = await voteFeedbackFn({ data: { id: item.id } });
        if (updated) {
          setItems((prev) =>
            prev.map((it) => (it.id === updated.id ? updated : it)),
          );
        }
      } catch (err) {
        console.error("Vote failed", err);
        // Roll back the optimistic increment so the count stays honest.
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id
              ? { ...it, votes: Math.max(0, it.votes - 1) }
              : it,
          ),
        );
        const rolledBack = new Set(votedIds);
        rolledBack.delete(item.id);
        setVotedIds(rolledBack);
        persistVotedIds(rolledBack);
        toast.error("Could not record your vote. Please try again.");
      }
    },
    [votedIds],
  );

  // Top-voted first (server already orders this way; keep it stable client-side).
  const ordered = [...items].sort(
    (a, b) => b.votes - a.votes,
  );

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(94vw,40rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface text-fg shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <Dialog.Title className="text-sm font-medium tracking-[0.08em]">
                Feedback Board
              </Dialog.Title>
              <Dialog.Description className="text-2xs text-faint">
                Vote on what the community wants next. Top ideas rise to the top.
              </Dialog.Description>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Refresh"
                disabled={loading}
                onClick={() => void load()}
              >
                <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              <Dialog.Close asChild>
                <Button variant="ghost" size="icon" aria-label="Close">
                  <X className="size-4" />
                </Button>
              </Dialog.Close>
            </div>
          </div>

          <div className="lab-scroll flex flex-col gap-2 overflow-y-auto px-4 py-4">
            {loaded && ordered.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
                <p className="text-sm text-fg">No feedback yet</p>
                <p className="text-2xs text-faint">
                  Be the first — submit a bug, feature, or idea from the Feedback
                  button.
                </p>
              </div>
            ) : !loaded && loading ? (
              <div className="flex items-center justify-center py-16 text-2xs text-faint">
                Loading…
              </div>
            ) : (
              ordered.map((item) => {
                const hasVoted = votedIds.has(item.id);
                return (
                  <div
                    key={item.id}
                    className="flex items-start gap-3 rounded-md border border-border bg-elevated/40 px-3 py-3"
                  >
                    <button
                      type="button"
                      aria-label={hasVoted ? "Already voted" : "Upvote"}
                      disabled={hasVoted}
                      onClick={() => void onVote(item)}
                      className={`flex shrink-0 flex-col items-center justify-center rounded-md border px-2 py-1 transition-colors ${
                        hasVoted
                          ? "cursor-default border-border text-faint"
                          : "border-border text-fg hover:bg-elevated"
                      }`}
                    >
                      <ArrowBigUp
                        className={`size-4 ${hasVoted ? "fill-current" : ""}`}
                      />
                      <span className="font-mono text-xs tabular-nums">
                        {item.votes}
                      </span>
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-2xs uppercase tracking-[0.1em] text-faint">
                          {TYPE_LABELS[item.type]}
                        </span>
                        <span className="truncate text-sm font-medium text-fg">
                          {item.title}
                        </span>
                        <StatusBadge status={item.status} />
                      </div>
                      {item.category && (
                        <p className="mt-0.5 text-2xs text-faint">
                          {item.category}
                        </p>
                      )}
                      <p className="mt-1 whitespace-pre-wrap text-xs text-muted">
                        {item.description}
                      </p>
                      <p className="mt-1 text-2xs text-faint">
                        {formatCreatedAt(item.created_at)}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
