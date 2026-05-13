import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/src/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.16em]",
  {
    variants: {
      variant: {
        neutral:
          "border-[var(--panel-border)] bg-[var(--panel)] text-[var(--ink-muted)]",
        active:
          "border-[var(--accent-hot)] bg-[color-mix(in_oklab,var(--accent-hot)_16%,transparent)] text-[var(--accent-hot)]",
        danger:
          "border-[var(--accent-hot)] bg-[color-mix(in_oklab,var(--accent-hot)_20%,transparent)] text-[var(--accent-hot)]",
        ready:
          "border-[var(--accent-ready)] bg-[color-mix(in_oklab,var(--accent-ready)_16%,transparent)] text-[var(--accent-ready)]",
        warning:
          "border-[var(--accent-warm)] bg-[color-mix(in_oklab,var(--accent-warm)_18%,transparent)] text-[var(--accent-warm)]",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
