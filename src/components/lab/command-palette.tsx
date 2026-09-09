import { useEffect, useMemo } from "react";
import { Command } from "cmdk";
import * as Dialog from "@radix-ui/react-dialog";
import { useLab } from "@/store/lab-store";
import { buildCommands, type CommandGroup, type LabCommand } from "@/lib/commands/registry";
import { formatBinding } from "@/lib/commands/keys";

/**
 * Command palette (Item 16). Opened with Cmd/Ctrl+K (a global keydown, guarded
 * so it never fires while typing in a text field). It renders the SAME command
 * registry the canvas keydown handler dispatches from, so searching + running a
 * command here is identical to hitting its shortcut. Commands include playback,
 * view, undo/redo, generators, tools, and dialog navigation.
 *
 * cmdk provides the accessible listbox + fuzzy search; we wrap it in a Radix
 * Dialog for the portal, overlay, focus trap, and Escape-to-close.
 */

const GROUP_ORDER: CommandGroup[] = [
  "Playback",
  "View",
  "Edit",
  "Generate",
  "Tools",
  "Panels",
  "Help",
];

function isMacLike(): boolean {
  if (typeof navigator === "undefined") return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || "");
}

export function CommandPalette() {
  const open = useLab((s) => s.commandPaletteOpen);
  const setOpen = useLab((s) => s.setCommandPaletteOpen);

  // Global Cmd/Ctrl+K toggle. Preserves the same input-focus guard the canvas
  // handler uses so it never steals a keystroke while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey))) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      const typing =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        (e.target as HTMLElement | null)?.isContentEditable;
      // Cmd/Ctrl+K is dedicated to the palette even from an input (matches the
      // common editor convention), so we still toggle — but we never let the
      // browser's own Cmd+K (address bar) fire.
      e.preventDefault();
      if (typing && tag) (e.target as HTMLElement).blur?.();
      useLab.getState().setCommandPaletteOpen(!useLab.getState().commandPaletteOpen);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const commands = useMemo(
    () =>
      buildCommands({
        toggleFullscreen: () => {
          if (typeof document === "undefined") return;
          if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.();
          else void document.exitFullscreen?.();
        },
      }),
    [],
  );

  const mac = useMemo(() => isMacLike(), []);

  const grouped = useMemo(() => {
    const byGroup = new Map<CommandGroup, LabCommand[]>();
    for (const c of commands) {
      const list = byGroup.get(c.group) ?? [];
      list.push(c);
      byGroup.set(c.group, list);
    }
    return GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => ({
      group: g,
      items: byGroup.get(g)!,
    }));
  }, [commands]);

  const runCommand = (cmd: LabCommand) => {
    const s = useLab.getState();
    if (cmd.enabled && !cmd.enabled(s)) return;
    setOpen(false);
    // Defer so the dialog's focus-return + close animation settle before the
    // command mutates the store / opens another dialog.
    window.setTimeout(() => cmd.run(useLab.getState()), 0);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/55 data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content
          className="fixed left-1/2 top-[15vh] z-50 w-[min(92vw,34rem)] -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-surface text-fg shadow-xl"
          aria-label="Command palette"
        >
          <Dialog.Title className="sr-only">Command palette</Dialog.Title>
          <Dialog.Description className="sr-only">
            Search and run any command. Use arrow keys to navigate, Enter to run.
          </Dialog.Description>
          <Command
            label="Command palette"
            className="flex max-h-[60vh] flex-col"
            // cmdk's default filter already fuzzy-matches label + value; feed it
            // the keywords so "spawn" finds "Generate Galaxy" etc.
          >
            <Command.Input
              autoFocus
              placeholder="Type a command or search…"
              className="h-12 w-full border-b border-border bg-transparent px-4 text-sm text-fg outline-none placeholder:text-faint"
            />
            <Command.List className="lab-scroll min-h-0 flex-1 overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-6 text-center text-2xs text-faint">
                No matching command.
              </Command.Empty>
              {grouped.map(({ group, items }) => (
                <Command.Group
                  key={group}
                  heading={group}
                  className="px-1 py-1 text-2xs uppercase tracking-[0.12em] text-faint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1"
                >
                  {items.map((cmd) => {
                    const enabled = cmd.enabled ? cmd.enabled(useLab.getState()) : true;
                    const binding = cmd.keys?.[0];
                    return (
                      <Command.Item
                        key={cmd.id}
                        value={`${cmd.label} ${cmd.keywords ?? ""}`}
                        disabled={!enabled}
                        onSelect={() => runCommand(cmd)}
                        className="flex cursor-pointer select-none items-center justify-between gap-2 rounded-sm px-2.5 py-2 text-sm text-fg outline-none data-[selected=true]:bg-elevated data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-40"
                      >
                        <span className="truncate">{cmd.label}</span>
                        {binding ? (
                          <kbd className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-2xs text-muted">
                            {formatBinding(binding, mac)}
                          </kbd>
                        ) : null}
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ))}
            </Command.List>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
