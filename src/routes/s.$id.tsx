import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { toast } from "sonner";
import { LabApp } from "@/components/lab/lab-app";
import { useLab } from "@/store/lab-store";
import { normalizeCreationConfig, type PublicCreation } from "@/lib/creations/types";

/**
 * Public share route: /s/:id.
 *
 * Loads and RUNS a saved creation for ANYONE, signed in or not — no login is
 * required to view a shared creation (the hard no-forced-login rule). The
 * loader reads a PII-free { id, name, config } projection from the public,
 * unauthed server fn; an unknown/invalid/missing id degrades to the default sim
 * plus a toast, and NEVER hard-errors or redirects to /login.
 */
export const Route = createFileRoute("/s/$id")({
  component: SharedCreation,
  loader: async ({ params }): Promise<{ creation: PublicCreation | null }> => {
    try {
      // Import the server fn dynamically INSIDE the loader (not at module top
      // level) so its `createServerFn(...).handler(createSsrRpc(...))` call is
      // not co-located into the route-tree SSR chunk. A top-level call there
      // forms a circular ESM chunk dependency with the chunk that defines
      // `createSsrRpc`, throwing `TypeError: createSsrRpc is not a function` and
      // 500ing every route (see the login/admin.feedback routes). Keep the
      // graceful fallback below so a lookup failure never blocks the page.
      const { getSharedCreationFn } = await import("@/lib/creations/functions");
      const creation = await getSharedCreationFn({ data: { id: params.id } });
      return { creation };
    } catch {
      // Never block the page on a lookup failure — degrade to the default sim.
      return { creation: null };
    }
  },
});

function SharedCreation() {
  const { creation } = Route.useLoaderData();
  const applyCreationConfig = useLab((s) => s.applyCreationConfig);

  useEffect(() => {
    // Run the untrusted payload through the schema before applying it: a
    // malformed/hostile blob is coerced to defaults or rejected as null, so the
    // loader can never crash the sim or smuggle extra fields into the store.
    const config = creation ? normalizeCreationConfig(creation.config) : null;
    if (config) {
      applyCreationConfig(config);
      toast.success(`Loaded "${creation!.name}"`);
    } else {
      // Missing / not found / invalid — run the default sim and say so, never a
      // hard error or a redirect to login.
      toast.error("That shared creation could not be found");
    }
    // Apply exactly once per shared id (the loader data is stable per route).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creation?.id]);

  return <LabApp />;
}
