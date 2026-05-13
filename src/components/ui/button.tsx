import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/src/lib/utils";

const buttonVariants = cva(
  "inline-flex touch-manipulation items-center justify-center gap-2 whitespace-nowrap rounded-full border text-sm font-semibold tracking-[0.08em] uppercase transition disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
  {
    variants: {
      variant: {
        default:
          "border-[var(--panel-border-strong)] bg-[var(--accent-hot)] text-[var(--ink-strong)] hover:bg-[var(--accent-hot-soft)]",
        secondary:
          "border-[var(--panel-border)] bg-[var(--panel-elevated)] text-[var(--ink-strong)] hover:border-[var(--panel-border-strong)] hover:bg-[var(--panel-muted)]",
        ghost:
          "border-transparent bg-transparent text-[var(--ink-muted)] hover:border-[var(--panel-border)] hover:bg-[var(--panel)] hover:text-[var(--ink-strong)]",
      },
      size: {
        default: "h-11 px-5",
        sm: "h-9 px-4 text-xs",
        lg: "h-14 px-6 text-base",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
