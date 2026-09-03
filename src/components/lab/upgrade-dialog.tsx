import { Link } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { LogIn, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLab } from "@/store/lab-store";
import { useBilling } from "@/lib/billing/use-billing";
import { PLANS, type PlanId } from "@/lib/billing/types";
import { cn } from "@/lib/utils";

function trialLabel(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const days = Math.max(0, Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000)));
  if (days <= 0) return null;
  return `${days} day${days === 1 ? "" : "s"} left on trial`;
}

export function UpgradeDialog() {
  const open = useLab((s) => s.upgradeOpen);
  const setOpen = useLab((s) => s.setUpgradeOpen);
  const setEntitled = useLab((s) => s.setEntitled);
  const setPlan = useLab((s) => s.setPlan);
  const { billing, isSignedIn, isLoading, choosePlan } = useBilling();

  const onChoose = async (plan: PlanId) => {
    if (!isSignedIn) return;
    const next = await choosePlan(plan);
    if (!next) {
      toast.error("Could not update plan");
      return;
    }
    setEntitled(next.entitled);
    setPlan(next.plan);
    toast.success(plan === "free" ? "Back on Free" : `You’re on ${plan === "pro" ? "Pro" : "Enterprise"}`);
  };

  const trial = billing.trialActive ? trialLabel(billing.trialEndsAt) : null;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(94vw,40rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface text-fg shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <Dialog.Title className="text-sm font-medium tracking-[0.08em]">
                Plans
              </Dialog.Title>
              <Dialog.Description className="text-2xs text-faint">
                Pro is $5/mo. Enterprise is $20/mo. New accounts get 7 days of Pro on the house.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>
          <div className="lab-scroll overflow-y-auto px-4 py-4">
            {trial ? (
              <p className="mb-3 rounded-md border border-border bg-elevated/50 px-3 py-2 text-2xs text-accent">
                {trial}
              </p>
            ) : null}
            {!isSignedIn ? (
              <div className="mb-3 flex flex-col items-start gap-2 rounded-md border border-dashed border-border px-3 py-3">
                <p className="text-sm text-fg">Sign in to start the 7-day Pro trial</p>
                <Link
                  to="/login"
                  className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-fg px-3 text-sm font-medium text-accent-fg hover:opacity-90"
                >
                  <LogIn className="size-3.5" />
                  Sign in
                </Link>
              </div>
            ) : null}
            <div className="grid gap-3 md:grid-cols-3">
              {PLANS.map((plan) => {
                const current = billing.plan === plan.id;
                return (
                  <article
                    key={plan.id}
                    className={cn(
                      "flex flex-col gap-2 rounded-md border bg-elevated/30 p-3",
                      current ? "border-accent" : "border-border",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-sm font-medium">{plan.label}</h3>
                      <span className="font-mono text-2xs text-muted">{plan.price}</span>
                    </div>
                    <p className="text-2xs leading-relaxed text-faint">{plan.blurb}</p>
                    <ul className="flex flex-col gap-1 text-2xs text-muted">
                      {plan.perks.map((perk) => (
                        <li key={perk}>· {perk}</li>
                      ))}
                    </ul>
                    <Button
                      type="button"
                      variant={current ? "outline" : "default"}
                      size="sm"
                      className="mt-auto h-8"
                      disabled={!isSignedIn || isLoading || current}
                      onClick={() => void onChoose(plan.id)}
                    >
                      {current ? "Current" : plan.id === "free" ? "Switch to Free" : `Choose ${plan.label}`}
                    </Button>
                  </article>
                );
              })}
            </div>
            <p className="mt-3 text-2xs text-faint">
              Billing is account-side in this preview — no card is charged. A live Stripe checkout ships when keys are set.
              Stills go to 4K / 8K in the browser; video is a canvas recording (no FFmpeg farm). Sessions are peer-to-peer, so physics can drift and voice needs a microphone plus a direct link.
            </p>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
