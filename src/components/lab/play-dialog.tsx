import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLab } from "@/store/lab-store";
import {
  BADGE_COPY,
  levelFor,
  readProgress,
  type BadgeId,
  type PlayProgress,
} from "@/lib/play/progress";
import { emptyUsage, formatDuration, readUsage, type UsageStats } from "@/lib/play/analytics";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getUsageFn } from "@/lib/usage/functions";
import { listLeaderboardFn } from "@/lib/leaderboard/functions";
import type { LeaderboardEntry } from "@/lib/leaderboard/types";
import { useAchievements, achievementLabel } from "@/lib/achievements/use-achievements";

export function PlayDialog() {
  const open = useLab((s) => s.playOpen);
  const setOpen = useLab((s) => s.setPlayOpen);
  const { user } = useCurrentUserState();
  const [progress, setProgress] = useState<PlayProgress>(() => readProgress());
  const [usage, setUsage] = useState<UsageStats>(() => readUsage());
  const [account, setAccount] = useState<UsageStats | null>(null);
  const [board, setBoard] = useState<LeaderboardEntry[]>([]);
  // Signed-in achievements; an empty set when signed out. Never blocks the sim.
  const { achievements } = useAchievements();

  useEffect(() => {
    if (!open) return;
    setProgress(readProgress());
    setUsage(readUsage());
    // Public global leaderboard — no auth required (Req 7.5). Best-effort: an
    // error just leaves the board empty rather than surfacing to the page.
    void listLeaderboardFn({ data: { limit: 8 } })
      .then((rows) => setBoard(rows))
      .catch(() => setBoard([]));
    if (user) {
      void getUsageFn()
        .then(setAccount)
        .catch(() => setAccount(emptyUsage()));
    } else {
      setAccount(null);
    }
  }, [open, user]);

  const badges = Object.keys(BADGE_COPY) as BadgeId[];

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(94vw,28rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface text-fg shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <Dialog.Title className="text-sm font-medium tracking-[0.08em]">Play</Dialog.Title>
              <Dialog.Description className="text-2xs text-faint">
                Level {levelFor(progress.xp)} · {progress.xp} XP
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="lab-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <section className="flex flex-col gap-2">
              <h3 className="text-2xs uppercase tracking-[0.12em] text-faint">Today</h3>
              <p className="text-sm text-fg">{progress.challenge}</p>
              <p className="text-2xs text-faint">
                {progress.challengeDone
                  ? "Done — you actually did it in the lab."
                  : "Does itself when you do the thing. No checkbox."}
              </p>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-2xs uppercase tracking-[0.12em] text-faint">Badges</h3>
              <ul className="flex flex-col gap-1.5">
                {badges.map((id) => {
                  const copy = BADGE_COPY[id];
                  const on = progress.badges.includes(id);
                  return (
                    <li
                      key={id}
                      className={`flex items-baseline justify-between gap-2 rounded-sm px-2 py-1.5 text-xs ${on ? "bg-elevated/50 text-fg" : "text-muted"}`}
                    >
                      <span>
                        {copy.label}
                        <span className="ml-2 text-2xs text-faint">{copy.hint}</span>
                      </span>
                      <span className="font-mono text-2xs">{on ? `+${copy.xp}` : ""}</span>
                    </li>
                  );
                })}
              </ul>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-2xs uppercase tracking-[0.12em] text-faint">This device</h3>
              <p className="text-xs text-fg">
                {formatDuration(usage.seconds)} in the lab · {usage.spawns} spawns · {usage.exports} exports
              </p>
              <p className="text-2xs text-faint">Peak {usage.peak.toLocaleString()} live particles.</p>
            </section>
            {account ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-2xs uppercase tracking-[0.12em] text-faint">Account</h3>
                <p className="text-xs text-fg">
                  {formatDuration(account.seconds)} · {account.spawns} spawns · {account.exports} exports
                </p>
                <p className="text-2xs text-faint">
                  Peak {account.peak.toLocaleString()} live particles. Zero until this signed-in lab has run.
                </p>
              </section>
            ) : null}
            <section className="flex flex-col gap-2">
              <h3 className="text-2xs uppercase tracking-[0.12em] text-faint">Leaderboard</h3>
              {board.length === 0 ? (
                <p className="text-2xs text-faint">
                  No ranked creators yet — publish something to get on the board.
                </p>
              ) : (
                <ol className="flex flex-col gap-1 text-xs">
                  {board.map((row) => (
                    <li key={row.userId} className="flex justify-between gap-2">
                      <span className="truncate text-fg">
                        {row.rank}. {row.displayName}
                      </span>
                      <span className="font-mono text-faint">{row.score.toLocaleString()}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
            {achievements.length > 0 ? (
              <section className="flex flex-col gap-2">
                <h3 className="text-2xs uppercase tracking-[0.12em] text-faint">Achievements</h3>
                <ul className="flex flex-col gap-1.5">
                  {achievements.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-baseline justify-between gap-2 rounded-sm bg-elevated/50 px-2 py-1.5 text-xs text-fg"
                    >
                      <span>{achievementLabel(a.id)}</span>
                      <span className="font-mono text-2xs text-faint">
                        {new Date(a.grantedAt).toLocaleDateString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
