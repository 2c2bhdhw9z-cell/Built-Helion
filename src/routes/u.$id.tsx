import { createFileRoute, Link } from "@tanstack/react-router";
import { Award, Heart, Play, Sparkles } from "lucide-react";
import type { PublicProfile } from "@/lib/profiles/types";

/**
 * Public creator profile route: /u/:id.
 *
 * Shows a creator's PUBLIC page for ANYONE, signed in or not — no login is
 * required (the hard no-forced-login rule). The loader reads a PII-free bundle
 * (display name / bio / hue, public creations gallery, aggregate stats, earned
 * achievement badges) from the public, unauthed `getPublicProfileFn`; an
 * unknown creator degrades to a graceful "creator not found" state and NEVER
 * hard-errors or redirects to /login. No email or private creation is ever
 * exposed.
 */
export const Route = createFileRoute("/u/$id")({
  component: CreatorProfile,
  loader: async ({ params }): Promise<{ profile: PublicProfile | null }> => {
    try {
      // Import the server fn dynamically INSIDE the loader (not at module top
      // level) so its createServerFn().handler(createSsrRpc()) call is not
      // co-located into the route-tree SSR chunk — a top-level call there forms
      // a circular ESM chunk dependency and throws "createSsrRpc is not a
      // function", 500ing every route (see s.$id.tsx / admin.feedback.tsx).
      const { getPublicProfileFn } = await import("@/lib/profiles/functions");
      const profile = await getPublicProfileFn({ data: { userId: params.id } });
      return { profile };
    } catch {
      // Never block the page on a lookup failure — degrade gracefully.
      return { profile: null };
    }
  },
});

function CreatorProfile() {
  const { profile } = Route.useLoaderData();

  if (!profile || !profile.found) {
    return (
      <div className="min-h-dvh bg-bg text-fg">
        <main className="mx-auto flex max-w-md flex-col items-center justify-center gap-3 px-4 py-24 text-center">
          <p className="text-sm text-fg">Creator not found</p>
          <p className="text-2xs leading-relaxed text-faint">
            This profile has no public creations yet, or the link is wrong.
          </p>
          <Link
            to="/"
            className="rounded-md border border-border bg-surface/80 px-3 py-1.5 text-2xs uppercase tracking-[0.14em] text-muted hover:text-fg"
          >
            Open Helion
          </Link>
        </main>
      </div>
    );
  }

  const name = profile.displayName.trim() || "No name";
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-border bg-surface/80 px-4 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-4">
          <div
            className="flex size-14 shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white"
            style={{ backgroundColor: `hsl(${profile.hue} 60% 45%)` }}
            aria-hidden
          >
            {initial}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-medium text-fg">{name}</h1>
            {profile.bio ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted">{profile.bio}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-4 text-2xs text-faint">
              <span className="flex items-center gap-1">
                <Sparkles className="size-3.5" />
                <span className="tabular-nums text-fg">{profile.publicCount}</span> published
              </span>
              <span className="flex items-center gap-1">
                <Heart className="size-3.5" />
                <span className="tabular-nums text-fg">{profile.totalLikes}</span> likes
              </span>
              <span className="flex items-center gap-1">
                <Award className="size-3.5" />
                <span className="tabular-nums text-fg">{profile.badges.length}</span> achievements
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
        {profile.badges.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h2 className="text-2xs uppercase tracking-[0.12em] text-faint">Achievements</h2>
            <ul className="flex flex-wrap gap-2">
              {profile.badges.map((badge) => (
                <li
                  key={badge.id}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-elevated/40 px-3 py-1 text-2xs text-fg"
                >
                  <Award className="size-3.5 text-muted" />
                  {badge.label}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <h2 className="text-2xs uppercase tracking-[0.12em] text-faint">Gallery</h2>
          {profile.gallery.length === 0 ? (
            <div className="flex flex-col items-center gap-1 rounded-md border border-dashed border-border py-12 text-center">
              <p className="text-sm text-fg">No public creations yet</p>
              <p className="text-2xs text-faint">
                When this creator publishes work, it appears here.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {profile.gallery.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2 rounded-md border border-border bg-elevated/40 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-fg" title={item.name}>
                      {item.name}
                    </p>
                    <p className="flex items-center gap-1 text-2xs text-faint">
                      <Heart className="size-3" />
                      <span className="tabular-nums">{item.likeCount}</span>
                    </p>
                  </div>
                  <Link
                    to="/s/$id"
                    params={{ id: item.id }}
                    className="flex h-8 shrink-0 items-center gap-1 rounded-md border border-border bg-surface/80 px-2.5 text-2xs uppercase tracking-[0.12em] text-muted hover:text-fg"
                    aria-label={`Open ${item.name}`}
                  >
                    <Play className="size-3.5" />
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
