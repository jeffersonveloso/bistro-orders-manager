"use client";

import { TriangleAlert } from "lucide-react";

import { StatusBadge } from "@/src/components/kds/status-badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { ITEM_STATUS_LABELS, type ItemStatus } from "@/src/domain/production";

export function shouldConfirmReadyStatusRevert(
  currentStatus: ItemStatus,
  nextStatus: ItemStatus,
) {
  return currentStatus === "ready" && nextStatus !== "ready";
}

export function ReadyStatusRevertDialog({
  isOpen,
  isPending = false,
  itemName,
  nextStatus,
  onCancel,
  onConfirm,
}: {
  isOpen: boolean;
  isPending?: boolean;
  itemName: string;
  nextStatus: Extract<ItemStatus, "new" | "in_preparation">;
  onCancel(): void;
  onConfirm(): void;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(24,22,19,0.62)] px-4 py-6 backdrop-blur-sm"
      data-testid="ready-status-revert-dialog"
      role="presentation"
    >
      <Card
        aria-describedby="ready-status-revert-description"
        aria-labelledby="ready-status-revert-title"
        aria-modal="true"
        className="w-full max-w-xl space-y-5 border-[color-mix(in_oklab,var(--accent-hot)_28%,white)] bg-[rgba(255,255,255,0.98)] p-6 shadow-[0_28px_90px_rgba(24,22,19,0.28)]"
        role="dialog"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-[var(--accent-hot)]">
            <TriangleAlert className="size-5" />
            <p className="font-mono text-[11px] uppercase tracking-[0.24em]">
              Confirmação operacional
            </p>
          </div>
          <div className="space-y-2">
            <h2
              className="font-display text-3xl uppercase tracking-[0.08em] text-[var(--ink-strong)]"
              id="ready-status-revert-title"
            >
              Reverter item pronto
            </h2>
            <p
              className="text-sm leading-6 text-[var(--ink-soft)]"
              id="ready-status-revert-description"
            >
              Este item já foi marcado como pronto. Confirme a reversão para
              evitar cliques acidentais na operação.
            </p>
          </div>
        </div>

        <div className="rounded-[1.6rem] border border-[var(--panel-border)] bg-white/82 p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
            Item afetado
          </p>
          <p className="mt-2 font-display text-2xl uppercase tracking-[0.08em] text-[var(--ink-strong)]">
            {itemName}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <StatusBadge label={ITEM_STATUS_LABELS.ready} status="ready" />
            <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
              para
            </span>
            <StatusBadge
              label={ITEM_STATUS_LABELS[nextStatus]}
              status={nextStatus}
            />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <Button
            data-testid="ready-status-revert-cancel"
            onClick={onCancel}
            size="sm"
            type="button"
            variant="secondary"
          >
            Manter como pronto
          </Button>
          <Button
            data-testid="ready-status-revert-confirm"
            disabled={isPending}
            onClick={onConfirm}
            size="sm"
            type="button"
          >
            Confirmar retorno
          </Button>
        </div>
      </Card>
    </div>
  );
}
