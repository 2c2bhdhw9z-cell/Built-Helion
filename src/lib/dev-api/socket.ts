/**
 * WebSocket control channel — the real-time transport for `/api/v1/control`
 * (Req 11). This module owns the *handler* and the in-process peer registry;
 * it does NOT register the route. Wiring the upgrade route into the request
 * pipeline (and the at-most-once queue-consumption logic) is task 10.2.
 *
 * ## How this is mounted (for task 10.2)
 *
 * Nitro's socket support runs on [crossws](https://crossws.h3.dev). A crossws
 * handler is a set of lifecycle hooks (`upgrade` / `open` / `message` /
 * `close`), which is exactly what {@link controlSocketHooks} is — produced via
 * crossws' own `defineHooks` so the shape is validated against the installed
 * crossws version rather than hand-rolled.
 *
 * At the `/api/v1/control/socket` upgrade site (task 10.2), attach these hooks
 * to the upgrade request with crossws' `setWebSocketHooks(request, controlSocketHooks)`
 * (re-exported here as {@link attachControlSocket} so 10.2 has one import), or
 * hand `controlSocketHooks` to whatever `defineWebSocketHandler({ ... })`
 * equivalent the Nitro/h3 route layer exposes. The default crossws server
 * resolver reads the hooks back off the request after the fetch handler
 * returns and performs the upgrade.
 *
 * Auth happens in the `upgrade` hook (before the socket exists): the bearer
 * token is read from the `sec-websocket-protocol` header — browsers cannot set
 * `Authorization` on a `new WebSocket(url, protocols)` call, so the token is
 * smuggled as a subprotocol — and resolved via {@link resolveToken}. An invalid
 * or missing token throws a `4401`-style rejection (Req 11.2); a valid token is
 * accepted (Req 11.1) and its `userId` is stashed on the peer context so `open`
 * can register the peer against that account.
 *
 * Delivery to a listening lab (Req 11.3) is done by {@link pushToUser}, which
 * task 10.2 calls from the `POST /api/v1/control` path (in the same transaction
 * that stamps `api_commands.consumed_at`, so the live push and the polling
 * fallback never double-deliver — Req 11.4).
 */
import type { Hooks, Message, Peer } from "crossws";
import { defineHooks, setWebSocketHooks } from "crossws";
import { resolveToken } from "./tokens.ts";

/** Close code for an unauthenticated upgrade (Req 11.2). Mirrors HTTP 401. */
export const UNAUTHORIZED_CLOSE_CODE = 4401;

/**
 * Peer context we attach on a successful upgrade. crossws' `PeerContext` is an
 * open `Record<string, unknown>`; this is the slice this handler reads back.
 */
type ControlPeerContext = {
  /** Account that owns the resolved bearer token. */
  helionUserId?: string;
  /** Token id, kept for auditing / future per-token targeting. */
  helionTokenId?: string;
};

/**
 * In-process registry of listening labs, keyed by account. A single account
 * may have several tabs/devices connected at once, hence a `Set` of peers.
 *
 * This is intentionally in-process only: on hosts without a socket upgrade the
 * registry simply stays empty and the polling queue is the transport (Req 11.4).
 * A multi-instance deployment would need a backplane (crossws ships Redis /
 * Postgres sync drivers) — out of scope for this task.
 */
const listeningLabs = new Map<string, Set<Peer>>();

/** Register a peer under its account (add-on-open). */
function addPeer(userId: string, peer: Peer): void {
  let peers = listeningLabs.get(userId);
  if (!peers) {
    peers = new Set<Peer>();
    listeningLabs.set(userId, peers);
  }
  peers.add(peer);
}

/** Remove a peer, dropping the account's entry once no peers remain (remove-on-close). */
function removePeer(userId: string, peer: Peer): void {
  const peers = listeningLabs.get(userId);
  if (!peers) return;
  peers.delete(peer);
  if (peers.size === 0) listeningLabs.delete(userId);
}

/** Read the Helion account id off a peer's context, if the upgrade authenticated it. */
function userIdOf(peer: Peer): string | undefined {
  return (peer.context as ControlPeerContext).helionUserId;
}

/**
 * Extract the bearer token a browser smuggled through the WebSocket
 * subprotocol header. `new WebSocket(url, ["hl_…"])` sends a comma-separated
 * `sec-websocket-protocol` list; we take the first `hl_`-prefixed token.
 */
export function tokenFromProtocolHeader(header: string | null): string | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const token = part.trim();
    if (token.startsWith("hl_")) return token;
  }
  return null;
}

/**
 * Number of listening peers currently connected for an account. Exposed for
 * task 10.2 so `POST /control` can decide whether a live push reached anyone
 * (and thus whether the row can be marked consumed immediately).
 */
export function listenerCount(userId: string): number {
  return listeningLabs.get(userId)?.size ?? 0;
}

/**
 * Push a command to every peer a given account has connected (Req 11.3).
 * Serialises `payload` to JSON once and sends it to each listening lab.
 *
 * @returns the number of peers the command was delivered to (0 when the
 *   account has no live socket — the caller should then leave the command on
 *   the polling queue as the fallback transport, Req 11.4).
 */
export function pushToUser(userId: string, payload: unknown): number {
  const peers = listeningLabs.get(userId);
  if (!peers || peers.size === 0) return 0;
  const frame = JSON.stringify(payload);
  let delivered = 0;
  for (const peer of peers) {
    try {
      peer.send(frame);
      delivered++;
    } catch {
      // A peer that can't be written to is effectively gone; drop it so the
      // registry doesn't leak. `close` will also fire, but this is defensive.
      removePeer(userId, peer);
    }
  }
  return delivered;
}

/**
 * crossws lifecycle hooks for the control channel. Attach to the
 * `/api/v1/control/socket` upgrade in task 10.2 (see module docstring).
 */
export const controlSocketHooks: Partial<Hooks> = defineHooks({
  /**
   * Authenticate before the socket is established. Throwing a `Response`
   * aborts the upgrade (Req 11.2); returning `{ context }` stashes the
   * resolved account on the peer for `open`/`message`/`close` (Req 11.1).
   */
  async upgrade(request) {
    const raw = tokenFromProtocolHeader(request.headers.get("sec-websocket-protocol"));
    const auth = raw ? await resolveToken(raw) : null;
    if (!auth) {
      // 4401 == "unauthorized" in the 4000–4999 application close-code range;
      // surfaced to the client as an immediate close rather than a 101.
      throw new Response("Invalid bearer token", {
        status: 401,
        statusText: "Unauthorized",
        headers: { "x-ws-close-code": String(UNAUTHORIZED_CLOSE_CODE) },
      });
    }
    const context: ControlPeerContext = {
      helionUserId: auth.userId,
      helionTokenId: auth.tokenId,
    };
    // Echo the token back as the accepted subprotocol: browsers reject the 101
    // unless the server confirms one of the offered `sec-websocket-protocol`
    // values, and the token is what the client offered.
    return { context, protocol: raw ?? undefined };
  },

  /** Register the authenticated peer as a listening lab (add-on-open). */
  open(peer: Peer) {
    const userId = userIdOf(peer);
    if (!userId) {
      // Defence in depth: a peer that reached `open` without auth (should be
      // impossible given `upgrade` above) is closed rather than tracked.
      peer.close(UNAUTHORIZED_CLOSE_CODE, "Unauthorized");
      return;
    }
    addPeer(userId, peer);
  },

  /**
   * The control channel is server-push only: the lab listens for commands and
   * does not drive state through the socket. Inbound frames are ignored here;
   * task 10.2 owns the `POST /control` → {@link pushToUser} delivery path.
   */
  message(_peer: Peer, _message: Message) {
    // no-op — see docstring.
  },

  /** Deregister on disconnect (remove-on-close). */
  close(peer: Peer) {
    const userId = userIdOf(peer);
    if (userId) removePeer(userId, peer);
  },
});

/**
 * Convenience for task 10.2: attach the control-channel hooks to an upgrade
 * request so crossws' default resolver performs the upgrade. Thin wrapper over
 * crossws' `setWebSocketHooks` that pins the hooks to this handler.
 */
export function attachControlSocket(request: Request): void {
  setWebSocketHooks(request, controlSocketHooks);
}
