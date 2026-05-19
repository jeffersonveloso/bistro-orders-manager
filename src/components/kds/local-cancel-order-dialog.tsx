"use client";

import { TriangleAlert } from "lucide-react";

import type {
  BoardTicketCard,
  OrderDetailData,
} from "@/src/application/production-service";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { StatusBadge } from "@/src/components/kds/status-badge";

type CancelableOrderPresentation = Pick<
  BoardTicketCard,
  "customerName" | "orderStatus" | "orderStatusLabel" | "reference"
> & {
  focusKitchenName: string;
  focusTicketStatus: BoardTicketCard["ticketStatus"] | OrderDetailData["focusTicketStatus"];
  focusTicketStatusLabel: BoardTicketCard["ticketStatusLabel"] | OrderDetailData["focusKitchenStatus"];
};

export function normalizeLocalCancelReason(value: string) {
  const normalizedValue = value.trim();

  return normalizedValue.length > 0 ? normalizedValue : null;
}

export function LocalCancelOrderDialog({
  isOpen,
  isPending = false,
  onCancel,
  onConfirm,
  onReasonChange,
  order,
  reason,
}: {
  isOpen: boolean;
  isPending?: boolean;
  onCancel(): void;
  onConfirm(): void;
  onReasonChange(value: string): void;
  order: CancelableOrderPresentation;
  reason: string;
}) {
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(24,22,19,0.62)] px-4 py-6 backdrop-blur-sm"
      data-testid="local-cancel-order-dialog"
      role="presentation"
    >
      <Card
        aria-describedby="local-cancel-order-description"
        aria-labelledby="local-cancel-order-title"
        aria-modal="true"
        className="w-full max-w-2xl space-y-5 border-[color-mix(in_oklab,var(--accent-hot)_28%,white)] bg-[rgba(255,255,255,0.98)] p-6 shadow-[0_28px_90px_rgba(24,22,19,0.28)]"
        role="dialog"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-3 text-[var(--accent-hot)]">
            <TriangleAlert className="size-5" />
            <p className="font-mono text-[11px] uppercase tracking-[0.24em]">
              Gerência / administração
            </p>
          </div>
          <div className="space-y-2">
            <h2
              className="font-display text-3xl uppercase tracking-[0.08em] text-[var(--ink-strong)]"
              id="local-cancel-order-title"
            >
              Retirar pedido do fluxo
            </h2>
            <p
              className="text-sm leading-6 text-[var(--ink-soft)]"
              id="local-cancel-order-description"
            >
              Use esta ação apenas quando o cancelamento do provedor não chegar
              e o pedido precisar sair imediatamente da operação.
            </p>
          </div>
        </div>

        <div className="rounded-[1.6rem] border border-[var(--panel-border)] bg-white/82 p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
            Pedido afetado
          </p>
          <p className="mt-2 font-display text-2xl uppercase tracking-[0.08em] text-[var(--ink-strong)]">
            {order.customerName ?? "Sem nome"} • {order.reference}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <StatusBadge
              label={order.focusTicketStatusLabel}
              status={order.focusTicketStatus}
            />
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
              {order.focusKitchenName}
            </span>
            <StatusBadge label={order.orderStatusLabel} status={order.orderStatus} />
          </div>
        </div>

        <label className="block space-y-2">
          <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
            Motivo obrigatório
          </span>
          <textarea
            className="min-h-28 w-full resize-y rounded-[1.4rem] border border-[var(--panel-border-strong)] bg-white px-4 py-3 text-sm leading-6 text-[var(--ink-strong)] outline-none transition placeholder:text-[var(--ink-muted)] focus:border-[var(--accent-hot)] focus:ring-4 focus:ring-[var(--ring-strong)]"
            data-testid="local-cancel-order-reason"
            onChange={(event) => onReasonChange(event.target.value)}
            placeholder="Ex.: cancelado pelo cliente, webhook de cancelamento não recebido."
            value={reason}
          />
        </label>

        <div className="flex flex-wrap justify-end gap-3">
          <Button
            data-testid="local-cancel-order-keep"
            onClick={onCancel}
            size="sm"
            type="button"
            variant="secondary"
          >
            Manter no fluxo
          </Button>
          <Button
            data-testid="local-cancel-order-confirm"
            disabled={isPending || !normalizeLocalCancelReason(reason)}
            onClick={onConfirm}
            size="sm"
            type="button"
          >
            Confirmar retirada
          </Button>
        </div>
      </Card>
    </div>
  );
}
