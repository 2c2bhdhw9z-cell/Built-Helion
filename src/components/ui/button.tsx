import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ButtonHTMLAttributes } from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 font-medium transition-[opacity,transform,background-color,color,box-shadow] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98] select-none",
  {
    variants: {
      variant: {
        default: "bg-fg text-accent-fg hover:opacity-90",
        ghost: "bg-transparent text-muted hover:text-fg hover:bg-elevated",
        outline: "bg-transparent text-fg shadow-[0_0_0_1px_var(--color-border)] hover:bg-elevated",
        tool: "bg-elevated text-muted hover:text-fg",
        active: "bg-fg text-accent-fg",
      },
      size: {
        sm: "h-8 rounded-sm px-2.5 text-xs",
        md: "h-9 rounded-md px-3 text-sm",
        lg: "h-11 rounded-lg px-4 text-sm",
        icon: "size-9 rounded-md",
        chip: "h-7 rounded-sm px-2 text-2xs tracking-wide",
      },
    },
    defaultVariants: { variant: "outline", size: "sm" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
