import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { GitFork, Heart, Play, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLab } from "@/store/lab-store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { forkCreationFn } from "@/lib/creations/functions";
import { normalizeCreationConfig } from "@/lib/creations/types";
import type { DailyBoardEntry, DailyChallenge } from "@/lib/daily/types";

/**
 * Daily challenge (seed-of-the-day) dialog (Item 7).
 *
 * Shows today's deterministic seed and the ranked board of that day's public
 * remixes (ordered by likes). VIEWING requires no login — the challenge + board
 * come from the PUBLIC `getDailyChallengeFn` / `listDailyChallengeBoardFn`.
 * "Load seed" applies the seed config locally (no auth). "Remix this challenge"
 * forks the seed via the existing `forkCreationFn` path, which is authed (it
 * writes) — a signed-out visitor is prompted to sign in instead of being forced.
 *
 * Server functions are imported dynamically inside effects/handlers, matching
 * the SSR-safe pattern used across the app.
 */
export function DailyChallengeDialog() {
  const open = useLab((s) => s.dailyOpen);
  const setOpen = useLab((s) => s.setDailyOpen);
  const applyCreationConfig = useLab((s) => s.applyCreationConfig);
  const { user } = useCurrentUserState();
  const signedIn = Boolean(user);

  const [challenge, setChallenge] = useState<DailyChallenge | null>(null);
  const [board, setBoard] = useState<DailyBoardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const { getDailyChallengeFn, listDailyChallengeBoardFn } = await import(
          "@/lib/daily/functions"
        );
        const [today, entries] = await Promise.all([
          getDailyChallengeFn(),
          listDailyChallengeBoardFn({ data: {} }),
        ]);
        if (cancelled) return;
        setChallenge(today);
        setBoard(entries);
      } catch {
        if (!cancelled) {
          setChallenge(null);
          setBoard([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const onLoadSeed = () => {
    if (!challenge) return;
    const config = normalizeCreationConfig(challenge.config);
    if (!config) {
      toast.error("Could not load today's seed");
      return;
    }
    applyCreationConfig(config);
    setOpen(false);
    toast.success("Loaded today's challenge seed");
  };

  const onRemix = async () => {
    if (!challenge) return;
    if (!signedIn) {
      toast.message("Sign in to remix today's challenge");
      return;
    }
    try {
      const res = await forkCreationFn({ data: { sourceId: challenge.seedCreationId } });
      if (!res.ok || !res.row) {
        toast.error("Could not remix the challenge");
        return;
      }
      const config = normalizeCreationConfig(res.row.config);
      if (config) applyCreationConfig(config);
      setOpen(false);
      toast.success("Remixed today's challenge — publish it to enter the board");
    } catch {
      toast.error("Could not remix the challenge");
    }
  };

  const onLoadEntry = (entry: DailyBoardEntry) => {
    const config = normalizeCreationConfig(entry.config);
    if (!config) {
      toast.error("That entry could not be loaded");
      return;
    }
    applyCreationConfig(config);
    setOpen(false);
    toast.success(`Loaded “${entry.name}”`);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface text-fg shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <Dialog.Title className="flex items-center gap-2 text-sm font-medium tracking-[0.08em]">
                <Trophy className="size-4" />
                Daily Challenge
              </Dialog.Title>
              <Dialog.Description className="text-2xs text-faint">
                {challenge ? challenge.title : "Everyone starts from the same seed. Remix it, publish, climb the board."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="lab-scroll flex flex-col gap-3 overflow-y-auto px-4 py-4">
            {loading ? (
              <p className="py-8 text-center text-2xs text-faint">Loading…</p>
            ) : (
              <>
                <div className="flex flex-col gap-2 rounded-md border border-border bg-elevated/40 px-3 py-3">
                  <p className="text-sm text-fg">Today's seed</p>
                  <p className="text-2xs text-faint">
                    Start from the shared config — everyone gets the same one. Remix it into your
                    own creation, then publish to enter the board.
                  </p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={onLoadSeed}
                      disabled={!challenge}
                    >
                      <Play className="size-3.5" />
                      Load seed
                    </Button>
                    <Button
                      variant="default"
                      size="sm"
                      className="h-8"
                      data-testid="daily-remix"
                      onClick={() => void onRemix()}
                      disabled={!challenge}
                    >
                      <GitFork className="size-3.5" />
                      Remix this challenge
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="text-2xs uppercase tracking-[0.12em] text-faint">
                    Board · ranked by likes
                  </h3>
                  {board.length === 0 ? (
                    <p className="rounded-md border border-dashed border-border py-8 text-center text-2xs text-faint">
                      No entries yet — be the first to remix and publish today's seed.
                    </p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {board.map((entry, i) => (
                        <li
                          key={entry.id}
                          className="flex items-center gap-2 rounded-md border border-border bg-elevated/40 px-3 py-2"
                        >
                          <span className="w-6 shrink-0 text-center font-mono text-xs text-faint tabular-nums">
                            {i + 1}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-fg" title={entry.name}>
                              {entry.name}
                            </p>
                            <p className="truncate text-2xs text-faint">{entry.author}</p>
                          </div>
                          <span className="flex shrink-0 items-center gap-1 text-2xs text-muted tabular-nums">
                            <Heart className="size-3.5" />
                            {entry.likeCount}
                          </span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0 px-2"
                            aria-label={`Load ${entry.name}`}
                            onClick={() => onLoadEntry(entry)}
                          >
                            <Play className="size-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
