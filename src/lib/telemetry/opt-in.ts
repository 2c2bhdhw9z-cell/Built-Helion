import { useCallback, useEffect, useState } from "react";
import { kv } from "@/lib/platform";
import { submitTelemetrySampleFn } from "./functions.ts";
import type { PerfSampleInput } from "./types.ts";

/**
 * Client-side opt-in gate for anonymous performance telemetry (Req 12.1, 12.2).
 *
 * Telemetry is OFF unless the user has explicitly opted in. The opt-in flag is
 * the single source of truth for whether a sample may leave the device, and it
 * is read/written ONLY through the platform KV abstraction (`kv()` from
 * `src/lib/platform`) — never `localStorage` directly — so it honors the
 * standing rule that all device I/O routes through `src/lib/platform` and works
 * unchanged on native shells (Capacitor/Tauri) that swap in their own KV store.
 *
 * The core guarantee (Req 12.2): `submitSampleIfOptedIn` submits a sample ONLY
 * when the flag is set. If the user has NOT opted in it performs NO submission
 * and no network call — it returns without ever reaching the server function.
 * Because the submit server function is anonymous (no id/email; Req 12.3), the
 * opt-in flag is the ONLY thing standing between "no data collected" and "an
 * anonymous sample recorded".
 */

/** KV key for the persisted opt-in flag. Namespaced like other Helion keys. */
export const TELEMETRY_OPT_IN_KEY = "helion.telemetry.optIn";

/** The string written to KV when the user has opted in. */
const OPTED_IN_VALUE = "1";

/**
 * Whether the user has opted in to anonymous telemetry. Reads the flag through
 * the platform KV; defaults to `false` (opt-out) when the key is absent or
 * holds any value other than the explicit opted-in marker. Never throws — a KV
 * read failure degrades to "not opted in", the privacy-preserving default.
 */
export function isTelemetryOptedIn(): boolean {
  return kv().get(TELEMETRY_OPT_IN_KEY) === OPTED_IN_VALUE;
}

/**
 * Set the telemetry opt-in flag. `true` persists the opted-in marker; `false`
 * removes the key entirely (so the state is a clean opt-out, not a lingering
 * "0"). Writes go through the platform KV abstraction.
 */
export function setTelemetryOptIn(optedIn: boolean): void {
  if (optedIn) {
    kv().set(TELEMETRY_OPT_IN_KEY, OPTED_IN_VALUE);
  } else {
    kv().remove(TELEMETRY_OPT_IN_KEY);
  }
}

/**
 * Submit an anonymous performance sample ONLY IF the user has opted in
 * (Req 12.1, 12.2). When the user has NOT opted in, this is a no-op: it makes
 * NO network call and returns `false`, guaranteeing no sample is ever submitted
 * without opt-in. When opted in, it forwards the anonymous sample to the
 * no-auth submit server function and returns `true`.
 *
 * @returns `true` if a sample was submitted, `false` if suppressed by opt-out.
 */
export async function submitSampleIfOptedIn(sample: PerfSampleInput): Promise<boolean> {
  if (!isTelemetryOptedIn()) return false;
  await submitTelemetrySampleFn({ data: sample });
  return true;
}


/**
 * Minimal React controller for the telemetry opt-in toggle. Reads the persisted
 * flag through the platform KV on mount and exposes a setter that both updates
 * local state and persists through `setTelemetryOptIn`. This is a convenience
 * for a settings toggle only — the CORE gating (Req 12.2) lives in
 * `submitSampleIfOptedIn`, which reads the flag directly, so telemetry is
 * correctly gated even without this hook.
 */
export type TelemetryOptInController = {
  /** Whether the user is currently opted in. */
  optedIn: boolean;
  /** Persist a new opt-in choice through the platform KV. */
  setOptedIn: (next: boolean) => void;
};

export function useTelemetryOptIn(): TelemetryOptInController {
  const [optedIn, setOptedInState] = useState<boolean>(false);

  useEffect(() => {
    setOptedInState(isTelemetryOptedIn());
  }, []);

  const setOptedIn = useCallback((next: boolean) => {
    setTelemetryOptIn(next);
    setOptedInState(next);
  }, []);

  return { optedIn, setOptedIn };
}
