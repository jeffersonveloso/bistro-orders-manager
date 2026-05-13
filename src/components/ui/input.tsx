"use client";

import * as React from "react";

import { cn } from "@/src/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-2xl border border-[var(--panel-border)] bg-white/85 px-4 py-3 text-sm text-[var(--ink-strong)] shadow-sm outline-none transition placeholder:text-[var(--ink-muted)] focus-visible:border-[var(--panel-border-strong)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--accent-hot)_24%,transparent)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      type={type}
      {...props}
    />
  );
}

export { Input };
