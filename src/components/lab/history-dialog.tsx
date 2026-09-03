import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { currentCreationConfig, useLab } from "@/store/lab-store";
import {
  listVersions,
  pushVersion,
  removeVersion,
  type VersionEntry,
} from "@/lib/history/versions";
import { deleteCloudVersionFn, listCloudVersionsFn, pushCloudVersionFn } from "@/lib/history/cloud";
import { useCurrentUserState } from "@/lib/auth/use-current-user";

function formatWhen(at: number): string {
  try {
    return new Date(at).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export function HistoryDialog() {
  const open = useLab((s) => s.historyOpen);
  const setOpen = useLab((s) => s.setHistoryOpen);
  const applyCreationConfig = useLab((s) => s.applyCreationConfig);
  const { user } = useCurrentUserState();
  const [name, setName] = useState("");
  const [rows, setRows] = useState<VersionEntry[]>([]);
  const [cloud, setCloud] = useState<VersionEntry[]>([]);

  const refresh = () => setRows(listVersions());

  useEffect(() => {
    if (open) refresh();
    if (open && user) {
      void listCloudVersionsFn()
        .then((list) =>
          setCloud(list.map((r) => ({ id: r.id, at: r.at, name: r.name, config: r.config }))),
        )
        .catch(() => setCloud([]));
    }
  }, [open, user]);

  const save = () => {
    const config = currentCreationConfig(useLab.getState());
    const entry = pushVersion(name, config);
    setName("");
    refresh();
    toast.success(`Saved “${entry.name}”`);
    void import("@/lib/play/progress").then(({ noteChallenge }) => noteChallenge("checkpoint"));
    if (user) {
      void pushCloudVersionFn({ data: { name: entry.name, config } })
        .then((row) => setCloud((prev) => [{ id: row.id, at: row.at, name: row.name, config: row.config }, ...prev]))
        .catch(() => toast.error("Could not sync to the account"));
    }
  };

  const restore = (row: VersionEntry) => {
    applyCreationConfig(row.config);
    setOpen(false);
    toast.success(`Restored “${row.name}”`);
  };

  const drop = (id: string) => {
    removeVersion(id);
    refresh();
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface text-fg shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <Dialog.Title className="text-sm font-medium tracking-[0.08em]">
                History
              </Dialog.Title>
              <Dialog.Description className="text-2xs text-faint">
                Named checkpoints on this device (last 40)
                {user ? " plus a copy on your account." : ". Sign in to also keep them on the account."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="flex flex-col gap-3 px-4 py-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-2xs uppercase tracking-[0.12em] text-faint">Name</span>
              <div className="flex gap-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 80))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") save();
                  }}
                  placeholder="Tonight’s galaxy"
                  maxLength={80}
                  aria-label="Checkpoint name"
                  data-testid="history-name"
                  className="h-10 min-w-0 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg"
                />
                <Button variant="default" className="h-10 shrink-0" data-testid="history-save" onClick={save}>
                  Save
                </Button>
              </div>
            </label>
          </div>
          <div className="lab-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4">
            {rows.length === 0 ? (
              <div className="rounded-md border border-dashed border-border py-10 text-center">
                <p className="text-sm text-fg">No checkpoints yet</p>
                <p className="mt-1 text-2xs text-faint">Save the look you want to come back to.</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-elevated/40 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-fg">{row.name}</p>
                      <p className="text-2xs text-faint">{formatWhen(row.at)}</p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 px-2"
                      onClick={() => restore(row)}
                    >
                      Restore
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      aria-label={`Delete ${row.name}`}
                      onClick={() => drop(row.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {cloud.length > 0 ? (
              <>
                <p className="mt-3 text-2xs uppercase tracking-[0.12em] text-faint">On your account</p>
                <ul className="flex flex-col gap-2">
                  {cloud.map((row) => (
                    <li
                      key={`c-${row.id}`}
                      className="flex items-center gap-2 rounded-md border border-border bg-elevated/40 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-fg">{row.name}</p>
                        <p className="text-2xs text-faint">{formatWhen(row.at)}</p>
                      </div>
                      <Button variant="outline" size="sm" className="h-8 shrink-0 px-2" onClick={() => restore(row)}>
                        Restore
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        aria-label={`Delete ${row.name}`}
                        onClick={() => {
                          void deleteCloudVersionFn({ data: { id: row.id } }).then(() =>
                            setCloud((prev) => prev.filter((r) => r.id !== row.id)),
                          );
                        }}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
