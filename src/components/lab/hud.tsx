import {
  Camera,
  CircleHelp,
  Code2,
  Gauge,
  Bookmark,
  Image,
  Library,
  Link2,
  ListChecks,
  LogIn,
  Maximize,
  MessageSquare,
  Minimize,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Settings,
  Share2,
  Sparkles,
  Square,
  Undo2,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { toast } from "sonner";
import { useLab, currentCreationConfig, type SpeedMul } from "@/store/lab-store";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { embedSnippet, shareUrl } from "@/lib/share/codec";
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

/** Format a whole-second elapsed count as mm:ss for the recording indicator. */
function formatElapsed(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function Hud() {
  const paused = useLab((s) => s.paused);
  const speed = useLab((s) => s.speed);
  const setPaused = useLab((s) => s.setPaused);
  const setSpeed = useLab((s) => s.setSpeed);
  const clearSim = useLab((s) => s.clearSim);
  const setFeedbackOpen = useLab((s) => s.setFeedbackOpen);
  const setBoardOpen = useLab((s) => s.setBoardOpen);
  const setCreationsOpen = useLab((s) => s.setCreationsOpen);
  const setLibraryOpen = useLab((s) => s.setLibraryOpen);
  const setProfileOpen = useLab((s) => s.setProfileOpen);
  const setUpgradeOpen = useLab((s) => s.setUpgradeOpen);
  const setPerfHubOpen = useLab((s) => s.setPerfHubOpen);
  const entitled = useLab((s) => s.entitled);
  const captureScreenshot = useLab((s) => s.captureScreenshot);
  const startRecording = useLab((s) => s.startRecording);
  const stopRecording = useLab((s) => s.stopRecording);
  const recording = useLab((s) => s.recording);
  const canRecord = useLab((s) => s.canRecord);
  const startGif = useLab((s) => s.startGif);
  const stopGif = useLab((s) => s.stopGif);
  const gifRecording = useLab((s) => s.gifRecording);
  const undo = useLab((s) => s.undo);
  const redo = useLab((s) => s.redo);
  const canUndo = useLab((s) => s.canUndo);
  const canRedo = useLab((s) => s.canRedo);
  const helpOpen = useLab((s) => s.helpOpen);
  const setHelpOpen = useLab((s) => s.setHelpOpen);
  const uiTopOpen = useLab((s) => s.uiTopOpen);
  const [fullscreen, setFullscreen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedCode, setEmbedCode] = useState("");

  // Elapsed recording time (seconds), driven by an interval that runs ONLY
  // while recording is active and is torn down as soon as it stops.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!recording) {
      setElapsed(0);
      return;
    }
    setElapsed(0);
    const startedAt = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [recording]);

  useEffect(() => {
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useEffect(() => {
    if (!uiTopOpen) setEmbedOpen(false);
  }, [uiTopOpen]);

  return (
    <>
    <header className="relative z-20 shrink-0 border-b border-border bg-surface/80 px-3 py-1.5 backdrop-blur-md md:px-4 md:py-2">
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
            size="icon"
            className="shrink-0"
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            disabled={!canUndo}
            onClick={undo}
          >
            <Undo2 className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
            disabled={!canRedo}
            onClick={redo}
          >
            <Redo2 className="size-3.5" />
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
            size="sm"
            className="h-9 shrink-0 px-2.5"
            aria-label="Save creation"
            onClick={() => setCreationsOpen(true)}
          >
            <Bookmark className="size-3.5" />
            <span className="hidden sm:inline">Save</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label="Community library"
            title="Library"
            data-testid="open-library"
            onClick={() => setLibraryOpen(true)}
          >
            <Library className="size-3.5" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                aria-label="Export and share"
                title="Export & share"
              >
                <Share2 className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Still</DropdownMenuLabel>
              <DropdownMenuItem disabled={!captureScreenshot} onSelect={() => captureScreenshot?.("png")}>
                <Camera className="size-3.5" />
                PNG screenshot
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!captureScreenshot} onSelect={() => captureScreenshot?.("jpg")}>
                <Image className="size-3.5" />
                JPG screenshot
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Motion</DropdownMenuLabel>
              <DropdownMenuItem
                disabled={!startGif && !gifRecording}
                onSelect={() => (gifRecording ? stopGif?.() : startGif?.())}
              >
                <Image className="size-3.5" />
                {gifRecording ? "Stop GIF" : "Record GIF"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Share</DropdownMenuLabel>
              <DropdownMenuItem
                onSelect={async () => {
                  const url = shareUrl(currentCreationConfig(useLab.getState()));
                  try {
                    if (typeof navigator.share === "function") {
                      await navigator.share({ title: "Helion", url });
                      return;
                    }
                    await navigator.clipboard.writeText(url);
                    toast.success("Link copied");
                  } catch (err) {
                    if ((err as { name?: string }).name === "AbortError") return;
                    try {
                      await navigator.clipboard.writeText(url);
                      toast.success("Link copied");
                    } catch {
                      toast.error("Could not copy link");
                    }
                  }
                }}
              >
                <Link2 className="size-3.5" />
                Copy link
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  setEmbedCode(embedSnippet(currentCreationConfig(useLab.getState())));
                  setEmbedOpen(true);
                }}
              >
                <Code2 className="size-3.5" />
                Embed code
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {gifRecording ? (
            <Button
              variant="outline"
              size="sm"
              className="h-9 shrink-0 gap-1.5 px-2.5 text-red-500 shadow-[0_0_0_1px_var(--color-red-500,#ef4444)]"
              aria-label="Stop GIF"
              onClick={() => stopGif?.()}
            >
              <Square className="size-3.5 fill-current" />
              GIF
            </Button>
          ) : null}
          <Button
            variant="outline"
            size={recording ? "sm" : "icon"}
            className={
              recording
                ? "h-9 shrink-0 gap-1.5 px-2.5 text-red-500 shadow-[0_0_0_1px_var(--color-red-500,#ef4444)]"
                : "shrink-0"
            }
            aria-label={recording ? "Stop recording" : "Record"}
            title={recording ? "Stop recording" : "Record"}
            disabled={!canRecord || (recording ? !stopRecording : !startRecording)}
            onClick={() => (recording ? stopRecording?.() : startRecording?.())}
          >
            {recording ? <Square className="size-3.5 fill-current" /> : <Video className="size-3.5" />}
            {recording ? (
              <span className="tabular-nums text-xs font-medium">{formatElapsed(elapsed)}</span>
            ) : null}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen"}
            title="Fullscreen (F)"
            onClick={() => {
              if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.();
              else void document.exitFullscreen?.();
            }}
          >
            {fullscreen ? <Minimize className="size-3.5" /> : <Maximize className="size-3.5" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label="Keyboard shortcuts"
            title="Shortcuts (?)"
            onClick={() => setHelpOpen(!helpOpen)}
          >
            <CircleHelp className="size-3.5" />
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
            className="hidden h-9 shrink-0 px-2.5 md:inline-flex"
            aria-label="Feedback"
            onClick={() => setFeedbackOpen(true)}
          >
            <MessageSquare className="size-3.5" />
            <span className="hidden sm:inline">Feedback</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="hidden h-9 shrink-0 px-2.5 md:inline-flex"
            aria-label="Feedback board"
            onClick={() => setBoardOpen(true)}
          >
            <ListChecks className="size-3.5" />
            <span className="hidden sm:inline">Board</span>
          </Button>
        </div>

        <div className="ml-1 flex shrink-0 items-center gap-1 border-l border-border pl-1">
          <Button
            variant={entitled ? "outline" : "default"}
            size="sm"
            className="h-9 shrink-0 px-2.5"
            aria-label={entitled ? "Manage plan" : "Upgrade"}
            title={entitled ? "Manage plan" : "Upgrade"}
            data-testid="open-upgrade"
            onClick={() => setUpgradeOpen(true)}
          >
            <Sparkles className="size-3.5" />
            <span className="hidden sm:inline">{entitled ? "Pro" : "Upgrade"}</span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label="Profile"
            title="Profile"
            data-testid="open-profile"
            onClick={() => setProfileOpen(true)}
          >
            <UserRound className="size-3.5" />
          </Button>
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
    <Dialog.Root open={helpOpen} onOpenChange={setHelpOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,22rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-4 text-fg shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-2xs uppercase tracking-[0.16em] text-faint">
              Shortcuts
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="outline" size="icon" className="size-8" aria-label="Close">
                <X className="size-3.5" />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Keyboard and touch shortcuts</Dialog.Description>
          <ul className="grid grid-cols-1 gap-1.5 text-xs text-muted">
            <li><kbd className="text-fg">Space</kbd> pause</li>
            <li><kbd className="text-fg">1–5</kbd> speed</li>
            <li><kbd className="text-fg">Ctrl+Z / Shift+Z</kbd> undo / redo</li>
            <li><kbd className="text-fg">Scroll</kbd> or <kbd className="text-fg">pinch</kbd> zoom</li>
            <li><kbd className="text-fg">Alt-drag</kbd> pan · <kbd className="text-fg">0</kbd> reset view</li>
            <li><kbd className="text-fg">F</kbd> fullscreen · <kbd className="text-fg">[ ]</kbd> quality</li>
            <li>Use the chevrons to hide the menus and see the sim</li>
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    <Dialog.Root open={embedOpen} onOpenChange={setEmbedOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,24rem)] max-h-[85dvh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-border bg-surface p-4 text-fg shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="text-2xs uppercase tracking-[0.16em] text-faint">
              Embed
            </Dialog.Title>
            <Dialog.Close asChild>
              <Button variant="outline" size="icon" className="size-8" aria-label="Close">
                <X className="size-3.5" />
              </Button>
            </Dialog.Close>
          </div>
          <Dialog.Description className="mb-2 text-xs text-muted">
            Paste this iframe into a page to embed the current preset.
          </Dialog.Description>
          <textarea
            readOnly
            value={embedCode}
            className="h-20 w-full resize-none rounded-sm border border-border bg-bg p-2 font-mono text-2xs text-fg"
            onFocus={(e) => e.currentTarget.select()}
          />
          <Button
            variant="default"
            size="sm"
            className="mt-3 h-9 w-full"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(embedCode);
                toast.success("Embed code copied");
                setEmbedOpen(false);
              } catch {
                toast.error("Could not copy");
              }
            }}
          >
            Copy iframe
          </Button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
    </>
  );
}
