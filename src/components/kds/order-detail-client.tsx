"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCheck,
  ChefHat,
  Eye,
  History,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";

import type { OrderDetailData } from "@/src/application/production-service";
import {
  getDashboardInvalidationKeys,
  getOrderDetailQueryOptions,
  getProtectedSurfaceFeedback,
} from "@/src/components/kds/production-client-contracts";
import {
  ProtectedSurfaceBanner,
  ProtectedSurfaceFallback,
} from "@/src/components/kds/protected-surface-feedback";
import { StatusBadge } from "@/src/components/kds/status-badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Separator } from "@/src/components/ui/separator";
import { getCanonicalAreaPath, type KitchenAreaId } from "@/src/domain/area-access";
import { fetchJson } from "@/src/lib/fetch-json";
import { cn } from "@/src/lib/utils";

function formatSyncTime(value: string) {
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
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

export function OrderDetailClient({
  orderId,
  kitchenId,
  initialData,
}: {
  orderId: string;
  kitchenId: KitchenAreaId;
  initialData?: OrderDetailData;
}) {
  const queryClient = useQueryClient();

  const orderQuery = useQuery(
    getOrderDetailQueryOptions({
      initialData,
      kitchenId,
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
    onSuccess: async (_, variables) => {
      const invalidationKeys = getDashboardInvalidationKeys(
        orderId,
        variables.currentKitchenId,
      );

      await Promise.all(
        invalidationKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });

  const itemMutation = useMutation({
    mutationFn: async ({
      itemId,
      status,
    }: {
      itemId: string;
      status: "in_preparation" | "ready";
    }) =>
      fetchJson(`/api/orders/${orderId}/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onSuccess: async () => {
      const invalidationKeys = getDashboardInvalidationKeys(orderId, kitchenId);

      await Promise.all(
        invalidationKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
  });
  const blockingAuthFeedback = getProtectedSurfaceFeedback(orderQuery.error);
  const actionAuthFeedback =
    getProtectedSurfaceFeedback(ticketMutation.error) ??
    getProtectedSurfaceFeedback(itemMutation.error);

  const data = orderQuery.data;

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
  const focusTicketState = {
    isCanceled: isCanceledTicketStatus(data.focusTicketStatus),
    allReady:
      focusActiveItems.length === 0 ||
      focusActiveItems.every((item) => item.status === "ready"),
    hasStarted:
      focusActiveItems.some((item) => item.status !== "new") ||
      data.focusItems.some((item) => item.externalStatus?.kind === "canceled"),
  };

  return (
    <main className="min-h-screen px-4 py-4 md:px-6 md:py-6">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-5">
        <header className="grid gap-4 rounded-[2.2rem] border border-[var(--panel-border)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(250,244,233,0.92))] p-6 shadow-[0_24px_70px_rgba(34,30,25,0.1)] lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-4">
            <Button asChild size="sm" variant="ghost">
              <Link href={getCanonicalAreaPath(kitchenId)}>
                <ArrowLeft className="size-4" />
                Voltar ao painel
              </Link>
            </Button>
            <div className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--ink-muted)]">
                {data.reference}
              </p>
              <h1 className="font-display text-5xl uppercase tracking-[0.08em] text-[var(--ink-strong)] md:text-7xl">
                {data.customerName ?? "Sem nome"}
              </h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <StatusBadge
                label={data.focusKitchenStatus}
                status={data.focusTicketStatus}
              />
              <StatusBadge label={data.orderStatus} status={data.orderStatusKey} />
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
                {data.focusKitchenName}
              </h2>
            </div>
            <div className="flex flex-wrap items-start justify-end gap-2">
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
              </div>
            </div>
          </Card>
        ) : null}

        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="space-y-5 rounded-[2rem] border-[var(--panel-border-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(249,244,235,0.98))] p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--ink-muted)]">
                  Seus itens em destaque
                </p>
                <h2 className="font-display text-4xl uppercase tracking-[0.08em] text-[var(--ink-strong)]">
                  {data.focusKitchenName}
                </h2>
              </div>
              <StatusBadge
                label={data.focusKitchenStatus}
                status={data.focusTicketStatus}
              />
            </div>

            <div className="space-y-3">
              {data.focusItems.map((item) => (
                (() => {
                  const isCanceled = item.externalStatus?.kind === "canceled";

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
                        <div className="space-y-1">
                          <p
                            className={cn(
                              "font-display text-3xl uppercase tracking-[0.08em] text-[var(--ink-strong)]",
                              isCanceled &&
                                "text-[var(--accent-hot)] line-through decoration-2",
                            )}
                          >
                            {item.name}
                          </p>
                          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
                            Quantidade {item.quantity}
                          </p>
                          {item.notes ? (
                            <p className="text-sm text-[var(--ink-soft)]">{item.notes}</p>
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
                              data-testid={`item-action-${item.id}`}
                              onClick={() =>
                                itemMutation.mutate({
                                  itemId: item.id,
                                  status: "in_preparation",
                                })
                              }
                              size="sm"
                              variant="secondary"
                            >
                              Iniciar
                            </Button>
                          ) : item.status === "in_preparation" ? (
                            <Button
                              data-testid={`item-action-${item.id}`}
                              onClick={() =>
                                itemMutation.mutate({
                                  itemId: item.id,
                                  status: "ready",
                                })
                              }
                              size="sm"
                            >
                              Marcar pronto
                            </Button>
                          ) : (
                            <Button disabled size="sm" variant="ghost">
                              Finalizado
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
                  {data.otherKitchen?.name ?? "Sem outra cozinha"}
                </h2>
              </div>
              {data.otherKitchen ? (
                <StatusBadge
                  label={data.otherKitchen.status}
                  status={data.otherKitchen.statusKey}
                />
              ) : null}
            </div>

            {data.otherKitchen ? (
              <div className="space-y-3">
                {data.otherKitchen.items.map((item) => (
                  (() => {
                    const isCanceled = item.externalStatus?.kind === "canceled";

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
                          <div>
                            <p
                              className={cn(
                                "text-base font-semibold",
                                isCanceled &&
                                  "text-[color-mix(in_oklab,var(--accent-hot)_80%,white)] line-through decoration-2",
                              )}
                            >
                              {item.name}
                            </p>
                            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-white/55">
                              Quantidade {item.quantity}
                            </p>
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
                        {item.notes ? (
                          <>
                            <Separator className="my-3 bg-white/10" />
                            <p className="text-sm text-white/70">{item.notes}</p>
                          </>
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
    </main>
  );
}
