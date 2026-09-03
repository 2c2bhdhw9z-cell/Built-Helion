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
import {
  deleteCloudVersionFn,
  listCloudVersionsFn,
  listTeamHistoryFn,
  pushCloudVersionFn,
} from "@/lib/history/cloud";
import { listMyTeamsFn } from "@/lib/teams/functions";
import type { TeamRow } from "@/lib/teams/types";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { Chip } from "./controls";

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

function VersionList({
  rows,
  onRestore,
  onDelete,
}: {
  rows: VersionEntry[];
  onRestore: (row: VersionEntry) => void;
  onDelete: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border py-10 text-center">
        <p className="text-sm text-fg">No checkpoints yet</p>
        <p className="mt-1 text-2xs text-faint">Save the look you want to come back to.</p>
      </div>
    );
  }
  return (
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
          <Button variant="outline" size="sm" className="h-8 shrink-0 px-2" onClick={() => onRestore(row)}>
            Restore
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label={`Delete ${row.name}`}
            onClick={() => onDelete(row.id)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function HistoryDialog() {
  const open = useLab((s) => s.historyOpen);
  const setOpen = useLab((s) => s.setHistoryOpen);
  const applyCreationConfig = useLab((s) => s.applyCreationConfig);
  const { user } = useCurrentUserState();
  const [name, setName] = useState("");
  const [device, setDevice] = useState<VersionEntry[]>([]);
  const [cloud, setCloud] = useState<VersionEntry[]>([]);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamRows, setTeamRows] = useState<VersionEntry[]>([]);
  const [scope, setScope] = useState<"account" | "device" | "team">("device");

  const refreshDevice = () => setDevice(listVersions());

  useEffect(() => {
    if (!open) return;
    refreshDevice();
    if (user) setScope("account");
    else setScope("device");
    if (open && user) {
      void listCloudVersionsFn()
        .then((list) =>
          setCloud(list.map((r) => ({ id: r.id, at: r.at, name: r.name, config: r.config }))),
        )
        .catch(() => setCloud([]));
      void listMyTeamsFn()
        .then((rows) => {
          setTeams(rows);
          setTeamId((cur) => cur ?? rows[0]?.id ?? null);
        })
        .catch(() => setTeams([]));
    }
  }, [open, user]);

  useEffect(() => {
    if (!open || !user || !teamId || scope !== "team") return;
    void listTeamHistoryFn({ data: { teamId } })
      .then((list) =>
        setTeamRows(list.map((r) => ({ id: r.id, at: r.at, name: r.name, config: r.config }))),
      )
      .catch(() => setTeamRows([]));
  }, [open, user, teamId, scope]);

  const save = () => {
    const config = currentCreationConfig(useLab.getState());
    const entry = pushVersion(name, config);
    setName("");
    refreshDevice();
    toast.success(`Saved “${entry.name}”`);
    void import("@/lib/play/progress").then(({ noteChallenge }) => noteChallenge("checkpoint"));
    if (user) {
      void pushCloudVersionFn({
        data: { name: entry.name, config, ...(scope === "team" && teamId ? { teamId } : {}) },
      })
        .then((row) => {
          const mapped = { id: row.id, at: row.at, name: row.name, config: row.config };
          if (scope === "team") setTeamRows((prev) => [mapped, ...prev]);
          else setCloud((prev) => [mapped, ...prev]);
        })
        .catch(() => toast.error("Could not sync to the account"));
    }
  };

  const restore = (row: VersionEntry) => {
    applyCreationConfig(row.config);
    setOpen(false);
    toast.success(`Restored “${row.name}”`);
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
                {user
                  ? "Account checkpoints, this-device cache, team timeline if you have a team."
                  : "Named checkpoints on this device (last 40). Sign in to keep them on the account."}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="flex flex-col gap-3 px-4 py-3">
            {user ? (
              <div className="flex flex-wrap gap-1.5">
                <Chip active={scope === "account"} onClick={() => setScope("account")}>
                  Account
                </Chip>
                <Chip active={scope === "device"} onClick={() => setScope("device")}>
                  This device
                </Chip>
                {teams.length > 0 ? (
                  <Chip active={scope === "team"} onClick={() => setScope("team")}>
                    Team
                  </Chip>
                ) : null}
              </div>
            ) : null}
            {scope === "team" && teams.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {teams.map((t) => (
                  <Chip key={t.id} active={t.id === teamId} onClick={() => setTeamId(t.id)}>
                    {t.name}
                  </Chip>
                ))}
              </div>
            ) : null}
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
            {scope === "account" ? (
              <VersionList
                rows={cloud}
                onRestore={restore}
                onDelete={(id) => {
                  void deleteCloudVersionFn({ data: { id } }).then(() =>
                    setCloud((prev) => prev.filter((r) => r.id !== id)),
                  );
                }}
              />
            ) : scope === "team" ? (
              <VersionList
                rows={teamRows}
                onRestore={restore}
                onDelete={(id) => {
                  void deleteCloudVersionFn({ data: { id } }).then(() =>
                    setTeamRows((prev) => prev.filter((r) => r.id !== id)),
                  );
                }}
              />
            ) : (
              <VersionList
                rows={device}
                onRestore={restore}
                onDelete={(id) => {
                  removeVersion(id);
                  refreshDevice();
                }}
              />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
