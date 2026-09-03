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
  const p2p = useP2PRoom({ room: code, name });
  const applying = useRef(false);
  const rolesRef = useRef<Record<string, SessionRole>>({});
  const hostIdRef = useRef<string | null>(null);
  const seenPeers = useRef(new Set<string>());

  useEffect(() => {
    useSession.getState().setMeta({
      selfId: p2p.selfId,
      joined: p2p.joined,
      wire: { send: p2p.send, selfId: p2p.selfId, name },
    });
    if (isHost) {
      rolesRef.current[p2p.selfId] = "host";
      hostIdRef.current = p2p.selfId;
    }
    return () => {
      useSession.getState().setMeta({ wire: null });
    };
  }, [p2p.selfId, p2p.joined, p2p.send, isHost, name]);

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
      if (!alive.has(id)) useSession.getState().dropPeer(id);
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
      if (!rolesRef.current[n.id]) rolesRef.current[n.id] = "edit";
      p2p.send(snap, n.id);
    }
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
            }
            useSession.getState().setMeta({
              peers: useSession.getState().peers.map((p) =>
                p.id === from ? { ...p, name: data.name || p.name } : p,
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
          }
        } finally {
          applying.current = false;
        }
      }),
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
  }, [p2p.send]);

  useEffect(() => {
    p2p.send({ t: "hello", name, isHost });
  }, [p2p.send, name, isHost, p2p.joined]);

  return null;
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
