import { useState, type ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { authEnabled, signOut } from "./client";
import { useCurrentUser, useCurrentUserState } from "./use-current-user";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Auth state components — plain wrappers around `useCurrentUserState()`.
 *
 * With auth on, visitors are signed out until they authenticate — in the sandbox
 * live preview too, which does real sign-in. The shared dev user appears only
 * when auth is disabled (`VITE_AUTH_ENABLED=false`, the shipped default).
 * While the session is still resolving, gates that care about signed-out state
 * render nothing so there's no signed-out flash on hard reload.
 */

/** Where `RedirectToSignIn` sends signed-out visitors. Create this route. */
export const SIGN_IN_PATH = "/login";

/** Render children only when a user is present (real session, or the disabled-auth dev user). */
export function SignedIn({ children }: { children: ReactNode }) {
  const { user } = useCurrentUserState();
  return user ? <>{children}</> : null;
}

/**
 * Render children only once we KNOW the visitor is signed out (`isPending` has
 * cleared and there is no user). Hidden while the session is still loading.
 */
export function SignedOut({ children }: { children: ReactNode }) {
  const { user, isPending } = useCurrentUserState();
  if (isPending || user) return null;
  return <>{children}</>;
}

/**
 * Client-side redirect to the sign-in route (TanStack `<Navigate>` — NOT a full
 * `window.location` reload). A hard navigation re-bootstraps the SPA and re-runs
 * session loading, which feels like a second "Loading…" on /login.
 *
 * Guard routes by waiting out `isPending` first (see `use-current-user`), then
 * render this.
 */
export function RedirectToSignIn({ to = SIGN_IN_PATH }: { to?: string }) {
  return <Navigate to={to} />;
}

/**
 * Signed-in account control: a compact avatar button (peer of the other HUD
 * icon-buttons) that opens a tap-to-open menu. The menu is portalled above the
 * sim canvas (z-50) so it is never clipped by the HUD's narrow horizontal space
 * on a phone, shows who is signed in, and offers a clearly tappable "Sign out".
 * It dismisses on outside-tap / Escape and does not overlay the sim when closed.
 *
 * Sign-out is only shown when auth is enabled (the disabled-auth dev user has
 * nothing to sign out of).
 */
export function UserButton() {
  const user = useCurrentUser();
  // Sign-out can take a moment (and can fail when deployed), so the control
  // shows it is working and cannot be fired twice.
  const [signingOut, setSigningOut] = useState(false);
  if (!user) return null;
  const label = user.displayName ?? user.primaryEmail ?? "Account";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-fg shadow-[0_0_0_1px_var(--color-border)] outline-none transition-colors hover:bg-elevated focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-elevated"
      >
        {user.profileImageUrl ? (
          <img
            src={user.profileImageUrl}
            alt=""
            className="size-6 rounded-full object-cover"
          />
        ) : (
          <span className="grid size-6 place-items-center rounded-full bg-black/10 text-2xs font-medium dark:bg-white/20">
            {label.charAt(0).toUpperCase()}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
        <div className="truncate px-2 pb-1.5 text-sm font-medium">{label}</div>
        {authEnabled && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={signingOut}
              // Keep the menu open while the async sign-out runs so the
              // "Signing out…" state stays visible and the item can't refire.
              onSelect={(event) => {
                event.preventDefault();
                if (signingOut) return;
                setSigningOut(true);
                // Success navigates away; on failure re-enable to retry.
                void signOut().catch(() => setSigningOut(false));
              }}
            >
              <LogOut className="size-4" />
              {signingOut ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
