import { cn } from "@/src/lib/utils";

export function ItemObservationCallout({
  observation,
  tone = "light",
  size = "default",
  className,
}: {
  observation: string;
  tone?: "light" | "dark";
  size?: "compact" | "default";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.2rem] border",
        size === "compact" ? "px-3 py-2" : "px-3.5 py-3",
        tone === "light"
          ? "border-[color-mix(in_oklab,var(--accent-hot)_32%,white)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent-hot)_12%,white),rgba(255,255,255,0.94))] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]"
          : "border-[color-mix(in_oklab,var(--accent-warm)_26%,white)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent-warm)_16%,transparent),rgba(255,255,255,0.06))]",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 w-1 rounded-full",
            size === "compact" ? "h-9" : "h-11",
            tone === "light"
              ? "bg-[var(--accent-hot)]"
              : "bg-[color-mix(in_oklab,var(--accent-warm)_72%,white)]",
          )}
        />
        <div className="space-y-1">
          <p
            className={cn(
              "font-mono uppercase tracking-[0.22em]",
              size === "compact" ? "text-[9px]" : "text-[10px]",
              tone === "light"
                ? "text-[color-mix(in_oklab,var(--accent-hot)_76%,black)]"
                : "text-[color-mix(in_oklab,var(--accent-warm)_78%,white)]",
            )}
          >
            Observação
          </p>
          <p
            className={cn(
              "font-semibold leading-6",
              size === "compact" ? "text-xs" : "text-sm",
              tone === "light" ? "text-[var(--ink-strong)]" : "text-white/88",
            )}
          >
            {observation}
          </p>
        </div>
      </div>
    </div>
  );
}
