import { create } from "zustand";
import type { ToolKind } from "@/engine/types";
import type { PeerInfo } from "./p2p";
import { ensureGuestName } from "./protocol";

export type SessionRole = "host" | "edit" | "view";

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

type SessionState = {
  open: boolean;
  code: string | null;
  isHost: boolean;
  role: SessionRole | null;
  selfId: string | null;
  selfName: string;
  joined: boolean;
  peers: SessionPeer[];
  cursors: Record<string, RemoteCursor>;
  chat: ChatLine[];
  wire: SessionWire | null;
  setOpen: (v: boolean) => void;
  enter: (code: string, isHost: boolean) => void;
  leave: () => void;
  setMeta: (
    p: Partial<Pick<SessionState, "role" | "selfId" | "selfName" | "joined" | "peers" | "isHost" | "wire">>,
  ) => void;
  setCursor: (c: RemoteCursor) => void;
  dropPeer: (id: string) => void;
  pushChat: (line: ChatLine) => void;
};

export const useSession = create<SessionState>((set) => ({
  open: false,
  code: null,
  isHost: false,
  role: null,
  selfId: null,
  selfName: "",
  joined: false,
  peers: [],
  cursors: {},
  chat: [],
  wire: null,
  setOpen: (v) => set({ open: v }),
  enter: (code, isHost) =>
    set({
      code,
      isHost,
      role: isHost ? "host" : "edit",
      open: true,
      peers: [],
      cursors: {},
      chat: [],
      joined: false,
      selfId: null,
      selfName: ensureGuestName(),
      wire: null,
    }),
  leave: () =>
    set({
      code: null,
      isHost: false,
      role: null,
      selfId: null,
      selfName: "",
      joined: false,
      peers: [],
      cursors: {},
      chat: [],
      open: false,
      wire: null,
    }),
  setMeta: (p) => set(p),
  setCursor: (c) => set((s) => ({ cursors: { ...s.cursors, [c.id]: c } })),
  dropPeer: (id) =>
    set((s) => {
      const { [id]: _drop, ...cursors } = s.cursors;
      return { cursors, peers: s.peers.filter((p) => p.id !== id) };
    }),
  pushChat: (line) => set((s) => ({ chat: [...s.chat.slice(-80), line] })),
}));
