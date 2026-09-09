import { create } from "zustand";
import type { ToolKind } from "@/engine/types";
import type { PeerInfo } from "./p2p";
import { ensureGuestName } from "./protocol";

export type SessionRole = "host" | "admin" | "edit" | "view";

export type RemoteCursor = {
  id: string;
  name: string;
  color: string;
  x: number;
  y: number;
  down: boolean;
  tool: ToolKind;
  at: number;
};

export type SessionPeer = {
  id: string;
  name: string;
  role: SessionRole;
  connectionState: PeerInfo["connectionState"];
  rttMs: number | null;
};

export type ChatLine = {
  id: string;
  from: string;
  name: string;
  text: string;
  at: number;
};

export type SessionWire = {
  send: (data: unknown, peerId?: string) => void;
  selfId: string;
  name: string;
};

/** Options for entering a session: a link-joined spectator lands in view role. */
export type EnterOptions = {
  /** Join view-only (spectator link). Cannot edit or grief; a lightweight receiver. */
  spectator?: boolean;
  /** Known durable-room name to label the session immediately, if any. */
  roomName?: string;
};

type SessionState = {
  open: boolean;
  code: string | null;
  isHost: boolean;
  role: SessionRole | null;
  /** True while this client joined via a spectator link (locks it to view role). */
  spectator: boolean;
  /** Durable-room name when the code is a known persistent room, else null. */
  roomName: string | null;
  selfId: string | null;
  selfName: string;
  joined: boolean;
  peers: SessionPeer[];
  cursors: Record<string, RemoteCursor>;
  chat: ChatLine[];
  wire: SessionWire | null;
  micOn: boolean;
  /** Peer ids whose incoming voice this client has muted locally. */
  mutedPeers: Record<string, boolean>;
  /** Peer ids that have announced their microphone is live (voice presence). */
  micPeers: Record<string, boolean>;
  setOpen: (v: boolean) => void;
  enter: (code: string, isHost: boolean, opts?: EnterOptions) => void;
  leave: () => void;
  setMeta: (
    p: Partial<
      Pick<
        SessionState,
        "role" | "selfId" | "selfName" | "joined" | "peers" | "isHost" | "wire" | "roomName"
      >
    >,
  ) => void;
  setCursor: (c: RemoteCursor) => void;
  dropPeer: (id: string) => void;
  pushChat: (line: ChatLine) => void;
  setMicOn: (v: boolean) => void;
  togglePeerMuted: (id: string) => void;
  setPeerMic: (id: string, on: boolean) => void;
};

export const useSession = create<SessionState>((set) => ({
  open: false,
  code: null,
  isHost: false,
  role: null,
  spectator: false,
  roomName: null,
  selfId: null,
  selfName: "",
  joined: false,
  peers: [],
  cursors: {},
  chat: [],
  wire: null,
  micOn: false,
  mutedPeers: {},
  micPeers: {},
  setOpen: (v) => set({ open: v }),
  enter: (code, isHost, opts) =>
    set({
      code,
      isHost,
      // A spectator link joins directly in view role; a host is "host"; else "edit".
      role: opts?.spectator ? "view" : isHost ? "host" : "edit",
      spectator: Boolean(opts?.spectator),
      roomName: opts?.roomName ?? null,
      open: true,
      peers: [],
      cursors: {},
      chat: [],
      joined: false,
      selfId: null,
      selfName: ensureGuestName(),
      wire: null,
      micOn: false,
      mutedPeers: {},
      micPeers: {},
    }),
  leave: () =>
    set({
      code: null,
      isHost: false,
      role: null,
      spectator: false,
      roomName: null,
      selfId: null,
      selfName: "",
      joined: false,
      peers: [],
      cursors: {},
      chat: [],
      open: false,
      wire: null,
      micOn: false,
      mutedPeers: {},
      micPeers: {},
    }),
  setMeta: (p) => set(p),
  setCursor: (c) => set((s) => ({ cursors: { ...s.cursors, [c.id]: c } })),
  dropPeer: (id) =>
    set((s) => {
      const { [id]: _drop, ...cursors } = s.cursors;
      const { [id]: _mute, ...mutedPeers } = s.mutedPeers;
      const { [id]: _mic, ...micPeers } = s.micPeers;
      return { cursors, mutedPeers, micPeers, peers: s.peers.filter((p) => p.id !== id) };
    }),
  pushChat: (line) => set((s) => ({ chat: [...s.chat.slice(-80), line] })),
  setMicOn: (v) => set({ micOn: v }),
  togglePeerMuted: (id) =>
    set((s) => ({ mutedPeers: { ...s.mutedPeers, [id]: !s.mutedPeers[id] } })),
  setPeerMic: (id, on) => set((s) => ({ micPeers: { ...s.micPeers, [id]: on } })),
}));
