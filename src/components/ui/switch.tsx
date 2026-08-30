import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils";

/**
 * Thin styled wrapper over @radix-ui/react-switch — an accessible on/off toggle
 * matching the app's border/elevated/fg tokens. Controlled via `checked` +
 * `onCheckedChange` like the underlying primitive.
 */
export function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-fg data-[state=unchecked]:bg-elevated",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-surface shadow transition-transform data-[state=checked]:translate-x-[1.125rem] data-[state=checked]:bg-accent-fg" />
    </SwitchPrimitive.Root>
  );
}
