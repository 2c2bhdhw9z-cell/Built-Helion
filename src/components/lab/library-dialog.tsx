import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Heart, Play, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { currentCreationConfig, useLab } from "@/store/lab-store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import {
  listFeaturedFn,
  listLibraryAuthFn,
  listLibraryFn,
  toggleLikeFn,
} from "@/lib/creations/functions";
import {
  normalizeCreationConfig,
  type LibraryItem,
} from "@/lib/creations/types";
import {
  createTeamFn,
  deleteTeamSceneFn,
  dissolveTeamFn,
  joinTeamFn,
  kickMemberFn,
  leaveTeamFn,
  listMyTeamsFn,
  listTeamLibraryFn,
  listTeamMembersFn,
  setMemberRoleFn,
  shareToTeamFn,
} from "@/lib/teams/functions";
import type { TeamMember, TeamRow } from "@/lib/teams/types";
import { Chip } from "./controls";

type Sort = "recent" | "featured" | "curated";
type Tab = "community" | "team";

export function LibraryDialog() {
  const open = useLab((s) => s.libraryOpen);
  const setOpen = useLab((s) => s.setLibraryOpen);
  const applyCreationConfig = useLab((s) => s.applyCreationConfig);
  const { user, isPending } = useCurrentUserState();
  const signedIn = Boolean(user);
  const selfId = user?.id ?? "";

  const [tab, setTab] = useState<Tab>("community");
  const [sort, setSort] = useState<Sort>("recent");
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [teamItems, setTeamItems] = useState<LibraryItem[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teamName, setTeamName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [shareName, setShareName] = useState("Team scene");

  useEffect(() => {
    if (!open || isPending || tab !== "community") return;
    let cancelled = false;
    setLoading(true);
    // The editorial curated row (Req 13) is a distinct public surface fed by
    // `listFeaturedFn` (featured AND public) — not the most-liked "featured"
    // sort of the community feed. It needs no auth, so both signed-in and
    // signed-out viewers read it the same way. The recent/featured rows keep
    // using the library functions (auth variant for accurate heart state).
    const load =
      sort === "curated"
        ? listFeaturedFn()
        : signedIn
          ? listLibraryAuthFn({ data: { sort } })
          : listLibraryFn({ data: { sort } });
    void load
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, sort, signedIn, isPending, tab]);

  useEffect(() => {
    if (!open || !signedIn || isPending || tab !== "team") return;
    let cancelled = false;
    void listMyTeamsFn()
      .then((rows) => {
        if (cancelled) return;
        setTeams(rows);
        setTeamId((cur) => cur ?? rows[0]?.id ?? null);
      })
      .catch(() => {
        if (!cancelled) setTeams([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, signedIn, isPending, tab]);

  useEffect(() => {
    if (!open || !signedIn || !teamId || tab !== "team") return;
    let cancelled = false;
    void Promise.all([
      listTeamLibraryFn({ data: { teamId } }),
      listTeamMembersFn({ data: { teamId } }),
    ])
      .then(([rows, people]) => {
        if (cancelled) return;
        setTeamItems(rows);
        setMembers(people);
      })
      .catch(() => {
        if (cancelled) return;
        setTeamItems([]);
        setMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, signedIn, teamId, tab]);

  const refreshTeam = async (id: string) => {
    const [rows, people, mine] = await Promise.all([
      listTeamLibraryFn({ data: { teamId: id } }),
      listTeamMembersFn({ data: { teamId: id } }),
      listMyTeamsFn(),
    ]);
    setTeamItems(rows);
    setMembers(people);
    setTeams(mine);
  };

  const onLoad = (item: LibraryItem) => {
    const config = normalizeCreationConfig(item.config);
    if (!config) {
      toast.error("That creation could not be loaded");
      return;
    }
    applyCreationConfig(config);
    setOpen(false);
    toast.success(`Loaded “${item.name}”`);
  };

  const onLike = async (item: LibraryItem) => {
    if (!signedIn) {
      toast.message("Sign in to like a creation");
      return;
    }
    try {
      const next = await toggleLikeFn({ data: { id: item.id } });
      setItems((prev) =>
        prev.map((row) =>
          row.id === item.id ? { ...row, liked: next.liked, likeCount: next.likeCount } : row,
        ),
      );
    } catch {
      toast.error("Could not update like");
    }
  };

  const createTeam = async () => {
    try {
      const row = await createTeamFn({ data: { name: teamName } });
      setTeams((prev) => [row, ...prev]);
      setTeamId(row.id);
      setTeamName("");
      setMembers([{ userId: selfId, name: user?.displayName?.trim() || "No name", role: "owner", joinedAt: row.createdAt }]);
      setTeamItems([]);
      toast.success(`Team “${row.name}” · join ${row.joinCode}`);
    } catch {
      toast.error("Could not create team");
    }
  };

  const joinTeam = async () => {
    try {
      const row = await joinTeamFn({ data: { code: joinCode } });
      if (!row) {
        toast.error("No team with that code");
        return;
      }
      setTeams((prev) => (prev.some((t) => t.id === row.id) ? prev : [row, ...prev]));
      setTeamId(row.id);
      setJoinCode("");
      toast.success(`Joined “${row.name}”`);
      await refreshTeam(row.id);
    } catch {
      toast.error("Could not join");
    }
  };

  const shareCurrent = async () => {
    if (!teamId) {
      toast.error("Pick a team first");
      return;
    }
    try {
      const ok = await shareToTeamFn({
        data: {
          teamId,
          name: shareName.trim() || "Team scene",
          config: currentCreationConfig(useLab.getState()),
        },
      });
      if (!ok.ok) {
        toast.error("Could not share to this team");
        return;
      }
      await refreshTeam(teamId);
      toast.success("Shared to team");
    } catch {
      toast.error("Could not share to this team");
    }
  };

  const activeTeam = teams.find((t) => t.id === teamId) ?? null;
  const isOwner = activeTeam?.role === "owner";
  const canEdit = activeTeam?.role === "owner" || activeTeam?.role === "edit";

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface text-fg shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <Dialog.Title className="text-sm font-medium tracking-[0.08em]">
                Library
              </Dialog.Title>
              <Dialog.Description className="text-2xs text-faint">
                Public creations, plus a team shelf if you’re signed in.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="flex items-center gap-1.5 border-b border-border px-4 py-2">
            <Chip active={tab === "community"} onClick={() => setTab("community")}>
              Community
            </Chip>
            <Chip
              active={tab === "team"}
              onClick={() => setTab("team")}
              data-testid="library-tab-team"
            >
              Team
            </Chip>
            {tab === "community" ? (
              <>
                <Chip active={sort === "recent"} onClick={() => setSort("recent")}>
                  Recent
                </Chip>
                <Chip active={sort === "featured"} onClick={() => setSort("featured")}>
                  Featured
                </Chip>
                <Chip
                  active={sort === "curated"}
                  onClick={() => setSort("curated")}
                  data-testid="library-sort-curated"
                >
                  Curated
                </Chip>
              </>
            ) : null}
          </div>
          <div className="lab-scroll flex flex-col gap-2 overflow-y-auto px-4 py-4">
            {tab === "team" ? (
              !signedIn ? (
                <div className="flex flex-col items-center gap-1 rounded-md border border-dashed border-border py-12 text-center">
                  <p className="text-sm text-fg">Sign in for a team shelf</p>
                  <p className="text-2xs text-faint">Create a workspace, share a join code, load each other’s scenes.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <div className="flex gap-2">
                    <input
                      value={teamName}
                      onChange={(e) => setTeamName(e.target.value.slice(0, 80))}
                      placeholder="New team"
                      aria-label="Team name"
                      data-testid="team-name"
                      className="h-10 min-w-0 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg"
                    />
                    <Button variant="default" className="h-10" data-testid="team-create" onClick={() => void createTeam()}>
                      Create
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="JOIN CODE"
                      aria-label="Team join code"
                      data-testid="team-join-code"
                      className="h-10 min-w-0 flex-1 rounded-md border border-border bg-bg px-3 font-mono text-sm tracking-[0.14em] text-fg"
                    />
                    <Button variant="outline" className="h-10" data-testid="team-join" onClick={() => void joinTeam()}>
                      Join
                    </Button>
                  </div>
                  {teams.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {teams.map((t) => (
                        <Chip key={t.id} active={t.id === teamId} onClick={() => setTeamId(t.id)}>
                          {t.name}
                        </Chip>
                      ))}
                    </div>
                  ) : (
                    <p className="text-2xs text-faint">No teams yet.</p>
                  )}
                  {activeTeam ? (
                    <p className="font-mono text-2xs tracking-[0.14em] text-muted">
                      Join code {activeTeam.joinCode}
                    </p>
                  ) : null}
                  {activeTeam ? (
                    <div className="flex flex-col gap-1.5">
                      <h3 className="text-2xs uppercase tracking-[0.12em] text-faint">Members</h3>
                      {members.length === 0 ? (
                        <p className="text-2xs text-faint">No members returned.</p>
                      ) : (
                        <ul className="flex flex-col gap-1">
                          {members.map((m) => (
                            <li
                              key={m.userId}
                              className="flex items-center gap-2 rounded-sm bg-elevated/30 px-2 py-1.5 text-xs"
                            >
                              <span className="min-w-0 flex-1 truncate text-fg">{m.name}</span>
                              <span className="font-mono text-2xs text-faint">{m.role}</span>
                              {isOwner && m.role !== "owner" ? (
                                <>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-1.5 text-2xs"
                                    onClick={() => {
                                      const next = m.role === "edit" ? "view" : "edit";
                                      void setMemberRoleFn({
                                        data: { teamId: activeTeam.id, userId: m.userId, role: next },
                                      }).then((r) => {
                                        if (r.ok) {
                                          setMembers((prev) =>
                                            prev.map((row) =>
                                              row.userId === m.userId ? { ...row, role: next } : row,
                                            ),
                                          );
                                        }
                                      });
                                    }}
                                  >
                                    {m.role === "edit" ? "Make view" : "Make edit"}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-1.5 text-2xs"
                                    onClick={() => {
                                      void kickMemberFn({
                                        data: { teamId: activeTeam.id, userId: m.userId },
                                      }).then((r) => {
                                        if (r.ok) setMembers((prev) => prev.filter((row) => row.userId !== m.userId));
                                      });
                                    }}
                                  >
                                    Kick
                                  </Button>
                                </>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex gap-2">
                        {isOwner ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => {
                              void dissolveTeamFn({ data: { teamId: activeTeam.id } }).then((r) => {
                                if (!r.ok) {
                                  toast.error("Could not dissolve");
                                  return;
                                }
                                setTeams((prev) => prev.filter((t) => t.id !== activeTeam.id));
                                setTeamId(null);
                                setMembers([]);
                                setTeamItems([]);
                                toast.success("Team dissolved — scenes stay on their authors");
                              });
                            }}
                          >
                            Dissolve
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8"
                            onClick={() => {
                              void leaveTeamFn({ data: { teamId: activeTeam.id } }).then((r) => {
                                if (!r.ok) {
                                  toast.error("Owner has to dissolve the team");
                                  return;
                                }
                                setTeams((prev) => prev.filter((t) => t.id !== activeTeam.id));
                                setTeamId(null);
                                setMembers([]);
                                setTeamItems([]);
                                toast.success("Left team");
                              });
                            }}
                          >
                            Leave
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : null}
                  {activeTeam && canEdit ? (
                    <div className="flex gap-2">
                      <input
                        value={shareName}
                        onChange={(e) => setShareName(e.target.value.slice(0, 120))}
                        placeholder="Scene name"
                        aria-label="Share name"
                        className="h-10 min-w-0 flex-1 rounded-md border border-border bg-bg px-3 text-sm text-fg"
                      />
                      <Button
                        variant="outline"
                        className="h-10"
                        data-testid="team-share"
                        onClick={() => void shareCurrent()}
                      >
                        Share current
                      </Button>
                    </div>
                  ) : null}
                  {teamItems.length === 0 ? (
                    <p className="py-6 text-center text-2xs text-faint">Nothing on this shelf yet.</p>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {teamItems.map((item) => (
                        <li
                          key={item.id}
                          className="flex items-center gap-2 rounded-md border border-border bg-elevated/40 px-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-fg" title={item.name}>
                              {item.name}
                            </p>
                            <p className="truncate text-2xs text-faint">{item.author}</p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 shrink-0 px-2"
                            aria-label={`Load ${item.name}`}
                            onClick={() => onLoad(item)}
                          >
                            <Play className="size-3.5" />
                            Load
                          </Button>
                          {activeTeam && (isOwner || item.ownerId === selfId) ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="size-8 shrink-0"
                              aria-label={`Remove ${item.name}`}
                              onClick={() => {
                                void deleteTeamSceneFn({
                                  data: { teamId: activeTeam.id, id: item.id },
                                }).then((r) => {
                                  if (r.ok) setTeamItems((prev) => prev.filter((row) => row.id !== item.id));
                                });
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            ) : loading ? (
              <p className="py-8 text-center text-2xs text-faint">Loading…</p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-1 rounded-md border border-dashed border-border py-12 text-center">
                {sort === "curated" ? (
                  <>
                    <p className="text-sm text-fg">No curated picks yet</p>
                    <p className="text-2xs text-faint">
                      Hand-picked creations show up here once an editor features them.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-fg">Nothing published yet</p>
                    <p className="text-2xs text-faint">
                      Save a creation and toggle Publish to appear here.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 rounded-md border border-border bg-elevated/40 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-fg" title={item.name}>
                        {item.name}
                      </p>
                      <p className="truncate text-2xs text-faint">{item.author}</p>
                    </div>
                    <Button
                      variant={item.liked ? "default" : "outline"}
                      size="sm"
                      className="h-8 shrink-0 px-2"
                      aria-label={item.liked ? "Unlike" : "Like"}
                      onClick={() => void onLike(item)}
                    >
                      <Heart className={`size-3.5 ${item.liked ? "fill-current" : ""}`} />
                      <span className="tabular-nums">{item.likeCount}</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 shrink-0 px-2"
                      aria-label={`Load ${item.name}`}
                      onClick={() => onLoad(item)}
                    >
                      <Play className="size-3.5" />
                      <span className="hidden sm:inline">Load</span>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
