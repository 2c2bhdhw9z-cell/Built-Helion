import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Copy, Link2, Mic, MicOff, Radio, Users, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSession, type SessionRole } from "@/lib/multiplayer/session-store";
import {
  MAX_SESSION_PEERS,
  ensureGuestName,
  normalizeRoomCode,
  randomRoomCode,
  sessionUrl,
  writeGuestName,
  writeSessionQuery,
} from "@/lib/multiplayer/protocol";

function copyText(text: string, ok: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast.success(ok),
    () => toast.error("Could not copy"),
  );
}

export function SessionDialog() {
  const open = useSession((s) => s.open);
  const setOpen = useSession((s) => s.setOpen);
  const code = useSession((s) => s.code);
  const isHost = useSession((s) => s.isHost);
  const role = useSession((s) => s.role);
  const joined = useSession((s) => s.joined);
  const peers = useSession((s) => s.peers);
  const chat = useSession((s) => s.chat);
  const wire = useSession((s) => s.wire);
  const selfId = useSession((s) => s.selfId);
  const micOn = useSession((s) => s.micOn);
  const setMicOn = useSession((s) => s.setMicOn);
  const [joinCode, setJoinCode] = useState("");
  const [draft, setDraft] = useState("");
  const [guestName, setGuestName] = useState(() => ensureGuestName());

  const inSession = Boolean(code);
  const count = (code ? 1 : 0) + peers.length;

  const commitName = (raw = guestName) => {
    const next = writeGuestName(raw) || ensureGuestName();
    setGuestName(next);
    useSession.getState().setMeta({ selfName: next });
    return next;
  };

  const create = () => {
    commitName();
    const next = randomRoomCode();
    writeSessionQuery(next);
    useSession.getState().enter(next, true);
    copyText(sessionUrl(next), "Session link copied");
  };

  const join = () => {
    const next = normalizeRoomCode(joinCode);
    if (next.length < 4) {
      toast.error("Need a 6-character session code");
      return;
    }
    commitName();
    writeSessionQuery(next);
    useSession.getState().enter(next, false);
  };

  const leave = () => {
    writeSessionQuery(null);
    useSession.getState().leave();
  };

  const sendChat = () => {
    const text = draft.trim().slice(0, 280);
    if (!text || !wire) return;
    const at = Date.now();
    wire.send({ t: "chat", text, name: wire.name, at });
    useSession.getState().pushChat({
      id: `${wire.selfId}-${at}`,
      from: wire.selfId,
      name: wire.name,
      text,
      at,
    });
    setDraft("");
  };

  const setRole = (peerId: string, next: SessionRole) => {
    if ((!isHost && role !== "admin") || !wire) return;
    if (next === "admin" && !isHost) return;
    wire.send({ t: "role", peerId, role: next });
    useSession.getState().setMeta({
      peers: useSession.getState().peers.map((p) => (p.id === peerId ? { ...p, role: next } : p)),
    });
  };

  const kick = (peerId: string) => {
    if (!isHost || !wire) return;
    wire.send({ t: "kick", peerId });
    useSession.getState().dropPeer(peerId);
  };

  const cycleRole = (current: SessionRole): SessionRole => {
    if (current === "view") return "edit";
    if (current === "edit") return isHost ? "admin" : "view";
    return "view";
  };

  const roleLabel = (r: SessionRole) =>
    r === "view" ? "view → edit" : r === "edit" ? (isHost ? "edit → admin" : "edit → view") : "admin → view";

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(94vw,26rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface text-fg shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <Dialog.Title className="text-sm font-medium tracking-[0.08em]">Session</Dialog.Title>
              <Dialog.Description className="text-2xs text-faint">
                Shared canvas. Up to {MAX_SESSION_PEERS}. Direct peer link — co-op, not a server sim.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>

          <div className="lab-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-2xs uppercase tracking-[0.12em] text-faint">Name</span>
              <input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value.slice(0, 32))}
                onBlur={() => commitName()}
                placeholder="Your name"
                maxLength={32}
                aria-label="Session name"
                data-testid="session-name"
                className="h-10 rounded-md border border-border bg-bg px-3 text-sm text-fg"
              />
            </label>
            {!inSession ? (
              <>
                <Button variant="default" className="h-10 w-full" data-testid="session-start" onClick={create}>
                  <Radio className="size-3.5" />
                  Start a session
                </Button>
                <div className="flex gap-2">
                  <input
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") join();
                    }}
                    placeholder="CODE"
                    maxLength={8}
                    aria-label="Session code"
                    className="h-10 min-w-0 flex-1 rounded-md border border-border bg-bg px-3 font-mono text-sm tracking-[0.18em] text-fg"
                  />
                  <Button variant="outline" className="h-10" data-testid="session-join" onClick={join}>
                    Join
                  </Button>
                </div>
                <p className="text-2xs leading-relaxed text-faint">
                  Anyone with the link can join. Each browser runs its own physics — Attract still
                  moves the same cloud on every screen.
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-elevated/40 px-3 py-2">
                  <div>
                    <div className="font-mono text-sm tracking-[0.18em]" data-testid="session-code">
                      {code}
                    </div>
                    <div className="text-2xs text-faint">
                      {joined ? `${count} in room` : "Connecting…"}
                      {role === "view" ? " · view only" : null}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant={micOn ? "default" : "outline"}
                      size="icon"
                      aria-label={micOn ? "Mute microphone" : "Share microphone"}
                      title={micOn ? "Mute" : "Voice"}
                      data-testid="session-mic"
                      onClick={() => setMicOn(!micOn)}
                    >
                      {micOn ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Copy code"
                      onClick={() => code && copyText(code, "Code copied")}
                    >
                      <Copy className="size-3.5" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      aria-label="Copy link"
                      onClick={() => code && copyText(sessionUrl(code), "Link copied")}
                    >
                      <Link2 className="size-3.5" />
                    </Button>
                  </div>
                </div>

                <ul className="flex flex-col gap-1.5">
                  <li className="flex items-center justify-between rounded-sm bg-elevated/30 px-2 py-1.5 text-xs">
                    <span className="truncate text-fg">{guestName || "You"}</span>
                    <span className="text-2xs uppercase tracking-[0.12em] text-faint" data-testid="session-role">
                      {role ?? (isHost ? "host" : "edit")}
                    </span>
                  </li>
                  {peers.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded-sm bg-elevated/30 px-2 py-1.5 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-fg">{p.name}</div>
                        <div className="text-2xs text-faint">
                          {p.connectionState === "connected"
                            ? p.rttMs != null
                              ? `${p.rttMs}ms`
                              : "linked"
                            : p.connectionState === "failed"
                              ? "can't connect"
                              : p.connectionState}
                        </div>
                      </div>
                      {(isHost || role === "admin") && p.id !== selfId ? (
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            className="text-2xs uppercase tracking-[0.12em] text-muted hover:text-fg"
                            onClick={() => setRole(p.id, cycleRole(p.role))}
                          >
                            {roleLabel(p.role)}
                          </button>
                          {isHost ? (
                            <button
                              type="button"
                              className="text-2xs uppercase tracking-[0.12em] text-muted hover:text-fg"
                              onClick={() => kick(p.id)}
                            >
                              kick
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-2xs uppercase tracking-[0.12em] text-faint">{p.role}</span>
                      )}
                    </li>
                  ))}
                </ul>

                <div className="flex min-h-32 flex-col rounded-md border border-border">
                  <div className="lab-scroll min-h-0 flex-1 space-y-1.5 overflow-y-auto px-2.5 py-2">
                    {chat.length === 0 ? (
                      <p className="text-2xs text-faint">Chat stays in this session.</p>
                    ) : (
                      chat.map((line) => (
                        <p key={line.id} className="text-xs leading-relaxed">
                          <span className="text-muted">{line.name}</span>{" "}
                          <span className="text-fg">{line.text}</span>
                        </p>
                      ))
                    )}
                  </div>
                  <form
                    className="flex border-t border-border"
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendChat();
                    }}
                  >
                    <input
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      maxLength={280}
                      placeholder="Message"
                      aria-label="Session chat"
                      className="h-10 min-w-0 flex-1 bg-transparent px-2.5 text-sm text-fg"
                    />
                    <Button type="submit" variant="ghost" className="h-10 rounded-none px-3">
                      Send
                    </Button>
                  </form>
                </div>

                <Button variant="outline" className="w-full" onClick={leave}>
                  Leave session
                </Button>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function SessionHudButton() {
  const code = useSession((s) => s.code);
  const peers = useSession((s) => s.peers);
  const role = useSession((s) => s.role);
  const setOpen = useSession((s) => s.setOpen);
  const n = code ? 1 + peers.length : 0;
  return (
    <div className="flex shrink-0 items-center gap-1">
      {code && role === "view" ? (
        <span
          className="hidden text-2xs uppercase tracking-[0.12em] text-faint sm:inline"
          data-testid="session-view-only"
        >
          View only
        </span>
      ) : null}
      <Button
        variant={code ? "default" : "outline"}
        size="icon"
        className={cn("shrink-0", code && "relative")}
        aria-label="Session"
        title={role === "view" ? "Live session (view only)" : "Live session"}
        data-testid="open-session"
        onClick={() => setOpen(true)}
      >
        <Users className="size-3.5" />
        {n > 1 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-bg px-0.5 font-mono text-[9px] text-fg">
            {n}
          </span>
        ) : null}
      </Button>
    </div>
  );
}
