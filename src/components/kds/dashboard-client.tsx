"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  ChefHat,
  LayoutPanelTop,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useState } from "react";
import type { ComponentType } from "react";

import type { DashboardData } from "@/src/application/production-service";
import {
  canManageKitchen,
  getBoardQueryOptions,
  getDashboardInvalidationKeys,
  getProtectedSurfaceFeedback,
  hasAuthorizedOrderAccess,
  prioritizeKitchens,
} from "@/src/components/kds/production-client-contracts";
import {
  ProtectedSurfaceBanner,
  ProtectedSurfaceFallback,
} from "@/src/components/kds/protected-surface-feedback";
import { StatusBadge } from "@/src/components/kds/status-badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Separator } from "@/src/components/ui/separator";
import type { KitchenAreaId } from "@/src/domain/area-access";
import { fetchJson } from "@/src/lib/fetch-json";
import { cn } from "@/src/lib/utils";

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
    <span
      className={cn(
        "rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
        kind === "canceled"
          ? "border-[color-mix(in_oklab,var(--accent-hot)_48%,white)] bg-[color-mix(in_oklab,var(--accent-hot)_14%,white)] text-[var(--accent-hot)]"
          : "border-[color-mix(in_oklab,var(--accent-warm)_42%,white)] bg-[color-mix(in_oklab,var(--accent-warm)_12%,white)] text-[color-mix(in_oklab,var(--accent-warm)_82%,black)]",
      )}
      title={detail ?? undefined}
    >
      {label}
    </span>
  );
}

export function DashboardClient({
  activeKitchenId,
  initialData,
}: {
  activeKitchenId: KitchenAreaId;
  initialData?: DashboardData;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);

  const boardQuery = useQuery(getBoardQueryOptions(initialData));

  const ticketMutation = useMutation({
    mutationFn: async ({
      orderId,
      kitchenId,
      action,
    }: {
      orderId: string;
      kitchenId: KitchenAreaId;
      action: "start" | "complete";
    }) => {
      setBusyTicketId(`${orderId}:${kitchenId}`);

      return fetchJson(`/api/orders/${orderId}/tickets/${kitchenId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    },
    onSuccess: async (_, variables) => {
      const invalidationKeys = getDashboardInvalidationKeys(
        variables.orderId,
        variables.kitchenId,
      );

      await Promise.all(
        invalidationKeys.map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
    onSettled: () => {
      setBusyTicketId(null);
    },
  });
  const blockingAuthFeedback = getProtectedSurfaceFeedback(boardQuery.error);
  const actionAuthFeedback = getProtectedSurfaceFeedback(ticketMutation.error);

  if (boardQuery.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <Card className="w-full max-w-xl p-8 text-center">
          <p className="font-mono text-sm uppercase tracking-[0.28em] text-[var(--ink-muted)]">
            Carregando produção
          </p>
        </Card>
      </main>
    );
  }

  if (blockingAuthFeedback) {
    return <ProtectedSurfaceFallback feedback={blockingAuthFeedback} />;
  }

  if (boardQuery.isError || !boardQuery.data) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <Card className="w-full max-w-xl space-y-4 p-8 text-center">
          <p className="font-mono text-sm uppercase tracking-[0.28em] text-[var(--accent-hot)]">
            Falha ao carregar a cozinha
          </p>
          <Button onClick={() => boardQuery.refetch()}>Tentar novamente</Button>
        </Card>
      </main>
    );
  }

  const board = boardQuery.data;
  const prioritizedKitchens = prioritizeKitchens(board.kitchens, activeKitchenId);
  const activeKitchen =
    board.kitchens.find((kitchen) => kitchen.id === activeKitchenId) ?? null;

  function openTicket(orderId: string) {
    startTransition(() => {
      router.push(`/orders/${orderId}?kitchen=${activeKitchenId}`);
    });
  }

  return (
    <main className="min-h-screen px-4 py-4 md:px-6 md:py-6">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-6">
        <header className="grid gap-4 rounded-[2.2rem] border border-[var(--panel-border)] bg-[linear-gradient(135deg,rgba(252,245,233,0.92),rgba(255,255,255,0.88))] p-6 shadow-[0_24px_70px_rgba(34,30,25,0.12)] lg:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-[var(--panel-border-strong)] bg-[var(--accent-hot)]/20 px-3 py-1 font-mono text-xs uppercase tracking-[0.28em] text-[var(--accent-hot)]">
                Vó Ziluca
              </span>
              <span className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--ink-muted)]">
                Produção sincronizada
              </span>
              <span className="rounded-full border border-[var(--panel-border)] bg-white/70 px-3 py-1 font-mono text-xs uppercase tracking-[0.22em] text-[var(--ink-soft)]">
                Área ativa {activeKitchen?.name ?? activeKitchenId}
              </span>
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-5xl uppercase tracking-[0.08em] text-[var(--ink-strong)] md:text-7xl">
                Sync board para duas cozinhas
              </h1>
              <p className="max-w-3xl text-base text-[var(--ink-soft)] md:text-lg">
                Cada cozinha vê sua própria fila, acompanha o avanço da outra e
                fecha o pedido completo no mesmo ritmo.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard
              icon={ChefHat}
              label="Pedidos ativos"
              value={String(board.metrics.activeOrders)}
            />
            <MetricCard
              icon={Activity}
              label="Parcialmente prontos"
              value={String(board.metrics.partiallyReadyOrders)}
            />
            <MetricCard
              icon={LayoutPanelTop}
              label="Prontos para servir"
              value={String(board.metrics.readyToServeOrders)}
            />
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--ink-muted)]">
            Atualizado em{" "}
            {new Date(board.generatedAt).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              data-testid="refresh-board"
              variant="secondary"
              onClick={() => boardQuery.refetch()}
              disabled={boardQuery.isRefetching}
            >
              <RefreshCw
                className={cn("size-4", boardQuery.isRefetching && "animate-spin")}
              />
              Atualizar
            </Button>
          </div>
        </div>

        {actionAuthFeedback ? (
          <ProtectedSurfaceBanner feedback={actionAuthFeedback} />
        ) : null}

        {board.openSyncExceptions > 0 ? (
          <Card
            className="border-[color-mix(in_oklab,var(--accent-warm)_52%,white)] bg-[linear-gradient(135deg,color-mix(in_oklab,var(--accent-warm)_16%,white),rgba(255,255,255,0.96))] p-5"
            data-testid="board-sync-alerts"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[color-mix(in_oklab,var(--accent-warm)_84%,black)]">
                  <TriangleAlert className="size-5" />
                  <p className="font-display text-2xl uppercase tracking-[0.08em]">
                    {board.openSyncExceptions} exceção(ões) de sync ativa(s)
                  </p>
                </div>
                <p className="max-w-3xl text-sm leading-6 text-[var(--ink-soft)]">
                  O board continua estável, mas estes pedidos precisam de
                  conferência do salão ou atendimento antes da entrega final.
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 xl:grid-cols-2">
              {board.syncAlerts.map((alert) => (
                <div
                  className="rounded-[1.5rem] border border-[color-mix(in_oklab,var(--accent-warm)_40%,white)] bg-white/80 px-4 py-4"
                  data-testid={`sync-alert-${alert.id}`}
                  key={alert.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
                        {alert.reference}
                        {alert.customerName ? ` • ${alert.customerName}` : ""}
                      </p>
                      <p className="mt-1 text-base font-semibold text-[var(--ink-strong)]">
                        {alert.label}
                      </p>
                    </div>
                    <span className="rounded-full border border-[color-mix(in_oklab,var(--accent-warm)_48%,white)] bg-[color-mix(in_oklab,var(--accent-warm)_14%,white)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color-mix(in_oklab,var(--accent-warm)_82%,black)]">
                      {alert.statusLabel}
                    </span>
                  </div>

                  <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
                    {alert.summary}
                  </p>
                  {alert.detail ? (
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                      {alert.detail}
                    </p>
                  ) : null}
                  {hasAuthorizedOrderAccess(
                    board,
                    activeKitchenId,
                    alert.orderId,
                  ) ? (
                    <div className="mt-4">
                      <Button asChild size="sm" variant="secondary">
                        <Link href={`/orders/${alert.orderId}?kitchen=${activeKitchenId}`}>
                          Abrir pedido afetado
                          <ArrowUpRight className="size-4" />
                        </Link>
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        <section className="grid gap-5 xl:grid-cols-2">
          {prioritizedKitchens.map((kitchen) => {
            const isActionKitchen = canManageKitchen(activeKitchenId, kitchen.id);

            return (
            <Card
              className={cn(
                "overflow-hidden border-[var(--panel-border-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(249,244,235,0.98))]",
                isActionKitchen &&
                  "shadow-[0_20px_60px_rgba(34,30,25,0.12)] ring-1 ring-[color-mix(in_oklab,var(--accent-hot)_28%,transparent)]",
              )}
              key={kitchen.id}
            >
              <div className="flex items-end justify-between gap-4 border-b border-[var(--panel-border)] px-5 py-5">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--ink-muted)]">
                    {kitchen.description}
                  </p>
                  <h2 className="font-display text-4xl uppercase tracking-[0.08em] text-[var(--ink-strong)]">
                    {kitchen.name}
                  </h2>
                </div>
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em]",
                    isActionKitchen
                      ? "border-[var(--panel-border-strong)] bg-[var(--accent-hot)]/12 text-[var(--accent-hot)]"
                      : "border-[var(--panel-border)] bg-[var(--panel)] text-[var(--ink-muted)]",
                  )}
                >
                  {isActionKitchen ? "Sua operação" : "Somente leitura"}
                </span>
              </div>

              <div className="grid gap-4 p-4 md:grid-cols-2 2xl:grid-cols-4">
                {kitchen.columns.map((column) => (
                  <div className="flex min-h-[560px] flex-col gap-3" key={column.status}>
                    <div className="flex items-center justify-between rounded-[1.4rem] border border-[var(--panel-border)] bg-[var(--panel-elevated)] px-4 py-3">
                      <div>
                        <p className="font-display text-2xl uppercase tracking-[0.08em]">
                          {column.label}
                        </p>
                        <p className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                          {column.tickets.length} ticket(s)
                        </p>
                      </div>
                    </div>

                    <ScrollArea className="h-[520px] rounded-[1.6rem] border border-[var(--panel-border)] bg-[var(--panel)] p-1">
                      <div className="space-y-3 p-2">
                        {column.tickets.length === 0 ? (
                          <div className="rounded-[1.4rem] border border-dashed border-[var(--panel-border)] px-4 py-8 text-center text-sm text-[var(--ink-muted)]">
                            Nenhum pedido nesta coluna.
                          </div>
                        ) : (
                          column.tickets.map((ticket) => {
                            const busy =
                              busyTicketId === `${ticket.orderId}:${ticket.kitchenId}`;

                            return (
                              <div
                                className="w-full"
                                data-testid={`ticket-card-${ticket.ticketId}`}
                                key={ticket.ticketId}
                                onClick={
                                  isActionKitchen
                                    ? () => openTicket(ticket.orderId)
                                    : undefined
                                }
                                onKeyDown={
                                  isActionKitchen
                                    ? (event) => {
                                        if (
                                          event.key === "Enter" ||
                                          event.key === " "
                                        ) {
                                          event.preventDefault();
                                          openTicket(ticket.orderId);
                                        }
                                      }
                                    : undefined
                                }
                                role={isActionKitchen ? "button" : undefined}
                                tabIndex={isActionKitchen ? 0 : undefined}
                              >
                                <Card
                                  className={cn(
                                    "space-y-4 rounded-[1.6rem] border-[var(--panel-border)] bg-[rgba(255,255,255,0.9)] p-4 transition",
                                    isActionKitchen &&
                                      "hover:-translate-y-0.5 hover:border-[var(--panel-border-strong)] focus-within:border-[var(--panel-border-strong)]",
                                    isActionKitchen ? "cursor-pointer" : "cursor-default",
                                    ticket.hasOpenSyncException &&
                                      "border-[color-mix(in_oklab,var(--accent-warm)_52%,white)] bg-[color-mix(in_oklab,var(--accent-warm)_7%,white)]",
                                  )}
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <p className="font-mono text-xs uppercase tracking-[0.22em] text-[var(--ink-muted)]">
                                        {ticket.reference}
                                      </p>
                                      <h3 className="font-display text-3xl uppercase tracking-[0.08em] text-[var(--ink-strong)]">
                                        {ticket.customerName ?? "Sem nome"}
                                      </h3>
                                    </div>

                                    <div className="flex flex-col items-end gap-2">
                                      <StatusBadge
                                        label={ticket.ticketStatusLabel}
                                        status={ticket.ticketStatus}
                                      />
                                      <span className="font-mono text-xs uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                                        {ticket.ageLabel}
                                      </span>
                                    </div>
                                  </div>

                                  {ticket.hasOpenSyncException ? (
                                    <div
                                      className="flex items-start gap-3 rounded-[1.4rem] border border-[color-mix(in_oklab,var(--accent-warm)_45%,white)] bg-[color-mix(in_oklab,var(--accent-warm)_12%,white)] px-4 py-3"
                                      data-testid={`ticket-sync-marker-${ticket.ticketId}`}
                                    >
                                      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[color-mix(in_oklab,var(--accent-warm)_82%,black)]" />
                                      <div>
                                        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[color-mix(in_oklab,var(--accent-warm)_84%,black)]">
                                          {ticket.syncExceptionLabel}
                                        </p>
                                        {ticket.syncExceptionStatusLabel ? (
                                          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-soft)]">
                                            {ticket.syncExceptionStatusLabel}
                                          </p>
                                        ) : null}
                                      </div>
                                    </div>
                                  ) : null}

                                  <div className="space-y-2">
                                    {ticket.currentItems.map((item) => (
                                      (() => {
                                        const isCanceled =
                                          item.externalStatus?.kind === "canceled";

                                        return (
                                          <div
                                            className={cn(
                                              "flex items-center justify-between gap-3 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2",
                                              isCanceled &&
                                                "border-[color-mix(in_oklab,var(--accent-hot)_42%,white)] bg-[color-mix(in_oklab,var(--accent-hot)_8%,white)]",
                                            )}
                                            key={item.id}
                                          >
                                            <div>
                                              <p
                                                className={cn(
                                                  "text-sm font-semibold text-[var(--ink-strong)]",
                                                  isCanceled &&
                                                    "text-[var(--accent-hot)] line-through decoration-2",
                                                )}
                                              >
                                                {item.name}
                                              </p>
                                              <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                                                Qtde {item.quantity}
                                              </p>
                                              {item.externalStatus?.detail ? (
                                                <p
                                                  className={cn(
                                                    "mt-1 text-xs",
                                                    isCanceled
                                                      ? "text-[var(--accent-hot)]"
                                                      : "text-[color-mix(in_oklab,var(--accent-warm)_82%,black)]",
                                                  )}
                                                >
                                                  {item.externalStatus.detail}
                                                </p>
                                              ) : null}
                                            </div>
                                            <div className="flex flex-wrap items-center justify-end gap-2">
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
                                        );
                                      })()
                                    ))}
                                  </div>

                                  <Separator />

                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="space-y-1">
                                      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
                                        Andamento do pedido
                                      </p>
                                      <StatusBadge
                                        label={ticket.orderStatusLabel}
                                        status={ticket.orderStatus}
                                      />
                                      {ticket.otherKitchenStatus ? (
                                        <p className="text-xs text-[var(--ink-soft)]">
                                          {ticket.otherKitchenName}:{" "}
                                          <span className="font-semibold">
                                            {ticket.otherKitchenStatus}
                                          </span>
                                        </p>
                                      ) : (
                                        <p className="text-xs text-[var(--ink-soft)]">
                                          Sem dependência da outra cozinha.
                                        </p>
                                      )}
                                    </div>

                                    <div
                                      className="flex flex-wrap gap-2"
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      {ticket.ticketStatus === "canceled" ? (
                                        <div className="rounded-full border border-[color-mix(in_oklab,var(--accent-hot)_48%,white)] bg-[color-mix(in_oklab,var(--accent-hot)_14%,white)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-hot)]">
                                          Cancelado no provedor
                                        </div>
                                      ) : !isActionKitchen ? (
                                        <div className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]">
                                          Acompanhar sem ação
                                        </div>
                                      ) : ticket.ticketStatus !== "ready" ? (
                                        <>
                                          <Button
                                            data-testid={`ticket-action-${ticket.ticketId}`}
                                            disabled={busy}
                                            onClick={() =>
                                              ticketMutation.mutate({
                                                orderId: ticket.orderId,
                                                kitchenId: ticket.kitchenId,
                                                action:
                                                  ticket.ticketStatus === "new"
                                                    ? "start"
                                                    : "complete",
                                              })
                                            }
                                            size="sm"
                                            variant="secondary"
                                          >
                                            {ticket.ticketStatus === "new"
                                              ? "Iniciar cozinha"
                                              : "Concluir cozinha"}
                                          </Button>
                                        </>
                                      ) : (
                                        <Button disabled size="sm" variant="ghost">
                                          Cozinha concluída
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                </Card>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                ))}
              </div>
            </Card>
            );
          })}
        </section>
      </div>
    </main>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card className="rounded-[1.8rem] border-[var(--panel-border)] bg-[rgba(255,255,255,0.74)] p-4">
      <div className="mb-8 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
          {label}
        </span>
        <Icon className="size-4 text-[var(--accent-hot)]" />
      </div>
      <div className="font-display text-5xl uppercase tracking-[0.08em] text-[var(--ink-strong)]">
        {value}
      </div>
    </Card>
  );
}
