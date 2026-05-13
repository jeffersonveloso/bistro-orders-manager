"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";

import type { SalonData } from "@/src/application/production-service";
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
import { fetchJson } from "@/src/lib/fetch-json";

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
        label: "Pronto para entregar",
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

export function SalonClient({ initialData }: { initialData?: SalonData }) {
  const queryClient = useQueryClient();
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
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

  return (
    <main className="min-h-screen px-4 py-4 md:px-6 md:py-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
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
              {new Date(salon.generatedAt).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </div>
          </div>
        </header>

        {actionAuthFeedback ? (
          <ProtectedSurfaceBanner feedback={actionAuthFeedback} />
        ) : null}

        <div className="grid gap-3">
          {salon.summary.map((order) => {
            const status = getSalonStatusPresentation(order.orderStatus);
            const busy = busyOrderId === order.orderId;

            return (
              <Card
                className="rounded-[1.8rem] border-[var(--panel-border)] bg-[rgba(255,255,255,0.92)] p-5"
                data-testid={`salon-order-${order.orderId}`}
                key={order.orderId}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
                      {order.reference}
                    </p>
                    <h2 className="font-display text-4xl uppercase tracking-[0.08em] text-[var(--ink-strong)]">
                      {order.customerName ?? "Sem nome"}
                    </h2>
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
                  <p className="mt-2 text-lg font-semibold text-[var(--ink-strong)]">
                    {status.label}
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
                            acknowledgeMutation.mutate({
                              orderId: order.orderId,
                              exceptionId: order.syncException!.id,
                            })
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
          })}
        </div>
      </div>
    </main>
  );
}
