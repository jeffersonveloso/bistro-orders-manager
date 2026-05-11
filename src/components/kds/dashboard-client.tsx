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
import { StatusBadge } from "@/src/components/kds/status-badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Separator } from "@/src/components/ui/separator";
import { fetchJson } from "@/src/lib/fetch-json";
import { cn } from "@/src/lib/utils";

async function fetchBoard() {
  return fetchJson<DashboardData>("/api/board");
}

export function DashboardClient({
  initialData,
}: {
  initialData?: DashboardData;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busyTicketId, setBusyTicketId] = useState<string | null>(null);

  const boardQuery = useQuery({
    queryKey: ["board"],
    queryFn: fetchBoard,
    initialData,
    refetchInterval: 4_000,
    refetchIntervalInBackground: true,
  });

  const ticketMutation = useMutation({
    mutationFn: async ({
      orderId,
      kitchenId,
      action,
    }: {
      orderId: string;
      kitchenId: string;
      action: "start" | "complete";
    }) => {
      setBusyTicketId(`${orderId}:${kitchenId}`);

      return fetchJson(`/api/orders/${orderId}/tickets/${kitchenId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["board"] }),
        queryClient.invalidateQueries({ queryKey: ["order"] }),
      ]);
    },
    onSettled: () => {
      setBusyTicketId(null);
    },
  });

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

  function openTicket(orderId: string, kitchenId: string) {
    startTransition(() => {
      router.push(`/orders/${orderId}?kitchen=${kitchenId}`);
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
            <Button asChild data-testid="open-salon-view" variant="secondary">
              <Link href="/salon">
                Visão do salão
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>

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
                </div>
              ))}
            </div>
          </Card>
        ) : null}

        <section className="grid gap-5 xl:grid-cols-2">
          {board.kitchens.map((kitchen) => (
            <Card
              className="overflow-hidden border-[var(--panel-border-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(249,244,235,0.98))]"
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
              </div>

              <div className="grid gap-4 p-4 md:grid-cols-3">
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
                                onClick={() =>
                                  openTicket(ticket.orderId, ticket.kitchenId)
                                }
                                onKeyDown={(event) => {
                                  if (event.key === "Enter" || event.key === " ") {
                                    event.preventDefault();
                                    openTicket(ticket.orderId, ticket.kitchenId);
                                  }
                                }}
                                role="button"
                                tabIndex={0}
                              >
                                <Card
                                  className={cn(
                                    "space-y-4 rounded-[1.6rem] border-[var(--panel-border)] bg-[rgba(255,255,255,0.9)] p-4 transition hover:-translate-y-0.5 hover:border-[var(--panel-border-strong)] focus-within:border-[var(--panel-border-strong)]",
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
                                      <div
                                        className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2"
                                        key={item.id}
                                      >
                                        <div>
                                          <p className="text-sm font-semibold text-[var(--ink-strong)]">
                                            {item.name}
                                          </p>
                                          <p className="font-mono text-xs uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                                            Qtde {item.quantity}
                                          </p>
                                        </div>
                                        <StatusBadge
                                          label={
                                            item.status === "new"
                                              ? "Novo"
                                              : item.status === "ready"
                                                ? "Pronto"
                                                : "Em preparo"
                                          }
                                          status={item.status}
                                        />
                                      </div>
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
                                      {ticket.ticketStatus !== "ready" ? (
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
          ))}
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
