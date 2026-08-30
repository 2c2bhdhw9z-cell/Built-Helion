import { useEffect } from "react";
import type { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useLab } from "@/store/lab-store";
import { submitFeedbackFn } from "@/lib/feedback/functions";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { usePreferences } from "@/lib/settings/use-preferences";
import {
  feedbackTypes,
  submitFeedbackSchema,
  type SubmitFeedbackInput,
} from "@/lib/feedback/types";

/**
 * The form's field-value (INPUT) shape, taken straight from the schema's input
 * type. Because `userEmail` uses `z.preprocess`, its INPUT is `unknown` (any
 * value is accepted then coerced) while the OUTPUT is `string | undefined`.
 * Typing the form with the input type keeps the resolver generic in agreement;
 * handleSubmit still yields the coerced OUTPUT (`SubmitFeedbackInput`).
 */
type FeedbackFormValues = z.input<typeof submitFeedbackSchema>;

const TYPE_LABELS: Record<(typeof feedbackTypes)[number], string> = {
  bug: "Bug",
  feature: "Feature",
  general: "General",
};

const fieldClass =
  "w-full rounded-md border border-border bg-elevated px-3 py-2 text-sm text-fg placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "text-2xs uppercase tracking-[0.12em] text-faint";

const EMPTY_FORM = {
  type: "bug" as const,
  title: "",
  category: "",
  description: "",
  stepsOrUseCases: "",
  severityOrPriority: "",
  userEmail: "",
};

export function FeedbackDialog() {
  const open = useLab((s) => s.feedbackOpen);
  const setOpen = useLab((s) => s.setFeedbackOpen);

  const { user } = useCurrentUserState();
  const { preferences } = usePreferences();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FeedbackFormValues, unknown, SubmitFeedbackInput>({
    resolver: zodResolver(submitFeedbackSchema),
    defaultValues: EMPTY_FORM,
  });

  // Auto-fill the email field ONLY when the preference is ON and the user is
  // signed in with an email. Off or logged out -> the field stays blank (and
  // remains optional per the schema fix). Re-applied each time the dialog opens
  // so a mid-session preference/sign-in change is reflected. The auto-filled
  // value is stored only to the private user_email column; it never reaches the
  // public board.
  useEffect(() => {
    if (!open) return;
    const autofillEmail =
      preferences.autofillFeedbackEmail && user?.primaryEmail
        ? user.primaryEmail
        : "";
    reset({ ...EMPTY_FORM, userEmail: autofillEmail });
  }, [open, preferences.autofillFeedbackEmail, user?.primaryEmail, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      // Strip empty optional strings so they persist as null, not "".
      const payload: SubmitFeedbackInput = {
        type: values.type,
        title: values.title,
        description: values.description,
        category: values.category?.trim() ? values.category : undefined,
        stepsOrUseCases: values.stepsOrUseCases?.trim()
          ? values.stepsOrUseCases
          : undefined,
        severityOrPriority: values.severityOrPriority?.trim()
          ? values.severityOrPriority
          : undefined,
        rating: values.rating,
        userEmail: values.userEmail?.trim() ? values.userEmail : undefined,
      };
      await submitFeedbackFn({ data: payload });
      toast.success("Feedback submitted. Thank you!");
      reset(EMPTY_FORM);
      setOpen(false);
    } catch (err) {
      console.error("Feedback submission failed", err);
      toast.error("Could not submit feedback. Please try again.");
    }
  });

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 flex max-h-[90dvh] w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-lg border border-border bg-surface text-fg shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <Dialog.Title className="text-sm font-medium tracking-[0.08em]">
                Send Feedback
              </Dialog.Title>
              <Dialog.Description className="text-2xs text-faint">
                Report a bug, request a feature, or share a thought.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close">
                <X className="size-4" />
              </Button>
            </Dialog.Close>
          </div>

          <form
            onSubmit={onSubmit}
            className="lab-scroll flex flex-col gap-3 overflow-y-auto px-4 py-4"
          >
            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="fb-type">
                Type
              </label>
              <select id="fb-type" className={fieldClass} {...register("type")}>
                {feedbackTypes.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
              {errors.type && (
                <span className="text-2xs text-danger">{errors.type.message}</span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="fb-title">
                Title
              </label>
              <input
                id="fb-title"
                className={fieldClass}
                placeholder="Short summary"
                {...register("title")}
              />
              {errors.title && (
                <span className="text-2xs text-danger">{errors.title.message}</span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="fb-category">
                Category
              </label>
              <input
                id="fb-category"
                className={fieldClass}
                placeholder="e.g. rendering, UI, performance"
                {...register("category")}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="fb-description">
                Description
              </label>
              <textarea
                id="fb-description"
                className={`${fieldClass} min-h-24 resize-y`}
                placeholder="Describe the bug, feature, or feedback"
                {...register("description")}
              />
              {errors.description && (
                <span className="text-2xs text-danger">
                  {errors.description.message}
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="fb-steps">
                Steps to reproduce / Use cases
              </label>
              <textarea
                id="fb-steps"
                className={`${fieldClass} min-h-20 resize-y`}
                placeholder="How to reproduce, or how you'd use this"
                {...register("stepsOrUseCases")}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className={labelClass} htmlFor="fb-severity">
                  Severity / Priority
                </label>
                <input
                  id="fb-severity"
                  className={fieldClass}
                  placeholder="e.g. high"
                  {...register("severityOrPriority")}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className={labelClass} htmlFor="fb-rating">
                  Rating (1-5)
                </label>
                <input
                  id="fb-rating"
                  type="number"
                  min={1}
                  max={5}
                  className={fieldClass}
                  placeholder="1-5"
                  {...register("rating", {
                    setValueAs: (v) =>
                      v === "" || v === null || v === undefined
                        ? undefined
                        : Number(v),
                  })}
                />
                {errors.rating && (
                  <span className="text-2xs text-danger">
                    {errors.rating.message}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <label className={labelClass} htmlFor="fb-email">
                Email (optional)
              </label>
              <input
                id="fb-email"
                type="email"
                className={fieldClass}
                placeholder="you@example.com"
                {...register("userEmail")}
              />
              {errors.userEmail && (
                <span className="text-2xs text-danger">
                  {errors.userEmail.message}
                </span>
              )}
            </div>

            <div className="mt-1 flex items-center justify-end gap-2">
              <Dialog.Close asChild>
                <Button type="button" variant="ghost" size="md">
                  Cancel
                </Button>
              </Dialog.Close>
              <Button type="submit" variant="default" size="md" disabled={isSubmitting}>
                {isSubmitting ? "Submitting…" : "Submit"}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
