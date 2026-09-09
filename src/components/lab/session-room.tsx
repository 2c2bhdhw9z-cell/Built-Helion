import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useP2PRoom } from "@/lib/multiplayer/use-p2p-room";
import { useSession, type SessionRole } from "@/lib/multiplayer/session-store";
import {
  colorForId,
  isSessionMsg,
  MAX_SESSION_PEERS,
  writeSessionQuery,
  type SessionMsg,
} from "@/lib/multiplayer/protocol";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { currentCreationConfig, useLab, withRemoteApply } from "@/store/lab-store";

/**
 * Mounted only while a session code is set. Keys on the code so changing rooms
 * remounts the mesh. Syncs lab actions over the reliable channel and cursors
 * on the unreliable one. Late joiners get a snapshot from the oldest peer.
 */
export function SessionRoom({ code, isHost }: { code: string; isHost: boolean }) {
  const { user } = useCurrentUserState();
  const stored = useSession((s) => s.selfName);
  const name = (stored || user?.displayName || "Guest").slice(0, 32);
  const micOn = useSession((s) => s.micOn);
  const spectator = useSession((s) => s.spectator);
  const mutedPeers = useSession((s) => s.mutedPeers);
  const p2p = useP2PRoom({ room: code, name });
  const applying = useRef(false);
  const rolesRef = useRef<Record<string, SessionRole>>({});
  const hostIdRef = useRef<string | null>(null);
  const seenPeers = useRef(new Set<string>());
  const audioEls = useRef(new Map<string, HTMLAudioElement>());

  useEffect(() => {
    useSession.getState().setMeta({
      selfId: p2p.selfId,
      joined: p2p.joined,
      wire: { send: p2p.send, selfId: p2p.selfId, name },
    });
    if (isHost) {
      rolesRef.current[p2p.selfId] = "host";
      hostIdRef.current = p2p.selfId;
    } else if (spectator) {
      // A link-spectator records its own view role locally so it never
      // announces or requests edit privileges (Item 11).
      rolesRef.current[p2p.selfId] = "view";
    }
    return () => {
      useSession.getState().setMeta({ wire: null });
    };
  }, [p2p.selfId, p2p.joined, p2p.send, isHost, name, spectator]);

  useEffect(() => {
    if (p2p.peers.length >= MAX_SESSION_PEERS) {
      toast.error("Session is full (8 people)");
      writeSessionQuery(null);
      useSession.getState().leave();
    }
  }, [p2p.peers.length]);

  useEffect(() => {
    const next = p2p.peers.map((p) => ({
      id: p.id,
      name: p.name || p.id.slice(0, 8),
      role: rolesRef.current[p.id] ?? "edit",
      connectionState: p.connectionState,
      rttMs: p.rttMs,
    }));
    useSession.getState().setMeta({ peers: next });

    const alive = new Set(p2p.peers.map((p) => p.id));
    for (const id of seenPeers.current) {
      if (!alive.has(id)) {
        useSession.getState().dropPeer(id);
        // Tear down the departed peer's voice element so it stops playing and
        // is garbage-collected (Item 12).
        const el = audioEls.current.get(id);
        if (el) {
          el.srcObject = null;
          el.pause();
          audioEls.current.delete(id);
        }
      }
    }

    const newcomers = p2p.peers.filter((p) => !seenPeers.current.has(p.id));
    const previous = seenPeers.current;
    seenPeers.current = alive;

    if (newcomers.length === 0) return;
    const incumbents = [p2p.selfId, ...previous].sort();
    if (incumbents[0] !== p2p.selfId) return;
    const s = useLab.getState();
    const snap: SessionMsg = {
      t: "snapshot",
      config: currentCreationConfig(s),
      paused: s.paused,
      speed: s.speed,
      tool: s.tool,
      brushRadius: s.brushRadius,
      brushStrength: s.brushStrength,
      pouring: s.pouring,
      falling: s.falling,
      firing: s.firing,
      smoking: s.smoking,
      hostId: hostIdRef.current ?? p2p.selfId,
      roles: {
        ...rolesRef.current,
        [p2p.selfId]: isHost ? "host" : (rolesRef.current[p2p.selfId] ?? "edit"),
      },
    };
    for (const n of newcomers) {
      // Default a newcomer to "edit" unless a prior hello already announced it
      // as a spectator (Item 11) — then it stays "view".
      if (!rolesRef.current[n.id]) rolesRef.current[n.id] = "edit";
      p2p.send(snap, n.id);
    }
    // Depends on the specific STABLE p2p members it uses (send/selfId are
    // useCallback-stable, peers is the value that should retrigger). Listing the
    // whole `p2p` object would add its per-render identity and re-run this every
    // render. Intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p2p.peers, p2p.selfId, p2p.send, isHost]);

  useEffect(
    () =>
      p2p.onMessage((from, data, channel) => {
        if (!isSessionMsg(data)) return;
        if (data.t === "live") {
          if (channel !== "state") return;
          useSession.getState().setCursor({
            id: from,
            name: data.name || from.slice(0, 8),
            color: colorForId(from),
            x: data.x,
            y: data.y,
            down: data.down,
            tool: data.tool ?? "attract",
            at: Date.now(),
          });
          return;
        }
        // Never apply sim-editing messages from a peer we know to be view-only
        // (Item 11): a spectator (or anyone forced to view) can't grief the
        // shared canvas even if their client sends edit messages. Control/social
        // messages (role/chat/hello/kick) and the authoritative snapshot are
        // handled separately below and are not gated here.
        if (isEditMsg(data) && rolesRef.current[from] === "view") return;
        applying.current = true;
        try {
          withRemoteApply(() => applyRemote(p2p.selfId, data));
          if (data.t === "role") {
            rolesRef.current[data.peerId] = data.role;
          } else if (data.t === "snapshot") {
            rolesRef.current = { ...data.roles };
            hostIdRef.current = data.hostId;
            const mine = data.roles[p2p.selfId] ?? "edit";
            useSession.getState().setMeta({
              role: mine,
              isHost: data.hostId === p2p.selfId,
            });
          } else if (data.t === "hello") {
            if (data.isHost) {
              hostIdRef.current = from;
              rolesRef.current[from] = "host";
            } else if (data.spectator && rolesRef.current[from] !== "host") {
              // A peer that joined via a spectator link (Item 11) is recorded as
              // view so its edit-type messages are ignored everywhere. The host
              // additionally broadcasts an authoritative role update so every
              // peer agrees this id is view-only.
              rolesRef.current[from] = "view";
              if (isHost) p2p.send({ t: "role", peerId: from, role: "view" });
            }
            useSession.getState().setMeta({
              peers: useSession.getState().peers.map((p) =>
                p.id === from
                  ? { ...p, name: data.name || p.name, role: rolesRef.current[p.id] ?? p.role }
                  : p,
              ),
            });
          } else if (data.t === "chat") {
            useSession.getState().pushChat({
              id: `${from}-${data.at}`,
              from,
              name: data.name,
              text: data.text,
              at: data.at,
            });
          } else if (data.t === "mic") {
            // Voice presence (Item 12): reflect a peer's mic on/off so the
            // roster can show a speaking indicator.
            useSession.getState().setPeerMic(from, data.on);
          } else if (data.t === "kick") {
            if (data.peerId === p2p.selfId) {
              toast.message("You were removed from the session");
              writeSessionQuery(null);
              useSession.getState().leave();
            } else {
              useSession.getState().dropPeer(data.peerId);
            }
          }
        } finally {
          applying.current = false;
        }
      }),
    // Stable p2p members only; the parent `p2p` object's per-render identity is
    // intentionally not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [p2p.onMessage, p2p.selfId],
  );

  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      if (now - last >= 50) {
        const s = useLab.getState();
        p2p.broadcast({
          t: "live",
          x: s.pointer.x,
          y: s.pointer.y,
          down: useSession.getState().role === "view" ? false : s.pointer.down,
          tool: s.tool,
          name,
        });
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // Uses the stable p2p.broadcast; parent `p2p` identity intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p2p.broadcast, name]);

  useEffect(() => {
    let prev = useLab.getState();
    let paramTimer: ReturnType<typeof setTimeout> | undefined;
    const unsub = useLab.subscribe((s) => {
      if (applying.current) {
        prev = s;
        return;
      }
      if (useSession.getState().role === "view") {
        prev = s;
        return;
      }
      if (s.spawnId !== prev.spawnId && s.spawnKind) {
        p2p.send({ t: "gen", kind: s.spawnKind, config: currentCreationConfig(s) });
      } else if (s.clearId !== prev.clearId) {
        p2p.send({ t: "clear" });
      }
      if (s.params !== prev.params) {
        clearTimeout(paramTimer);
        paramTimer = setTimeout(() => {
          p2p.send({ t: "params", params: useLab.getState().params });
        }, 80);
      }
      if (
        s.tool !== prev.tool ||
        s.brushRadius !== prev.brushRadius ||
        s.brushStrength !== prev.brushStrength
      ) {
        p2p.send({
          t: "tool",
          tool: s.tool,
          brushRadius: s.brushRadius,
          brushStrength: s.brushStrength,
        });
      }
      if (s.paused !== prev.paused) p2p.send({ t: "paused", v: s.paused });
      if (s.speed !== prev.speed) p2p.send({ t: "speed", v: s.speed });
      if (
        s.pouring !== prev.pouring ||
        s.falling !== prev.falling ||
        s.firing !== prev.firing ||
        s.smoking !== prev.smoking
      ) {
        p2p.send({
          t: "streams",
          pouring: s.pouring,
          falling: s.falling,
          firing: s.firing,
          smoking: s.smoking,
        });
      }
      prev = s;
    });
    return () => {
      unsub();
      clearTimeout(paramTimer);
    };
    // Uses the stable p2p.send; parent `p2p` identity intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p2p.send]);

  useEffect(() => {
    p2p.send({ t: "hello", name, isHost, spectator });
    // Stable p2p members (send/joined) only; parent `p2p` identity omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p2p.send, name, isHost, spectator, p2p.joined]);

  useEffect(() => {
    const els = audioEls.current;
    const unsub = p2p.onTrack((from, stream) => {
      // Actually PLAY a remote peer's voice: attach its MediaStream to a hidden
      // <audio> element (Item 12). Reuse one element per peer across
      // renegotiations. Respect the current per-peer mute state on (re)attach.
      let el = els.get(from);
      if (!el) {
        el = new Audio();
        el.autoplay = true;
        els.set(from, el);
      }
      el.muted = Boolean(useSession.getState().mutedPeers[from]);
      el.srcObject = stream;
      void el.play().catch(() => {
        /* autoplay policy may defer until a user gesture; element stays live */
      });
    });
    return () => {
      unsub();
      for (const el of els.values()) {
        el.srcObject = null;
        el.pause();
      }
      els.clear();
    };
    // Uses the stable p2p.onTrack; parent `p2p` identity intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p2p.onTrack]);

  // Apply per-peer mute to the live audio elements whenever the mute map
  // changes, and drop elements for peers that have left (Item 12).
  useEffect(() => {
    const els = audioEls.current;
    for (const [id, el] of els) {
      el.muted = Boolean(mutedPeers[id]);
    }
  }, [mutedPeers]);

  // Announce our mic on/off to peers for the voice-presence indicator (Item 12).
  // Re-sent on join so late peers learn our current state.
  useEffect(() => {
    p2p.send({ t: "mic", on: micOn });
    // Stable p2p.send only; parent `p2p` identity intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p2p.send, micOn, p2p.joined]);

  useEffect(() => {
    if (!micOn) {
      p2p.setLocalAudio(null);
      return;
    }
    let stream: MediaStream | null = null;
    let dead = false;
    void navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then((s) => {
        if (dead) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream = s;
        p2p.setLocalAudio(s);
      })
      .catch(() => {
        toast.error("Microphone blocked");
        useSession.getState().setMicOn(false);
      });
    return () => {
      dead = true;
      stream?.getTracks().forEach((t) => t.stop());
      p2p.setLocalAudio(null);
    };
    // Uses the stable p2p.setLocalAudio; parent `p2p` identity omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micOn, p2p.setLocalAudio]);

  return null;
}

const EDIT_MSG_TYPES = new Set([
  "gen",
  "params",
  "clear",
  "tool",
  "paused",
  "speed",
  "streams",
]);

/** True for sim-editing messages that a view-only peer must never be able to apply. */
function isEditMsg(msg: SessionMsg): boolean {
  return EDIT_MSG_TYPES.has(msg.t);
}

function applyRemote(selfId: string, msg: SessionMsg): void {
  const lab = useLab.getState();
  switch (msg.t) {
    case "snapshot":
      lab.applyCreationConfig(msg.config);
      lab.setPaused(msg.paused);
      lab.setSpeed(msg.speed);
      lab.setTool(msg.tool);
      lab.setBrush(msg.brushRadius, msg.brushStrength);
      useLab.setState({
        pouring: msg.pouring,
        falling: msg.falling,
        firing: msg.firing,
        smoking: msg.smoking,
      });
      break;
    case "gen":
      lab.applyCreationConfig(msg.config);
      break;
    case "params":
      lab.patchParams(msg.params);
      break;
    case "clear":
      lab.clearSim();
      break;
    case "tool":
      // The sender broadcasts a ToolMsg precisely when tool OR brush changed, and
      // the message carries all three. Applying only the brush left the remote
      // tool change silently dropped, so peers' HUDs disagreed about the active
      // tool (the late-joiner "snapshot" path already applies msg.tool).
      lab.setTool(msg.tool);
      lab.setBrush(msg.brushRadius, msg.brushStrength);
      break;
    case "paused":
      lab.setPaused(msg.v);
      break;
    case "speed":
      lab.setSpeed(msg.v);
      break;
    case "streams":
      useLab.setState({
        pouring: msg.pouring,
        falling: msg.falling,
        firing: msg.firing,
        smoking: msg.smoking,
      });
      break;
    case "role":
      useSession.getState().setMeta({
        role: msg.peerId === selfId ? msg.role : useSession.getState().role,
        peers: useSession.getState().peers.map((p) =>
          p.id === msg.peerId ? { ...p, role: msg.role } : p,
        ),
      });
      break;
    default:
      break;
  }
}
