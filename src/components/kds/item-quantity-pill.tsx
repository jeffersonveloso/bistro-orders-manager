import { cn } from "@/src/lib/utils";

export function ItemQuantityPill({
  quantity,
  tone = "light",
  size = "default",
  className,
}: {
  quantity: number;
  tone?: "light" | "dark";
  size?: "compact" | "default";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center justify-between rounded-[1rem] border",
        size === "compact"
          ? "min-w-[4.8rem] gap-2 px-2.5 py-1.5"
          : "min-w-[5.4rem] gap-3 px-3 py-2",
        tone === "light"
          ? "border-[color-mix(in_oklab,var(--accent-hot)_28%,white)] bg-[color-mix(in_oklab,var(--accent-hot)_10%,white)] text-[var(--ink-strong)]"
          : "border-[color-mix(in_oklab,var(--accent-warm)_22%,white)] bg-[color-mix(in_oklab,var(--accent-warm)_18%,transparent)] text-white",
        className,
      )}
    >
      <span
        className={cn(
          "font-mono uppercase tracking-[0.24em]",
          size === "compact" ? "text-[9px]" : "text-[10px]",
          tone === "light" ? "text-[var(--ink-muted)]" : "text-white/60",
        )}
      >
        Qtd
      </span>
      <span
        className={cn(
          "font-display leading-none tracking-[0.06em]",
          size === "compact" ? "text-xl" : "text-2xl",
          tone === "light"
            ? "text-[var(--accent-hot)]"
            : "text-[color-mix(in_oklab,var(--accent-warm)_82%,white)]",
        )}
      >
        {quantity}
      </span>
    </div>
  );
}
