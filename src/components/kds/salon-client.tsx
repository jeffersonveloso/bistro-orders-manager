"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCheck,
  Eye,
  EyeOff,
  ReceiptText,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { useState } from "react";

import type { SalonData } from "@/src/application/production-service";
import { AreaSwitchButton } from "@/src/components/kds/area-switch-button";
import {
  getProtectedSurfaceFeedback,
  getSalonInvalidationKeys,
  getSalonQueryOptions,
} from "@/src/components/kds/production-client-contracts";
import {
  ProtectedSurfaceBanner,
  ProtectedSurfaceFallback,
} from "@/src/components/kds/protected-surface-feedback";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { fetchJson } from "@/src/lib/fetch-json";
import { formatOperationalTime } from "@/src/lib/utils";

const maxSalonOrdersPerSection = 15;

type SalonLaneKey = "in_preparation" | "ready";
type SalonOrder = SalonData["summary"][number];

function getSalonStatusPresentation(orderStatus: string) {
  switch (orderStatus) {
    case "Novo":
      return {
        label: "Recebido",
        description: "Pedido entrou na fila e aguarda início da produção.",
        className:
          "border-[var(--panel-border-strong)] bg-[var(--panel-elevated)] text-[var(--ink-soft)]",
      };
    case "Em andamento":
      return {
        label: "Em preparo",
        description: "Pedido em produção neste momento.",
        className:
          "border-[color-mix(in_oklab,var(--accent-hot)_50%,white)] bg-[color-mix(in_oklab,var(--accent-hot)_16%,white)] text-[var(--accent-hot)]",
      };
    case "Parcialmente pronto":
      return {
        label: "Finalizando",
        description: "Uma parte já está pronta e o restante está sendo concluído.",
        className:
          "border-[color-mix(in_oklab,var(--accent-warm)_50%,white)] bg-[color-mix(in_oklab,var(--accent-warm)_18%,white)] text-[color-mix(in_oklab,var(--accent-warm)_82%,black)]",
      };
    case "Pronto para servir":
      return {
        label: "Pronto para entrega",
        description: "Pedido completo e liberado para saída.",
        className:
          "border-[color-mix(in_oklab,var(--accent-ready)_48%,white)] bg-[color-mix(in_oklab,var(--accent-ready)_16%,white)] text-[var(--accent-ready)]",
      };
    case "Cancelado":
      return {
        label: "Cancelado",
        description: "Pedido cancelado no provedor e retirado do fluxo operacional.",
        className:
          "border-[var(--accent-hot)] bg-[color-mix(in_oklab,var(--accent-hot)_16%,white)] text-[var(--accent-hot)]",
      };
    default:
      return {
        label: orderStatus,
        description: "Acompanhe o status do pedido por esta tela.",
        className:
          "border-[var(--panel-border-strong)] bg-[var(--panel-elevated)] text-[var(--ink-soft)]",
      };
  }
}

function getSalonLane(orderStatus: string): SalonLaneKey | null {
  if (orderStatus === "Cancelado") {
    return null;
  }

  if (orderStatus === "Pronto para servir") {
    return "ready";
  }

  return "in_preparation";
}

function getSalonLanePresentation(lane: SalonLaneKey) {
  if (lane === "ready") {
    return {
      badgeClassName:
        "border-[color-mix(in_oklab,var(--accent-ready)_42%,white)] bg-[color-mix(in_oklab,var(--accent-ready)_12%,white)] text-[var(--accent-ready)]",
      description: "Pedidos completos e liberados para a expedição.",
      emptyMessage: "Nenhum pedido aguardando entrega agora.",
      title: "Pronto para entrega",
    };
  }

  return {
    badgeClassName:
      "border-[color-mix(in_oklab,var(--accent-hot)_42%,white)] bg-[color-mix(in_oklab,var(--accent-hot)_12%,white)] text-[var(--accent-hot)]",
    description: "Pedidos em produção ou finalização, ainda sem liberação total.",
    emptyMessage: "Nenhum pedido em preparo neste momento.",
    title: "Em preparo",
  };
}

function SalonOrderCard({
  busy,
  onAcknowledge,
  order,
}: {
  busy: boolean;
  onAcknowledge: (orderId: string, exceptionId: string) => void;
  order: SalonOrder;
}) {
  const status = getSalonStatusPresentation(order.orderStatus);

  return (
    <Card
      className="rounded-[1.8rem] border-[var(--panel-border)] bg-[rgba(255,255,255,0.92)] p-5"
      data-testid={`salon-order-${order.orderId}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
            Pedido do salão
          </p>
          <h2 className="font-display text-4xl uppercase tracking-[0.08em] text-[var(--ink-strong)]">
            {order.customerName ?? "Sem nome"}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <div className="flex items-center gap-2 rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink-soft)]">
              <ReceiptText className="size-4 text-[var(--accent-hot)]" />
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                Comanda
              </span>
              <span className="font-semibold text-[var(--ink-strong)]">
                {order.reference}
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink-soft)]">
              <UserRound className="size-4 text-[var(--accent-hot)]" />
              <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                Garçom
              </span>
              <span className="font-semibold text-[var(--ink-strong)]">
                {order.waiterName ?? "Não informado"}
              </span>
            </div>
          </div>
        </div>
        <div
          className={`rounded-full border px-4 py-2 text-sm font-semibold uppercase tracking-[0.16em] ${status.className}`}
        >
          {status.label}
        </div>
      </div>

      <div className="mt-4 rounded-[1.5rem] border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-muted)]">
          Status do pedido
        </p>
        <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
          {status.description}
        </p>
      </div>

      {order.hasOpenSyncException && order.syncException ? (
        <div
          className="mt-4 rounded-[1.5rem] border border-[color-mix(in_oklab,var(--accent-warm)_44%,white)] bg-[color-mix(in_oklab,var(--accent-warm)_10%,white)] px-4 py-4"
          data-testid={`salon-sync-exception-${order.orderId}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-[color-mix(in_oklab,var(--accent-warm)_84%,black)]">
                <TriangleAlert className="size-4" />
                <p className="font-semibold uppercase tracking-[0.16em]">
                  {order.syncException.label}
                </p>
              </div>
              <p className="mt-2 text-sm font-semibold text-[var(--ink-strong)]">
                {order.syncException.summary}
              </p>
              {order.syncException.detail ? (
                <p className="mt-2 text-sm leading-6 text-[var(--ink-soft)]">
                  {order.syncException.detail}
                </p>
              ) : null}
              <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                {order.syncException.statusLabel}
              </p>
            </div>

            {order.syncException.status === "open" ? (
              <Button
                data-testid={`salon-acknowledge-${order.orderId}`}
                disabled={busy}
                onClick={() =>
                  onAcknowledge(order.orderId, order.syncException!.id)
                }
                size="sm"
              >
                <CheckCheck className="size-4" />
                Marcar como ciente
              </Button>
            ) : (
              <div className="rounded-full border border-[color-mix(in_oklab,var(--accent-ready)_40%,white)] bg-[color-mix(in_oklab,var(--accent-ready)_12%,white)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent-ready)]">
                Salão ciente, aguardando reconciliação
              </div>
            )}
          </div>
        </div>
      ) : null}
    </Card>
  );
}

export function SalonClient({ initialData }: { initialData?: SalonData }) {
  const queryClient = useQueryClient();
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<
    Partial<Record<SalonLaneKey, boolean>>
  >({});
  const salonQuery = useQuery(getSalonQueryOptions(initialData));
  const acknowledgeMutation = useMutation({
    mutationFn: async ({
      orderId,
      exceptionId,
    }: {
      orderId: string;
      exceptionId: string;
    }) => {
      setBusyOrderId(orderId);

      return fetchJson(
        `/api/orders/${orderId}/sync-exceptions/${exceptionId}/acknowledge`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
    },
    onSuccess: async () => {
      await Promise.all(
        getSalonInvalidationKeys().map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      );
    },
    onSettled: () => {
      setBusyOrderId(null);
    },
  });
  const blockingAuthFeedback = getProtectedSurfaceFeedback(salonQuery.error);
  const actionAuthFeedback = getProtectedSurfaceFeedback(acknowledgeMutation.error);

  if (salonQuery.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <Card className="p-8">Carregando salão...</Card>
      </main>
    );
  }

  if (blockingAuthFeedback) {
    return <ProtectedSurfaceFallback feedback={blockingAuthFeedback} />;
  }

  if (salonQuery.isError || !salonQuery.data) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <Card className="space-y-4 p-8 text-center">
          <p className="font-mono text-sm uppercase tracking-[0.24em] text-[var(--accent-hot)]">
            Não foi possível carregar o salão
          </p>
          <Button onClick={() => salonQuery.refetch()}>Tentar novamente</Button>
        </Card>
      </main>
    );
  }

  const salon = salonQuery.data;
  const laneOrders = {
    in_preparation: [] as SalonOrder[],
    ready: [] as SalonOrder[],
  };

  for (const order of salon.summary) {
    const lane = getSalonLane(order.orderStatus);

    if (!lane) {
      continue;
    }

    laneOrders[lane].push(order);
  }

  const laneSections = ([
    "in_preparation",
    "ready",
  ] as const).map((lane) => {
    const orders = laneOrders[lane];
    const isExpanded = expandedSections[lane] ?? false;
    const hiddenCount = Math.max(0, orders.length - maxSalonOrdersPerSection);
    const visibleOrders = isExpanded
      ? orders
      : orders.slice(0, maxSalonOrdersPerSection);

    return {
      hiddenCount,
      isExpanded,
      key: lane,
      orders: visibleOrders,
      presentation: getSalonLanePresentation(lane),
      totalCount: orders.length,
      visibleCount: visibleOrders.length,
    };
  });

  return (
    <main className="min-h-screen px-4 py-4 md:px-6 md:py-6">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-5">
        <header className="flex flex-wrap items-end justify-between gap-4 rounded-[2rem] border border-[var(--panel-border)] bg-[linear-gradient(135deg,rgba(255,255,255,0.96),rgba(249,244,235,0.92))] p-6">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--ink-muted)]">
              Atendimento
            </p>
            <h1 className="font-display text-5xl uppercase tracking-[0.08em] text-[var(--ink-strong)]">
              Salão
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
              {salon.openSyncExceptions} exceção(ões) aberta(s)
            </div>
            <div className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
              Atualizado{" "}
              {formatOperationalTime(salon.generatedAt, {
                includeSeconds: true,
              })}
            </div>
            <AreaSwitchButton />
          </div>
        </header>

        {actionAuthFeedback ? (
          <ProtectedSurfaceBanner feedback={actionAuthFeedback} />
        ) : null}

        <section className="grid gap-5 xl:grid-cols-2">
          {laneSections.map((section) => (
            <Card
              className="flex min-h-[34rem] flex-col overflow-hidden rounded-[2rem] border-[var(--panel-border-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,240,229,0.98))] p-5"
              data-testid={`salon-section-${section.key.replace("_", "-")}`}
              key={section.key}
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--panel-border)] pb-4">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] ${section.presentation.badgeClassName}`}
                    >
                      {section.presentation.title}
                    </span>
                    <span className="rounded-full border border-[var(--panel-border)] bg-white/80 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                      {section.visibleCount} de {section.totalCount} pedido(s)
                    </span>
                  </div>
                  <p className="max-w-xl text-sm leading-6 text-[var(--ink-soft)]">
                    {section.presentation.description}
                  </p>
                </div>

                {section.hiddenCount > 0 ? (
                  <div className="rounded-[1.2rem] border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-3 text-right">
                    <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                      {section.isExpanded ? "Lista expandida" : "Lista limitada"}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-[var(--ink-strong)]">
                      +{section.hiddenCount} pedido(s) fora da tela
                    </p>
                    <Button
                      className="mt-3"
                      data-testid={`salon-toggle-section-${section.key}`}
                      onClick={() =>
                        setExpandedSections((current) => ({
                          ...current,
                          [section.key]: !section.isExpanded,
                        }))
                      }
                      size="sm"
                      variant={section.isExpanded ? "secondary" : "default"}
                    >
                      {section.isExpanded ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                      {section.isExpanded
                        ? "Mostrar menos"
                        : "Ver pedidos fora da tela"}
                    </Button>
                  </div>
                ) : null}
              </div>

              <ScrollArea
                className="mt-5 h-[clamp(24rem,calc(100dvh-20rem),42rem)] rounded-[1.6rem] border border-[var(--panel-border)] bg-[var(--panel)] p-1"
                viewportClassName="pr-3"
              >
                <div className="space-y-3 p-2">
                  {section.orders.length === 0 ? (
                    <div className="rounded-[1.6rem] border border-dashed border-[var(--panel-border)] bg-white/72 px-5 py-10 text-center text-sm text-[var(--ink-soft)]">
                      {section.presentation.emptyMessage}
                    </div>
                  ) : (
                    section.orders.map((order) => (
                      <SalonOrderCard
                        busy={busyOrderId === order.orderId}
                        key={order.orderId}
                        onAcknowledge={(orderId, exceptionId) =>
                          acknowledgeMutation.mutate({
                            orderId,
                            exceptionId,
                          })
                        }
                        order={order}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </Card>
          ))}
        </section>
      </div>
    </main>
  );
}
