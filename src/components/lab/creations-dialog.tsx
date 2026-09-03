import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Link } from "@tanstack/react-router";
import { Globe, GlobeLock, LogIn, Play, Share2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLab } from "@/store/lab-store";
import { useCreations } from "@/lib/creations/use-creations";
import { normalizeCreationConfig, type CreationRow } from "@/lib/creations/types";

/**
 * Save / manage your creations. Radix Dialog + sonner toast + a store open flag,
 * modeled on feedback-dialog.tsx.
 *
 *   - Save: a name input snapshots the current sim (currentCreationConfig via
 *     the save hook) and persists it. Requires sign-in — signed out shows a
 *     short prompt with a Link to /login and never blocks the sim.
 *   - List: the signed-in user's own creations, each with Load (apply + close),
 *     Copy link (`${origin}/s/${id}` -> clipboard), and Delete (confirm via
 *     radix AlertDialog). Empty state is a genuinely empty query — no mock rows.
 */

const fieldClass =
  "w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-fg placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "text-2xs uppercase tracking-[0.12em] text-faint";

function CreationRowItem({
  row,
  onLoad,
  onCopy,
  onDelete,
  onPublish,
}: {
  row: CreationRow;
  onLoad: (row: CreationRow) => void;
  onCopy: (id: string) => void;
  onDelete: (id: string) => void;
  onPublish: (id: string, next: boolean) => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-md border border-border bg-elevated/40 px-3 py-2">
      <span className="min-w-0 flex-1 truncate text-sm text-fg" title={row.name}>
        {row.name}
      </span>
      <Button
        variant={row.is_public ? "default" : "outline"}
        size="sm"
        className="h-8 shrink-0 px-2"
        aria-label={row.is_public ? `Unpublish ${row.name}` : `Publish ${row.name}`}
        title={row.is_public ? "Public in the library" : "Publish to the library"}
        onClick={() => onPublish(row.id, !row.is_public)}
      >
        {row.is_public ? <Globe className="size-3.5" /> : <GlobeLock className="size-3.5" />}
        <span className="hidden sm:inline">{row.is_public ? "Public" : "Publish"}</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 shrink-0 px-2"
        aria-label={`Load ${row.name}`}
        onClick={() => onLoad(row)}
      >
        <Play className="size-3.5" />
        <span className="hidden sm:inline">Load</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="h-8 shrink-0 px-2"
        aria-label={`Copy share link for ${row.name}`}
        onClick={() => onCopy(row.id)}
      >
        <Share2 className="size-3.5" />
        <span className="hidden sm:inline">Copy link</span>
      </Button>
      <AlertDialog.Root>
        <AlertDialog.Trigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted hover:text-danger"
            aria-label={`Delete ${row.name}`}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </AlertDialog.Trigger>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" />
          <AlertDialog.Content className="fixed left-1/2 top-1/2 z-[60] w-[min(92vw,24rem)] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-surface p-4 text-fg shadow-xl">
            <AlertDialog.Title className="text-sm font-medium">
              Delete this creation?
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-1 text-2xs text-faint">
              “{row.name}” will be permanently removed. This cannot be undone.
            </AlertDialog.Description>
            <div className="mt-4 flex items-center justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button type="button" variant="ghost" size="md">
                  Cancel
                </Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button
                  type="button"
                  variant="default"
                  size="md"
                  onClick={() => onDelete(row.id)}
                >
                  Delete
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </li>
  );
}

export function CreationsDialog() {
  const open = useLab((s) => s.creationsOpen);
  const setOpen = useLab((s) => s.setCreationsOpen);
  const applyCreationConfig = useLab((s) => s.applyCreationConfig);

  const { creations, isLoading, isSignedIn, save, remove, setPublic } = useCreations();

  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  // Clear the name field each time the dialog opens so it never carries a stale
  // value between sessions.
  useEffect(() => {
    if (open) setName("");
  }, [open]);

  const onSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Give your creation a name");
      return;
    }
    setSaving(true);
    try {
      const ok = await save(trimmed);
      if (ok) {
        toast.success("Creation saved");
        setName("");
      } else {
        toast.error("Could not save. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  const onLoad = (row: CreationRow) => {
    const config = normalizeCreationConfig(row.config);
    if (!config) {
      toast.error("That creation could not be loaded");
      return;
    }
    applyCreationConfig(config);
    setOpen(false);
    toast.success(`Loaded "${row.name}"`);
  };

  const onCopy = async (id: string) => {
    const url = `${window.location.origin}/s/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Could not copy link");
    }
  };

  const onDelete = async (id: string) => {
    const ok = await remove(id);
    toast[ok ? "success" : "error"](
      ok ? "Creation deleted" : "Could not delete. Please try again.",
    );
  };

  const onPublish = async (id: string, next: boolean) => {
    const ok = await setPublic(id, next);
    toast[ok ? "success" : "error"](
      ok
        ? next
          ? "Published to the library"
          : "Unlisted from the library"
        : "Could not update visibility.",
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface text-fg shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <Dialog.Title className="text-sm font-medium tracking-[0.08em]">
                Your Creations
              </Dialog.Title>
              <Dialog.Description className="text-2xs text-faint">
                Save the current sim and share it with a public link.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="lab-scroll flex flex-col gap-4 overflow-y-auto px-4 py-4">
            {isSignedIn ? (
              <div className="flex flex-col gap-1">
                <label className={labelClass} htmlFor="creation-name">
                  Name
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="creation-name"
                    className={fieldClass}
                    placeholder="e.g. Aurora galaxy"
                    value={name}
                    maxLength={120}
                    onChange={(e) => setName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void onSave();
                    }}
                  />
                  <Button
                    type="button"
                    variant="default"
                    size="md"
                    className="shrink-0"
                    disabled={saving}
                    onClick={() => void onSave()}
                  >
                    {saving ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-border px-3 py-3">
                <p className="text-sm text-fg">Sign in to save your creations</p>
                <p className="text-2xs leading-relaxed text-faint">
                  The sim works without an account — signing in just lets you save
                  and share what you make.
                </p>
                <Link
                  to="/login"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-fg px-3 text-sm font-medium text-accent-fg hover:opacity-90"
                >
                  <LogIn className="size-3.5" />
                  Sign in
                </Link>
              </div>
            )}

            {isSignedIn && (
              <div className="flex flex-col gap-2">
                <span className={labelClass}>Saved</span>
                {isLoading ? (
                  <p className="py-6 text-center text-2xs text-faint">Loading…</p>
                ) : creations.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border py-10 text-center">
                    <p className="text-sm text-fg">No creations yet</p>
                    <p className="text-2xs text-faint">
                      Save the current sim above to see it here.
                    </p>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {creations.map((row) => (
                      <CreationRowItem
                        key={row.id}
                        row={row}
                        onLoad={onLoad}
                        onCopy={(id) => void onCopy(id)}
                        onDelete={(id) => void onDelete(id)}
                        onPublish={(id, next) => void onPublish(id, next)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
