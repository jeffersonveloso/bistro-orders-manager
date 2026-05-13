"use client";

import { LogOut, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";

import { Button, type ButtonProps } from "@/src/components/ui/button";

export function AreaSwitchButton({
  label = "Trocar area",
  size = "sm",
  variant = "secondary",
}: {
  label?: string;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleClick() {
    if (isPending) {
      return;
    }

    setIsPending(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/access/logout", {
        cache: "no-store",
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("logout_failed");
      }

      startTransition(() => {
        router.replace("/access?reason=signed_out&mode=switch");
        router.refresh();
      });
    } catch {
      setErrorMessage(
        "Nao foi possivel encerrar a sessao agora. Tente novamente nesta estacao.",
      );
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        data-testid="switch-area-action"
        disabled={isPending}
        onClick={handleClick}
        size={size}
        type="button"
        variant={variant}
      >
        {isPending ? (
          <RefreshCw className="size-4 animate-spin" />
        ) : (
          <LogOut className="size-4" />
        )}
        {label}
      </Button>
      {errorMessage ? (
        <p className="max-w-64 text-right text-xs leading-5 text-[var(--accent-hot)]">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
