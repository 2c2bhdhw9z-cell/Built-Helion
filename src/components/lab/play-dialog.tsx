import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLab } from "@/store/lab-store";
import {
  BADGE_COPY,
  completeDaily,
  levelFor,
  readProgress,
  type BadgeId,
  type PlayProgress,
} from "@/lib/play/progress";
import { formatDuration, readUsage, type UsageStats } from "@/lib/play/analytics";
import { listLibraryFn } from "@/lib/creations/functions";

export function PlayDialog() {
  const open = useLab((s) => s.playOpen);
  const setOpen = useLab((s) => s.setPlayOpen);
  const [progress, setProgress] = useState<PlayProgress>(() => readProgress());
  const [usage, setUsage] = useState<UsageStats>(() => readUsage());
  const [board, setBoard] = useState<{ name: string; likes: number }[]>([]);

  useEffect(() => {
    if (!open) return;
    setProgress(readProgress());
    setUsage(readUsage());
    void listLibraryFn({ data: { sort: "featured" } })
      .then((items) =>
        setBoard(
          items.slice(0, 8).map((it) => ({
            name: it.name,
            likes: it.likeCount ?? 0,
          })),
        ),
      )
      .catch(() => setBoard([]));
  }, [open]);

  const finishDaily = () => {
    const next = completeDaily();
    setProgress(next);
    toast.success("Daily logged");
  };

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
              <Button variant={progress.challengeDone ? "outline" : "default"} disabled={progress.challengeDone} onClick={finishDaily}>
                {progress.challengeDone ? "Done for today" : "Mark done"}
              </Button>
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
              <p className="text-2xs text-faint">Peak {usage.peak.toLocaleString()} live particles. Stays on this browser.</p>
            </section>
            <section className="flex flex-col gap-2">
              <h3 className="text-2xs uppercase tracking-[0.12em] text-faint">Most liked</h3>
              {board.length === 0 ? (
                <p className="text-2xs text-faint">Library is empty — publish something.</p>
              ) : (
                <ol className="flex flex-col gap-1 text-xs">
                  {board.map((row, i) => (
                    <li key={`${row.name}-${i}`} className="flex justify-between gap-2">
                      <span className="truncate text-fg">
                        {i + 1}. {row.name}
                      </span>
                      <span className="font-mono text-faint">{row.likes}</span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
