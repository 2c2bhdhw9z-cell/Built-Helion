import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "@tanstack/react-router";
import { LogIn, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLab } from "@/store/lab-store";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getProfileFn, updateProfileFn } from "@/lib/profiles/functions";
import { DEFAULT_PROFILE, type Profile } from "@/lib/profiles/types";
import { SliderRow } from "./controls";

const fieldClass =
  "w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-fg placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "text-2xs uppercase tracking-[0.12em] text-faint";

export function ProfileDialog() {
  const open = useLab((s) => s.profileOpen);
  const setOpen = useLab((s) => s.setProfileOpen);
  const { user, isPending } = useCurrentUserState();
  const signedIn = Boolean(user);

  const [profile, setProfile] = useState<Profile>({ ...DEFAULT_PROFILE });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !signedIn || isPending) return;
    let cancelled = false;
    setLoading(true);
    void getProfileFn()
      .then((p) => {
        if (!cancelled) setProfile(p);
      })
      .catch(() => {
        if (!cancelled) setProfile({ ...DEFAULT_PROFILE });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, signedIn, isPending]);

  const onSave = async () => {
    setSaving(true);
    try {
      const next = await updateProfileFn({
        data: {
          displayName: profile.displayName,
          bio: profile.bio,
          hue: profile.hue,
        },
      });
      setProfile(next);
      toast.success("Profile saved");
    } catch {
      toast.error("Could not save profile");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface text-fg shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <Dialog.Title className="text-sm font-medium tracking-[0.08em]">
                Profile
              </Dialog.Title>
              <Dialog.Description className="text-2xs text-faint">
                How you appear next to public creations. Never an email.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="lab-scroll flex flex-col gap-4 overflow-y-auto px-4 py-4">
            {!signedIn ? (
              <div className="flex flex-col items-start gap-2 rounded-md border border-dashed border-border px-3 py-3">
                <p className="text-sm text-fg">Sign in to keep a profile</p>
                <p className="text-2xs leading-relaxed text-faint">
                  A display name is what the library shows. The sim itself never needs an account.
                </p>
                <Link
                  to="/login"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-fg px-3 text-sm font-medium text-accent-fg hover:opacity-90"
                >
                  <LogIn className="size-3.5" />
                  Sign in
                </Link>
              </div>
            ) : loading ? (
              <p className="py-8 text-center text-2xs text-faint">Loading\u2026</p>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <div
                    className="flex size-12 shrink-0 items-center justify-center rounded-full text-sm font-medium text-accent-fg"
                    style={{ background: `hsl(${profile.hue} 42% 42%)` }}
                    aria-hidden
                  >
                    {(profile.displayName.trim()[0] || "H").toUpperCase()}
                  </div>
                  <div className="min-w-0 text-2xs text-faint">
                    <p>
                      {profile.saves} save{profile.saves === 1 ? "" : "s"} \u00b7 {profile.likes} like
                      {profile.likes === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Display name</span>
                  <input
                    className={fieldClass}
                    value={profile.displayName}
                    maxLength={40}
                    placeholder="Helion"
                    onChange={(e) =>
                      setProfile((p) => ({ ...p, displayName: e.target.value }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className={labelClass}>Bio</span>
                  <textarea
                    className={`${fieldClass} h-20 resize-none`}
                    value={profile.bio}
                    maxLength={160}
                    placeholder="What you like to spawn."
                    onChange={(e) => setProfile((p) => ({ ...p, bio: e.target.value }))}
                  />
                </label>
                <SliderRow
                  label="Avatar hue"
                  value={profile.hue}
                  min={0}
                  max={360}
                  step={1}
                  format={(n) => `${n}\u00b0`}
                  onChange={(n) => setProfile((p) => ({ ...p, hue: Math.round(n) }))}
                />
                <Button
                  type="button"
                  variant="default"
                  size="md"
                  disabled={saving}
                  onClick={() => void onSave()}
                >
                  {saving ? "Saving\u2026" : "Save profile"}
                </Button>
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
