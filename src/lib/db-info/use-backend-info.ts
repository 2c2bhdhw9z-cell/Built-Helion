import { useEffect, useState } from "react";
import { getBackendInfoFn } from "./functions";

/**
 * Client-safe hook that reports whether the active database backend is
 * ephemeral (Req 1.4).
 *
 * It calls the NO-AUTH `getBackendInfoFn` server function exactly ONCE at boot
 * and caches the result for the lifetime of the app. The value is a plain
 * module-level constant on the server (`dbSource`), so the call never opens a
 * connection or runs a query — it is a cheap, non-blocking signal.
 *
 * This hook NEVER blocks the simulator:
 *   - while the one-shot fetch is in flight it returns `ephemeral: false`
 *     (neutral — the indicator renders nothing);
 *   - on any error it stays `ephemeral: false` (fail neutral — never warn on a
 *     transient failure and never surface a scary banner by mistake).
 *
 * Only when the server explicitly reports `ephemeral: true` (PGLite in-memory
 * backend) does the UI surface a "storage is not persistent" indication.
 *
 * The resolved value is memoized in a module-level promise so mounting the hook
 * in more than one place still issues a single network request per session.
 */

// Module-level single-flight cache: the first mount kicks off the request and
// every subsequent mount (this session) reuses the same in-flight/resolved
// promise, so the server function is called at most once at boot.
let backendInfoPromise: Promise<{ ephemeral: boolean }> | null = null;

function loadBackendInfo(): Promise<{ ephemeral: boolean }> {
  if (!backendInfoPromise) {
    backendInfoPromise = getBackendInfoFn().catch(() => {
      // Fail neutral: a transient failure must never warn. Reset the cache so a
      // later mount can retry, and report a non-ephemeral (neutral) result for
      // this attempt.
      backendInfoPromise = null;
      return { ephemeral: false };
    });
  }
  return backendInfoPromise;
}

export type BackendInfo = {
  /**
   * True only when the server has confirmed the active backend is the
   * in-memory Embedded_Database (PGLite). Neutral (`false`) while loading and
   * on error, so the caller never blocks or warns speculatively.
   */
  ephemeral: boolean;
};

/**
 * Read the backend-ephemeral signal once at boot. Returns `{ ephemeral: false }`
 * until the one-shot fetch resolves, and only flips to `true` when the server
 * confirms an ephemeral backend.
 */
export function useBackendInfo(): BackendInfo {
  const [ephemeral, setEphemeral] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void loadBackendInfo().then((info) => {
      if (!cancelled) setEphemeral(info.ephemeral);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { ephemeral };
}
