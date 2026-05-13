import type { HTMLAttributes } from "react";

import { cn } from "@/src/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[2rem] border border-[var(--panel-border)] bg-[var(--panel)] shadow-[0_18px_40px_rgba(15,23,42,0.12)]",
        className,
      )}
      {...props}
    />
  );
}
