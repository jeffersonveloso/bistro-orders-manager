"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCheck,
  ChefHat,
  Eye,
  EyeOff,
  History,
  ReceiptText,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type {
  OrderDetailData,
  OrderItemPresentation,
} from "@/src/application/production-service";
import { AreaSwitchButton } from "@/src/components/kds/area-switch-button";
import {
  boardQueryKey,
  getOrderDetailQueryOptions,
  getProtectedSurfaceFeedback,
  orderQueryRootKey,
  salonQueryKey,
} from "@/src/components/kds/production-client-contracts";
import {
  LocalCancelOrderDialog,
  normalizeLocalCancelReason,
} from "@/src/components/kds/local-cancel-order-dialog";
import {
  ProtectedSurfaceBanner,
  ProtectedSurfaceFallback,
} from "@/src/components/kds/protected-surface-feedback";
import {
  ReadyStatusRevertDialog,
  shouldConfirmReadyStatusRevert,
} from "@/src/components/kds/ready-status-revert-dialog";
import { ItemObservationCallout } from "@/src/components/kds/item-observation-callout";
import { ItemQuantityPill } from "@/src/components/kds/item-quantity-pill";
import { StatusBadge } from "@/src/components/kds/status-badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Separator } from "@/src/components/ui/separator";
import { getCanonicalAreaPath, type KitchenAreaId } from "@/src/domain/area-access";
import { fetchJson } from "@/src/lib/fetch-json";
import { localizeKitchenLabel } from "@/src/lib/kitchen-labels";
import { cn, formatOperationalTime } from "@/src/lib/utils";

function formatSyncTime(value: string) {
  return formatOperationalTime(value);
}

function getItemStatusLabel(status: "new" | "in_preparation" | "ready") {
  switch (status) {
    case "new":
      return "Novo";
    case "ready":
      return "Pronto";
    default:
      return "Em preparo";
  }
}

function isCanceledTicketStatus(status: OrderDetailData["focusTicketStatus"]) {
  return status === "canceled";
}

function ExternalItemStatusPill({
  detail,
  kind,
  label,
}: {
  detail?: string | null;
  kind: "canceled" | "changed";
  label: string;
}) {
  return (
    <div
      className={cn(
        "rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em]",
        kind === "canceled"
          ? "border-[color-mix(in_oklab,var(--accent-hot)_48%,white)] bg-[color-mix(in_oklab,var(--accent-hot)_14%,white)] text-[var(--accent-hot)]"
          : "border-[color-mix(in_oklab,var(--accent-warm)_44%,white)] bg-[color-mix(in_oklab,var(--accent-warm)_12%,white)] text-[color-mix(in_oklab,var(--accent-warm)_82%,black)]",
      )}
      title={detail ?? undefined}
    >
      {label}
    </div>
  );
}

function DetailMetaPill({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof UserRound;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-[var(--panel-border)] bg-white/78 px-3 py-2 text-sm text-[var(--ink-soft)]">
      <Icon className="size-4 text-[var(--accent-hot)]" />
      <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
        {label}
      </span>
      <span className="font-semibold text-[var(--ink-strong)]">{value}</span>
    </div>
  );
}

function getItemObservation(
  item: Pick<OrderItemPresentation, "notes" | "observation">,
) {
  return item.observation ?? item.notes;
}

function isReadyStatusRevertTarget(
  status: "new" | "in_preparation" | "ready",
): status is "new" | "in_preparation" {
  return status !== "ready";
}

export function OrderDetailClient({
  canAcknowledgeSyncExceptions = false,
  canForceLocalCancel = false,
  focusKitchenId,
  orderId,
  kitchenId,
  initialData,
  managedKitchenIds,
  returnTo,
}: {
  canAcknowledgeSyncExceptions?: boolean;
  canForceLocalCancel?: boolean;
  focusKitchenId?: KitchenAreaId;
  orderId: string;
  kitchenId: KitchenAreaId;
  initialData?: OrderDetailData;
  managedKitchenIds?: readonly KitchenAreaId[];
  returnTo?: string;
}) {
  const queryClient = useQueryClient();
  const resolvedFocusKitchenId = focusKitchenId ?? kitchenId;
  const resolvedManagedKitchenIds = managedKitchenIds ?? [resolvedFocusKitchenId];
  const [showOtherKitchen, setShowOtherKitchen] = useState(true);
  const [localCancelReason, setLocalCancelReason] = useState("");
  const [showLocalCancelDialog, setShowLocalCancelDialog] = useState(false);
  const [pendingReadyRevert, setPendingReadyRevert] = useState<{
    itemId: string;
    itemName: string;
    nextStatus: "new" | "in_preparation";
  } | null>(null);

  const orderQuery = useQuery(
    getOrderDetailQueryOptions({
      initialData,
      kitchenId: resolvedFocusKitchenId,
      orderId,
    }),
  );

  const ticketMutation = useMutation({
    mutationFn: async ({
      action,
      currentKitchenId,
    }: {
      action: "start" | "complete";
      currentKitchenId: KitchenAreaId;
    }) =>
      fetchJson(`/api/orders/${orderId}/tickets/${currentKitchenId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: boardQueryKey }),
        queryClient.invalidateQueries({
          queryKey: [...orderQueryRootKey, orderId],
        }),
        queryClient.invalidateQueries({ queryKey: salonQueryKey }),
      ]);
    },
  });

  const itemMutation = useMutation({
    mutationFn: async ({
      itemId,
      status,
    }: {
      itemId: string;
      status: "new" | "in_preparation" | "ready";
    }) =>
      fetchJson(`/api/orders/${orderId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onSuccess: async () => {
      setPendingReadyRevert(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: boardQueryKey }),
        queryClient.invalidateQueries({
          queryKey: [...orderQueryRootKey, orderId],
        }),
        queryClient.invalidateQueries({ queryKey: salonQueryKey }),
      ]);
    },
  });
  const localCancelMutation = useMutation({
    mutationFn: async (reason: string) =>
      fetchJson(`/api/orders/${orderId}/local-cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }),
    onSuccess: async () => {
      setLocalCancelReason("");
      setShowLocalCancelDialog(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: boardQueryKey }),
        queryClient.invalidateQueries({
          queryKey: [...orderQueryRootKey, orderId],
        }),
        queryClient.invalidateQueries({ queryKey: salonQueryKey }),
      ]);
    },
  });
  const acknowledgeSyncExceptionMutation = useMutation({
    mutationFn: async ({
      exceptionId,
      orderId,
    }: {
      exceptionId: string;
      orderId: string;
    }) =>
      fetchJson(
        `/api/orders/${orderId}/sync-exceptions/${exceptionId}/acknowledge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      ),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: boardQueryKey }),
        queryClient.invalidateQueries({
          queryKey: [...orderQueryRootKey, variables.orderId],
        }),
        queryClient.invalidateQueries({ queryKey: salonQueryKey }),
      ]);
    },
  });
  const applyChangedSyncExceptionMutation = useMutation({
    mutationFn: async ({
      exceptionId,
      orderId,
    }: {
      exceptionId: string;
      orderId: string;
    }) =>
      fetchJson(`/api/orders/${orderId}/sync-exceptions/${exceptionId}/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    onSuccess: async (_, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: boardQueryKey }),
        queryClient.invalidateQueries({
          queryKey: [...orderQueryRootKey, variables.orderId],
        }),
        queryClient.invalidateQueries({ queryKey: salonQueryKey }),
      ]);
    },
  });
  const blockingAuthFeedback = getProtectedSurfaceFeedback(orderQuery.error);
  const actionAuthFeedback =
    getProtectedSurfaceFeedback(ticketMutation.error) ??
    getProtectedSurfaceFeedback(itemMutation.error) ??
    getProtectedSurfaceFeedback(localCancelMutation.error) ??
    getProtectedSurfaceFeedback(applyChangedSyncExceptionMutation.error) ??
    getProtectedSurfaceFeedback(acknowledgeSyncExceptionMutation.error);

  const data = orderQuery.data;
  const confirmReadyRevert = () => {
    if (!pendingReadyRevert) {
      return;
    }

    itemMutation.mutate({
      itemId: pendingReadyRevert.itemId,
      status: pendingReadyRevert.nextStatus,
    });
  };
  const handleItemStatusChange = (
    item: Pick<OrderItemPresentation, "id" | "name" | "status">,
    nextStatus: "new" | "in_preparation" | "ready",
  ) => {
    if (
      shouldConfirmReadyStatusRevert(item.status, nextStatus) &&
      isReadyStatusRevertTarget(nextStatus)
    ) {
      setPendingReadyRevert({
        itemId: item.id,
        itemName: item.name,
        nextStatus,
      });
      return;
    }

    itemMutation.mutate({
      itemId: item.id,
      status: nextStatus,
    });
  };
  const confirmLocalCancel = () => {
    const normalizedReason = normalizeLocalCancelReason(localCancelReason);

    if (!normalizedReason) {
      return;
    }

    localCancelMutation.mutate(normalizedReason);
  };

  if (orderQuery.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <Card className="p-8">Carregando pedido...</Card>
      </main>
    );
  }

  if (blockingAuthFeedback) {
    return <ProtectedSurfaceFallback feedback={blockingAuthFeedback} />;
  }

  if (orderQuery.isError || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <Card className="space-y-4 p-8 text-center">
          <p className="font-mono text-sm uppercase tracking-[0.26em] text-[var(--accent-hot)]">
            Pedido indisponível
          </p>
          <Button onClick={() => orderQuery.refetch()}>Tentar novamente</Button>
        </Card>
      </main>
    );
  }

  const focusActiveItems = data.focusItems.filter(
    (item) => item.externalStatus?.kind !== "canceled",
  );
  const canSwitchToOtherKitchen =
    Boolean(data.otherKitchen) &&
    resolvedManagedKitchenIds.includes(data.otherKitchen!.id);
  const focusTicketState = {
    isCanceled: isCanceledTicketStatus(data.focusTicketStatus),
    allReady:
      focusActiveItems.length === 0 ||
      focusActiveItems.every((item) => item.status === "ready"),
    hasStarted:
      focusActiveItems.some((item) => item.status !== "new") ||
      data.focusItems.some((item) => item.externalStatus?.kind === "canceled"),
  };
  const showOverallOrderStatus =
    data.orderStatusKey !== data.focusTicketStatus || Boolean(data.otherKitchen);
  const otherKitchenOrderHref = data.otherKitchen
    ? (() => {
        const searchParams = new URLSearchParams({ kitchen: data.otherKitchen.id });

        if (returnTo) {
          searchParams.set("returnTo", returnTo);
        }

        return `/orders/${orderId}?${searchParams.toString()}`;
      })()
    : null;

  return (
    <main className="min-h-screen px-4 py-4 md:px-6 md:py-6">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-5">
        <header className="grid gap-4 rounded-[2.2rem] border border-[var(--panel-border)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(250,244,233,0.92))] p-6 shadow-[0_24px_70px_rgba(34,30,25,0.1)] lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm" variant="ghost">
                <Link
                  data-testid="order-detail-back-link"
                  href={returnTo ?? getCanonicalAreaPath(kitchenId)}
                >
                  <ArrowLeft className="size-4" />
                  Voltar ao painel
                </Link>
              </Button>
              <Button asChild data-testid="open-catalog-action" size="sm" variant="secondary">
                <Link href="/catalog">
                  Catálogo
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
              <div className="ml-2 pl-2">
                <AreaSwitchButton />
              </div>
            </div>
            <div className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--ink-muted)]">
                Pedido sincronizado
              </p>
              <h1 className="font-display text-5xl uppercase tracking-[0.08em] text-[var(--ink-strong)] md:text-7xl">
                {data.customerName ?? "Sem nome"}
              </h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <DetailMetaPill icon={UserRound} label="Garçom" value={data.waiterName ?? "Não informado"} />
              <DetailMetaPill icon={ReceiptText} label="Comanda" value={data.reference} />
            </div>
            <div className="flex flex-wrap gap-3">
              <StatusBadge
                label={data.focusKitchenStatus}
                status={data.focusTicketStatus}
              />
              {showOverallOrderStatus ? (
                <StatusBadge
                  label={data.orderStatus}
                  status={data.orderStatusKey}
                />
              ) : null}
            </div>
          </div>

          <Card className="grid gap-4 rounded-[1.8rem] border-[var(--panel-border-strong)] bg-[var(--ink-strong)] p-5 text-white shadow-none sm:grid-cols-2">
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-white/55">
                  Foco
                </p>
              <h2
                className="font-display text-4xl uppercase tracking-[0.08em]"
                data-testid="focus-kitchen-name"
              >
                {localizeKitchenLabel(data.focusKitchenName)}
              </h2>
            </div>
            <div className="flex flex-wrap items-start justify-end gap-2">
              {canForceLocalCancel &&
              !data.localCancellation &&
              data.orderStatusKey !== "canceled" ? (
                <Button
                  data-testid="order-local-cancel-action"
                  onClick={() => setShowLocalCancelDialog(true)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Retirar do fluxo
                </Button>
              ) : null}
              {!focusTicketState.isCanceled && !focusTicketState.hasStarted && (
                <Button
                  data-testid={`start-kitchen-${data.focusKitchenId}`}
                  onClick={() =>
                    ticketMutation.mutate({
                      action: "start",
                      currentKitchenId: data.focusKitchenId,
                    })
                  }
                  size="sm"
                  variant="secondary"
                >
                  <ChefHat className="size-4" />
                  Iniciar cozinha
                </Button>
              )}
              {!focusTicketState.isCanceled && !focusTicketState.allReady && (
                <Button
                  data-testid={`complete-kitchen-${data.focusKitchenId}`}
                  onClick={() =>
                    ticketMutation.mutate({
                      action: "complete",
                      currentKitchenId: data.focusKitchenId,
                    })
                  }
                  size="sm"
                >
                  <CheckCheck className="size-4" />
                  Concluir cozinha
                </Button>
              )}
              {focusTicketState.isCanceled ? (
                <div className="rounded-full border border-[color-mix(in_oklab,var(--accent-hot)_48%,white)] bg-[color-mix(in_oklab,var(--accent-hot)_14%,white)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-hot)]">
                  Produção bloqueada
                </div>
              ) : null}
            </div>
          </Card>
        </header>

        {actionAuthFeedback ? (
          <ProtectedSurfaceBanner feedback={actionAuthFeedback} />
        ) : null}

        {data.localCancellation ? (
          <Card
            className="border-[color-mix(in_oklab,var(--accent-hot)_48%,white)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent-hot)_12%,white),rgba(255,255,255,0.96))] p-5"
            data-testid="local-cancel-banner"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-4xl space-y-2">
                <div className="flex items-center gap-2 text-[var(--accent-hot)]">
                  <TriangleAlert className="size-5" />
                  <p className="font-display text-2xl uppercase tracking-[0.08em]">
                    {data.localCancellation.label}
                  </p>
                </div>
                <p className="text-base font-semibold text-[var(--ink-strong)]">
                  {data.localCancellation.reason}
                </p>
                <p className="text-sm leading-6 text-[var(--ink-soft)]">
                  {data.localCancellation.detail}
                </p>
              </div>

              <div className="rounded-[1.4rem] border border-[color-mix(in_oklab,var(--accent-hot)_40%,white)] bg-white/72 px-4 py-3 text-right">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                  Ação manual
                </p>
                <p className="mt-1 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent-hot)]">
                  {data.localCancellation.actor}
                </p>
                <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                  {formatSyncTime(data.localCancellation.canceledAt)}
                </p>
              </div>
            </div>
          </Card>
        ) : null}

        {data.syncException ? (
          <Card
            className="border-[color-mix(in_oklab,var(--accent-warm)_48%,white)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent-warm)_12%,white),rgba(255,255,255,0.96))] p-5"
            data-testid="sync-exception-banner"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-4xl space-y-2">
                <div className="flex items-center gap-2 text-[color-mix(in_oklab,var(--accent-warm)_84%,black)]">
                  <TriangleAlert className="size-5" />
                  <p className="font-display text-2xl uppercase tracking-[0.08em]">
                    {data.syncException.label}
                  </p>
                </div>
                <p className="text-base font-semibold text-[var(--ink-strong)]">
                  {data.syncException.summary}
                </p>
                {data.syncException.detail ? (
                  <p className="text-sm leading-6 text-[var(--ink-soft)]">
                    {data.syncException.detail}
                  </p>
                ) : null}
              </div>

              <div className="rounded-[1.4rem] border border-[color-mix(in_oklab,var(--accent-warm)_40%,white)] bg-white/70 px-4 py-3 text-right">
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                  Estado atual
                </p>
                <p className="mt-1 text-sm font-semibold uppercase tracking-[0.16em] text-[color-mix(in_oklab,var(--accent-warm)_82%,black)]">
                  {data.syncException.statusLabel}
                </p>
                <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                  Última leitura {formatSyncTime(data.syncException.lastSeenAt)}
                </p>
                {canAcknowledgeSyncExceptions &&
                data.syncException.kind === "changed_externally" &&
                data.syncException.status !== "resolved" ? (
                  <div className="mt-3">
                    <Button
                      data-testid="order-sync-apply-action"
                      disabled={applyChangedSyncExceptionMutation.isPending}
                      onClick={() =>
                        applyChangedSyncExceptionMutation.mutate({
                          exceptionId: data.syncException!.id,
                          orderId,
                        })
                      }
                      size="sm"
                      type="button"
                    >
                      Aplicar alteração
                    </Button>
                  </div>
                ) : canAcknowledgeSyncExceptions &&
                  data.syncException.status === "open" ? (
                  <div className="mt-3">
                    <Button
                      data-testid="order-sync-acknowledge-action"
                      disabled={acknowledgeSyncExceptionMutation.isPending}
                      onClick={() =>
                        acknowledgeSyncExceptionMutation.mutate({
                          exceptionId: data.syncException!.id,
                          orderId,
                        })
                      }
                      size="sm"
                      type="button"
                    >
                      Marcar como ciente
                    </Button>
                  </div>
                ) : data.syncException.status === "open" ? (
                  <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                    Pendência para a gestão
                  </p>
                ) : null}
              </div>
            </div>
          </Card>
        ) : null}

        <section
          className={cn(
            "grid gap-5",
            data.otherKitchen && showOtherKitchen && "xl:grid-cols-[1.15fr_0.85fr]",
          )}
        >
          <Card className="space-y-5 rounded-[2rem] border-[var(--panel-border-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(249,244,235,0.98))] p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--ink-muted)]">
                  Seus itens em destaque
                </p>
                <h2 className="font-display text-4xl uppercase tracking-[0.08em] text-[var(--ink-strong)]">
                  {localizeKitchenLabel(data.focusKitchenName)}
                </h2>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <StatusBadge
                  label={data.focusKitchenStatus}
                  status={data.focusTicketStatus}
                />
                {data.otherKitchen ? (
                  <Button
                    data-testid="order-detail-toggle-other-kitchen"
                    onClick={() => setShowOtherKitchen((current) => !current)}
                    size="sm"
                    variant={showOtherKitchen ? "default" : "secondary"}
                  >
                    {showOtherKitchen ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                    {showOtherKitchen
                      ? "Ocultar outra cozinha"
                      : "Mostrar outra cozinha"}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="space-y-3">
              {data.focusItems.map((item) => (
                (() => {
                  const isCanceled = item.externalStatus?.kind === "canceled";
                  const observation = getItemObservation(item);
                  const isUpdatingItem =
                    itemMutation.isPending &&
                    itemMutation.variables?.itemId === item.id;

                  return (
                    <Card
                      className={cn(
                        "rounded-[1.6rem] border-[var(--panel-border)] bg-[rgba(255,255,255,0.92)] p-4",
                        isCanceled &&
                          "border-[color-mix(in_oklab,var(--accent-hot)_42%,white)] bg-[color-mix(in_oklab,var(--accent-hot)_7%,white)]",
                      )}
                      data-testid={`focus-item-${item.id}`}
                      key={item.id}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-3">
                          <p
                            className={cn(
                              "font-display text-3xl uppercase tracking-[0.08em] text-[var(--ink-strong)]",
                              isCanceled &&
                                "text-[var(--accent-hot)] line-through decoration-2",
                            )}
                          >
                            {item.name}
                          </p>
                          <ItemQuantityPill quantity={item.quantity} />
                          {observation ? (
                            <ItemObservationCallout
                              observation={observation}
                              size="default"
                              tone="light"
                            />
                          ) : null}
                          {item.externalStatus?.detail ? (
                            <p
                              className={cn(
                                "text-sm",
                                isCanceled
                                  ? "text-[var(--accent-hot)]"
                                  : "text-[color-mix(in_oklab,var(--accent-warm)_82%,black)]",
                              )}
                            >
                              {item.externalStatus.detail}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {item.externalStatus ? (
                            <ExternalItemStatusPill
                              detail={item.externalStatus.detail}
                              kind={item.externalStatus.kind}
                              label={item.externalStatus.label}
                            />
                          ) : null}
                          {!isCanceled ? (
                            <StatusBadge
                              label={getItemStatusLabel(item.status)}
                              status={item.status}
                            />
                          ) : null}
                          {isCanceled ? (
                            <Button disabled size="sm" variant="ghost">
                              Sem ação
                            </Button>
                          ) : item.status === "new" ? (
                            <Button
                              data-testid={`item-action-start-${item.id}`}
                              disabled={isUpdatingItem}
                              onClick={() =>
                                handleItemStatusChange(item, "in_preparation")
                              }
                              size="sm"
                              variant="secondary"
                            >
                              Iniciar
                            </Button>
                          ) : item.status === "in_preparation" ? (
                            <>
                              <Button
                                data-testid={`item-action-back-to-new-${item.id}`}
                                disabled={isUpdatingItem}
                                onClick={() =>
                                  handleItemStatusChange(item, "new")
                                }
                                size="sm"
                                variant="ghost"
                              >
                                Voltar para novo
                              </Button>
                              <Button
                                data-testid={`item-action-mark-ready-${item.id}`}
                                disabled={isUpdatingItem}
                                onClick={() =>
                                  handleItemStatusChange(item, "ready")
                                }
                                size="sm"
                              >
                                Marcar pronto
                              </Button>
                            </>
                          ) : (
                            <Button
                              data-testid={`item-action-back-to-preparation-${item.id}`}
                              disabled={isUpdatingItem}
                              onClick={() =>
                                handleItemStatusChange(item, "in_preparation")
                              }
                              size="sm"
                              variant="secondary"
                            >
                              Voltar para preparo
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })()
              ))}
            </div>
          </Card>

          {data.otherKitchen && showOtherKitchen ? (
            <Card
              className="space-y-5 rounded-[2rem] border-[var(--panel-border-strong)] bg-[linear-gradient(180deg,rgba(21,25,29,0.98),rgba(29,33,36,0.98))] p-5 text-white"
              data-testid="other-kitchen-panel"
            >
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-white/55">
                  Outra cozinha
                </p>
                <h2
                  className="font-display text-4xl uppercase tracking-[0.08em]"
                  data-testid="other-kitchen-name"
                >
                  {data.otherKitchen
                    ? localizeKitchenLabel(data.otherKitchen.name)
                    : "Sem outra cozinha"}
                </h2>
              </div>
              {data.otherKitchen ? (
                <div className="flex flex-wrap items-center gap-2">
                  {canSwitchToOtherKitchen && otherKitchenOrderHref ? (
                    <Button asChild size="sm" variant="secondary">
                      <Link href={otherKitchenOrderHref}>
                        Operar esta cozinha
                        <ArrowUpRight className="size-4" />
                      </Link>
                    </Button>
                  ) : null}
                  <StatusBadge
                    label={data.otherKitchen.status}
                    status={data.otherKitchen.statusKey}
                  />
                </div>
              ) : null}
            </div>

            {data.otherKitchen ? (
              <div className="space-y-3">
                {data.otherKitchen.items.map((item) => (
                  (() => {
                    const isCanceled = item.externalStatus?.kind === "canceled";
                    const observation = getItemObservation(item);

                    return (
                      <div
                        className={cn(
                          "rounded-[1.5rem] border border-white/10 bg-white/6 px-4 py-3",
                          isCanceled &&
                            "border-[color-mix(in_oklab,var(--accent-hot)_42%,white)] bg-[color-mix(in_oklab,var(--accent-hot)_14%,transparent)]",
                        )}
                        key={item.id}
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="space-y-3">
                            <p
                              className={cn(
                                "text-base font-semibold",
                                isCanceled &&
                                  "text-[color-mix(in_oklab,var(--accent-hot)_80%,white)] line-through decoration-2",
                              )}
                            >
                              {item.name}
                            </p>
                          <ItemQuantityPill quantity={item.quantity} tone="dark" />
                            {item.externalStatus?.detail ? (
                              <p
                                className={cn(
                                  "mt-2 text-sm",
                                  isCanceled
                                    ? "text-[color-mix(in_oklab,var(--accent-hot)_78%,white)]"
                                    : "text-[color-mix(in_oklab,var(--accent-warm)_60%,white)]",
                                )}
                              >
                                {item.externalStatus.detail}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {item.externalStatus ? (
                              <ExternalItemStatusPill
                                detail={item.externalStatus.detail}
                                kind={item.externalStatus.kind}
                                label={item.externalStatus.label}
                              />
                            ) : null}
                            {!isCanceled ? (
                              <StatusBadge
                                label={getItemStatusLabel(item.status)}
                                status={item.status}
                              />
                            ) : null}
                          </div>
                        </div>
                        {observation ? (
                          <ItemObservationCallout
                            className="mt-3"
                            observation={observation}
                            size="default"
                            tone="dark"
                          />
                        ) : null}
                      </div>
                    );
                  })()
                ))}
              </div>
            ) : (
              <div className="rounded-[1.6rem] border border-dashed border-white/12 px-4 py-8 text-center text-sm text-white/60">
                Este pedido pertence somente a esta cozinha.
              </div>
            )}

            <Separator className="bg-white/10" />

            <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Eye className="size-4 text-white/55" />
                <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-white/55">
                  Leitura operacional
                </p>
              </div>
              <p className="text-sm leading-6 text-white/75">
                O pedido só sai completo quando a sua cozinha e a outra cozinha
                estiverem alinhadas em status final.
              </p>
            </div>
            </Card>
          ) : null}
        </section>

        {data.syncTrail.length > 0 ? (
          <Card
            className="rounded-[2rem] border-[var(--panel-border-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(249,244,235,0.98))] p-5"
            data-testid="sync-trail-panel"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <History className="size-4 text-[var(--ink-muted)]" />
                  <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--ink-muted)]">
                    Trilha mínima de sync
                  </p>
                </div>
                <h2 className="mt-2 font-display text-3xl uppercase tracking-[0.08em] text-[var(--ink-strong)]">
                  O que mudou no provedor
                </h2>
              </div>
            </div>

            <div className="mt-5 grid gap-3">
              {data.syncTrail.map((entry) => (
                <div
                  className="rounded-[1.5rem] border border-[var(--panel-border)] bg-white/80 px-4 py-4"
                  data-testid={`sync-trail-entry-${entry.id}`}
                  key={entry.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold text-[var(--ink-strong)]">
                        {entry.label}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                        {entry.summary}
                      </p>
                      {entry.detail ? (
                        <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                          {entry.detail}
                        </p>
                      ) : null}
                    </div>

                    <div className="text-right">
                      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                        {formatSyncTime(entry.occurredAt)}
                      </p>
                      {entry.actor ? (
                        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-soft)]">
                          {entry.actor}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
      <LocalCancelOrderDialog
        isOpen={showLocalCancelDialog}
        isPending={localCancelMutation.isPending}
        onCancel={() => {
          if (!localCancelMutation.isPending) {
            setShowLocalCancelDialog(false);
            setLocalCancelReason("");
          }
        }}
        onConfirm={confirmLocalCancel}
        onReasonChange={setLocalCancelReason}
        order={{
          customerName: data.customerName,
          focusKitchenName: data.focusKitchenName,
          focusTicketStatus: data.focusTicketStatus,
          focusTicketStatusLabel: data.focusKitchenStatus,
          orderStatus: data.orderStatusKey,
          orderStatusLabel: data.orderStatus,
          reference: data.reference,
        }}
        reason={localCancelReason}
      />
      <ReadyStatusRevertDialog
        isOpen={Boolean(pendingReadyRevert)}
        isPending={
          itemMutation.isPending &&
          itemMutation.variables?.itemId === pendingReadyRevert?.itemId
        }
        itemName={pendingReadyRevert?.itemName ?? ""}
        nextStatus={pendingReadyRevert?.nextStatus ?? "in_preparation"}
        onCancel={() => setPendingReadyRevert(null)}
        onConfirm={confirmReadyRevert}
      />
    </main>
  );
}
