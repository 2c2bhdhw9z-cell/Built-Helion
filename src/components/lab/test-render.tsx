import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";

// Tell React this is an act()-aware environment so effect flushing is
// deterministic and the "not configured to support act(...)" warning is gone.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/**
 * Minimal React 19 render harness for the lab component tests. We deliberately
 * avoid @testing-library (not a dependency) and drive react-dom/client directly
 * under happy-dom (see vitest.config.ts). `act()` flushes effects so tests can
 * assert on the effect wiring (interval/handler registration) that two real
 * bugs lived in.
 */
export interface Mounted {
  container: HTMLElement;
  root: Root;
  rerender: (node: ReactNode) => void;
  unmount: () => void;
}

export function mount(node: ReactNode): Mounted {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(node);
  });
  return {
    container,
    root,
    rerender(next: ReactNode) {
      act(() => {
        root.render(next);
      });
    },
    unmount() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}
