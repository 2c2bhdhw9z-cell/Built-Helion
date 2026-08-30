import {
  Gauge,
  ListChecks,
  LogIn,
  MessageSquare,
  Pause,
  Play,
  RotateCcw,
  Settings,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useLab, type SpeedMul } from "@/store/lab-store";
import { Button } from "@/components/ui/button";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Chip } from "./controls";

/**
 * Optional account affordance on the right of the HUD. Signed in -> the identity
 * chip + sign-out (UserButton); signed out -> a compact "Sign in" link to
 * /login. Gated on `isPending` so a signed-in visitor never flashes "Sign in" on
 * hard reload. This is purely optional — it never blocks or overlays the sim.
 */
function AccountControl() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) return null;
  if (user) return <UserButton />;
  return (
    <Link
      to="/login"
      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-fg shadow-[0_0_0_1px_var(--color-border)] transition-colors hover:bg-elevated"
      aria-label="Sign in"
    >
      <LogIn className="size-3.5" />
      <span className="hidden sm:inline">Sign in</span>
    </Link>
  );
}

const SPEEDS: SpeedMul[] = [0.25, 0.5, 1, 2, 4];

export function Hud() {
  const paused = useLab((s) => s.paused);
  const speed = useLab((s) => s.speed);
  const setPaused = useLab((s) => s.setPaused);
  const setSpeed = useLab((s) => s.setSpeed);
  const clearSim = useLab((s) => s.clearSim);
  const setFeedbackOpen = useLab((s) => s.setFeedbackOpen);
  const setBoardOpen = useLab((s) => s.setBoardOpen);
  const setPerfHubOpen = useLab((s) => s.setPerfHubOpen);

  return (
    <header className="relative z-20 shrink-0 border-b border-border bg-surface/80 px-3 py-2 backdrop-blur-md md:px-4">
      <div className="flex items-center gap-2">
        <div className="flex shrink-0 items-baseline gap-2 pr-1">
          <span className="text-sm font-medium tracking-[0.18em] text-fg">HELION</span>
          <span className="hidden text-2xs uppercase tracking-[0.16em] text-faint lg:inline">
            Particle Lab
          </span>
        </div>

        <div className="min-w-0 flex-1" />

        {/*
          Two groups share the right side of the row. The scroll group holds the
          speed chips and the sim/secondary actions; on a narrow phone it can
          shrink and scroll horizontally instead of pushing the row wider than
          the screen. The pinned group (Settings + account) stays `shrink-0`
          OUTSIDE the scroll region so the profile/account button is always
          visible and tappable. The bug that shipped with the Performance button
          was that the account control lived at the end of a single overflowing
          row and got clipped off the right edge on a phone. On a wide viewport the
          spacer above absorbs the slack and everything fits, so there is no
          scrollbar and the header still reads as one right-aligned inline row.
        */}
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {SPEEDS.map((s) => (
            <Chip
              key={s}
              active={speed === s}
              onClick={() => setSpeed(s)}
              className={s === 0.25 || s === 4 ? "hidden sm:inline-flex" : undefined}
            >
              {s === 1 ? "1×" : `${s}×`}
            </Chip>
          ))}
          <Button
            variant={paused ? "default" : "outline"}
            size="icon"
            className="shrink-0"
            aria-label={paused ? "Resume" : "Pause"}
            onClick={() => setPaused(!paused)}
          >
            {paused ? <Play className="size-3.5 translate-x-px" /> : <Pause className="size-3.5" />}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 px-2.5"
            aria-label="Clear"
            onClick={clearSim}
          >
            <RotateCcw className="size-3.5" />
            <span className="hidden sm:inline">Clear</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label="Performance"
            title="Performance hub"
            onClick={() => setPerfHubOpen(true)}
          >
            <Gauge className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 px-2.5"
            aria-label="Feedback"
            onClick={() => setFeedbackOpen(true)}
          >
            <MessageSquare className="size-3.5" />
            <span className="hidden sm:inline">Feedback</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 shrink-0 px-2.5"
            aria-label="Feedback board"
            onClick={() => setBoardOpen(true)}
          >
            <ListChecks className="size-3.5" />
            <span className="hidden sm:inline">Board</span>
          </Button>
        </div>

        <div className="ml-1 flex shrink-0 items-center gap-1 border-l border-border pl-1">
          <Link
            to="/settings"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-fg shadow-[0_0_0_1px_var(--color-border)] transition-colors hover:bg-elevated"
            aria-label="Settings"
          >
            <Settings className="size-3.5" />
          </Link>
          <AccountControl />
        </div>
      </div>
    </header>
  );
}
