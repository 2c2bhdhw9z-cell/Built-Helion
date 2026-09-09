import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { LabApp } from "@/components/lab/lab-app";
import { useLab } from "@/store/lab-store";
import { normalizeCreationConfig, type PublicCreation } from "@/lib/creations/types";

/**
 * Chromeless, read-only embed player: /embed/:id.
 *
 * Loads and AUTOPLAYS a public creation for ANYONE, signed in or not — no login
 * required (the hard no-forced-login rule), suitable for an <iframe> in a blog
 * or tweet. It reuses the full LabApp engine but forces the store's `viewOnly`
 * flag, so LabApp renders with NO menus/HUD/tools — just the running sim sized
 * to the viewport. The loader reads the same PII-free { id, name, config }
 * projection as the share route; an unknown/invalid id degrades to the default
 * sim and NEVER hard-errors or redirects to /login.
 *
 * The `getSharedCreationFn` is imported dynamically INSIDE the loader (not at
 * module top level) so its createServerFn().handler(createSsrRpc()) call is not
 * co-located into the route-tree SSR chunk — a top-level call there forms a
 * circular ESM chunk dependency and 500s every route (see s.$id.tsx).
 */
export const Route = createFileRoute("/embed/$id")({
  component: EmbeddedCreation,
  loader: async ({ params }): Promise<{ creation: PublicCreation | null }> => {
    try {
      const { getSharedCreationFn } = await import("@/lib/creations/functions");
      const creation = await getSharedCreationFn({ data: { id: params.id } });
      return { creation };
    } catch {
      return { creation: null };
    }
  },
});

function EmbeddedCreation() {
  const { creation } = Route.useLoaderData();
  const applyCreationConfig = useLab((s) => s.applyCreationConfig);
  const setViewOnly = useLab((s) => s.setViewOnly);
  const setPaused = useLab((s) => s.setPaused);

  useEffect(() => {
    // Force the chromeless, autoplaying read-only mode for the whole embed
    // session; clear it on unmount so navigating away restores the full lab.
    setViewOnly(true);
    setPaused(false);
    const config = creation ? normalizeCreationConfig(creation.config) : null;
    if (config) applyCreationConfig(config);
    return () => setViewOnly(false);
    // Apply exactly once per embedded id (loader data is stable per route).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creation?.id]);

  return <LabApp />;
}
