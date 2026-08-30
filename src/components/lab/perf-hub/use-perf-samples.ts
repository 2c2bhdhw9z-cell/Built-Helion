import { useEffect, useRef, useState } from "react";
import { useLab } from "@/store/lab-store";
import { RingBuffer, WINDOW, sampleFromTelemetry, type PerfSample } from "@/lib/perf/ring-buffer";
import { summarize, type PerfSummary } from "@/lib/perf/stats";

/** Chart refresh cadence: ~7Hz (140ms). Matches the engine's ~8Hz telemetry
 * throttle so we never poll faster than data arrives, and keeps React re-renders
 * off the sim frame loop. */
const SAMPLE_INTERVAL_MS = 140;

export type PerfSnapshot = {
  samples: PerfSample[];
  summary: PerfSummary;
};

const EMPTY: PerfSnapshot = { samples: [], summary: summarize([]) };

/**
 * Drive the perf hub's rolling window. ONLY runs while `active` is true (the hub
 * is open AND not paused): it starts a single setInterval that reads the latest
 * telemetry from the store, pushes a PerfSample into a fixed-length RingBuffer,
 * and snapshots the window + recomputed summary into React state. When `active`
 * flips false the interval is torn down so there is ZERO ongoing cost while the
 * hub is closed or graph capture is paused.
 *
 * `resetKey` bumps to clear the buffer + summary (the "reset stats" control).
 */
export function usePerfSamples(active: boolean, resetKey: number): PerfSnapshot {
  const bufferRef = useRef<RingBuffer<PerfSample>>(new RingBuffer<PerfSample>(WINDOW));
  const [snapshot, setSnapshot] = useState<PerfSnapshot>(EMPTY);

  // Clear the ring buffer + summary whenever resetKey changes.
  useEffect(() => {
    bufferRef.current.clear();
    setSnapshot(EMPTY);
  }, [resetKey]);

  useEffect(() => {
    if (!active) return;
    const buffer = bufferRef.current;
    const tick = () => {
      const tel = useLab.getState().telemetry;
      buffer.push(sampleFromTelemetry(tel, performance.now()));
      const samples = buffer.toArray();
      setSnapshot({ samples, summary: summarize(samples) });
    };
    tick();
    const id = window.setInterval(tick, SAMPLE_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [active]);

  return snapshot;
}
