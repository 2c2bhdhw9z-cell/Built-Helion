import { useEffect, useRef, useState } from "react";
import { Drawer } from "vaul";
import * as Dialog from "@radix-ui/react-dialog";
import { useLab } from "@/store/lab-store";
import { usePerfSamples } from "./use-perf-samples";
import { PerfContent } from "./perf-content";

/** Tailwind `md` breakpoint (768px): below == mobile bottom sheet, at/above ==
 * desktop floating panel. */
const DESKTOP_QUERY = "(min-width: 768px)";

function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(DESKTOP_QUERY);
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isDesktop;
}

/**
 * The Performance Hub.
 *
 * Responsive: on NARROW viewports it renders a vaul bottom sheet (bounded height,
 * internal scroll, does not cover the whole sim or trap page scroll); on WIDE
 * viewports it renders a NON-MODAL Radix dialog styled as a floating docked card
 * (no full-screen overlay) so the sim stays fully interactive underneath while
 * the panel is open. Closes via tap-outside / Escape / the close button.
 *
 * COST: when closed it renders NOTHING (no overlay, no pointer interception) and
 * the sampling interval is torn down. Sampling only runs while OPEN and not
 * paused, throttled to ~7Hz off the sim frame loop.
 */
export function PerfHub() {
  const open = useLab((s) => s.perfHubOpen);
  const setOpen = useLab((s) => s.setPerfHubOpen);
  const isDesktop = useIsDesktop();

  // Graph capture pause + reset are hub-local ephemeral state.
  const [paused, setPaused] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const resetAtRef = useRef(Date.now());

  // Sampling is active only while open AND not paused.
  const snapshot = usePerfSamples(open && !paused, resetKey);

  const onReset = () => {
    resetAtRef.current = Date.now();
    setResetKey((k) => k + 1);
  };

  // Reset the "time since reset" baseline each time the hub opens fresh.
  useEffect(() => {
    if (open) {
      resetAtRef.current = Date.now();
      setResetKey((k) => k + 1);
      setPaused(false);
    }
  }, [open]);

  if (!open) return null;

  const content = (
    <PerfContent
      snapshot={snapshot}
      paused={paused}
      onTogglePause={() => setPaused((p) => !p)}
      onReset={onReset}
      onClose={() => setOpen(false)}
      resetAt={resetAtRef.current}
    />
  );

  if (!isDesktop) {
    // Mobile: vaul bottom sheet. Bounded height, internal scroll via PerfContent.
    return (
      <Drawer.Root open={open} onOpenChange={setOpen}>
        <Drawer.Portal>
          <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[82dvh] flex-col rounded-t-lg border-t border-border bg-surface text-fg outline-none">
            <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong" />
            <div className="flex items-center justify-between px-3 pb-1 pt-2">
              <Drawer.Title className="text-sm font-medium tracking-[0.08em]">
                Performance
              </Drawer.Title>
              <Drawer.Description className="text-2xs text-faint">
                Live telemetry
              </Drawer.Description>
            </div>
            {content}
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
    );
  }

  // Desktop: NON-MODAL floating panel. modal={false} + no full-screen overlay so
  // the sim remains interactive. Docked to the top-right below the HUD.
  return (
    <Dialog.Root open={open} onOpenChange={setOpen} modal={false}>
      <Dialog.Portal>
        <Dialog.Content
          onInteractOutside={() => setOpen(false)}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="fixed right-3 top-16 z-40 flex max-h-[calc(100dvh-5rem)] w-[24rem] flex-col overflow-hidden rounded-lg border border-border bg-surface/95 text-fg shadow-panel backdrop-blur-md"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <Dialog.Title className="text-sm font-medium tracking-[0.08em]">
              Performance
            </Dialog.Title>
            <Dialog.Description className="text-2xs text-faint">Live telemetry</Dialog.Description>
          </div>
          {content}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
