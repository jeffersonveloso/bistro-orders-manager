"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ChefHat,
  Eye,
  EyeOff,
  FilterX,
  LayoutPanelTop,
  RefreshCw,
  Search,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  startTransition,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
} from "react";
import type { ComponentType } from "react";

import type {
  BoardTicketCard,
  DashboardData,
} from "@/src/application/production-service";
import {
  canManageKitchen,
  getBoardQueryOptions,
  getDashboardInvalidationKeys,
  getProtectedSurfaceFeedback,
  hasAuthorizedOrderAccess,
  prioritizeKitchens,
} from "@/src/components/kds/production-client-contracts";
import { AreaSwitchButton } from "@/src/components/kds/area-switch-button";
import {
  ProtectedSurfaceBanner,
  ProtectedSurfaceFallback,
} from "@/src/components/kds/protected-surface-feedback";
import { StatusBadge } from "@/src/components/kds/status-badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { ScrollArea } from "@/src/components/ui/scroll-area";
import { Separator } from "@/src/components/ui/separator";
import { kitchenAreaIds, type KitchenAreaId } from "@/src/domain/area-access";
import { fetchJson } from "@/src/lib/fetch-json";
import {
  localizeKitchenDescription,
  localizeKitchenLabel,
} from "@/src/lib/kitchen-labels";
import { cn, formatOperationalTime } from "@/src/lib/utils";

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

function normalizeFilterValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function matchesTicketFilters(
  ticket: BoardTicketCard,
  customerFilter: string,
  referenceFilter: string,
) {
  const matchesCustomer =
    customerFilter.length === 0 ||
    normalizeFilterValue(ticket.customerName ?? "").includes(customerFilter);
  const matchesReference =
    referenceFilter.length === 0 ||
    normalizeFilterValue(ticket.reference).includes(referenceFilter);

  return matchesCustomer && matchesReference;
}

function getColumnPageKey(kitchenId: string, status: string) {
  return `${kitchenId}:${status}`;
}

type BoardColumnStatus = DashboardData["kitchens"][number]["columns"][number]["status"];

const defaultColumnVisibility: Record<BoardColumnStatus, boolean> = {
  canceled: false,
  in_preparation: true,
  new: true,
  ready: true,
};
const boardColumnStatuses = Object.keys(
  defaultColumnVisibility,
) as BoardColumnStatus[];
const dashboardPreferencesStorageKey = "bistro-dashboard-preferences";
const boardColumnMinWidthRem = 22;

interface DashboardPreferences {
  columnVisibility?: Partial<Record<BoardColumnStatus, boolean>>;
  customerFilter?: string;
  kitchenVisibility?: Partial<Record<KitchenAreaId, boolean>>;
  pageSize?: 4 | 6 | 8;
  referenceFilter?: string;
  showSyncAlerts?: boolean;
}

function readDashboardPreferences(): DashboardPreferences | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const rawValue = window.sessionStorage.getItem(
      dashboardPreferencesStorageKey,
    );

    if (!rawValue) {
      return null;
    }

    const parsedValue = JSON.parse(rawValue) as DashboardPreferences;

    return parsedValue && typeof parsedValue === "object" ? parsedValue : null;
  } catch {
    return null;
  }
}

function writeDashboardPreferences(preferences: DashboardPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      dashboardPreferencesStorageKey,
      JSON.stringify(preferences),
    );
  } catch {
    // Best effort only. The board should keep operating even without storage.
  }
}

function isAllowedPageSize(value: number): value is 4 | 6 | 8 {
  return value === 4 || value === 6 || value === 8;
}

function readDashboardPreferencesFromUrl(): DashboardPreferences | null {
  if (typeof window === "undefined") {
    return null;
  }

  const searchParams = new URLSearchParams(window.location.search);
  const preferences: DashboardPreferences = {};
  const customerFilter = searchParams.get("customer");
  const referenceFilter = searchParams.get("reference");
  const pageSize = Number(searchParams.get("pageSize"));
  const showSyncAlerts = searchParams.get("alerts");
  const visibleColumns = searchParams.get("columns");
  const visibleKitchens = searchParams.get("kitchens");

  if (customerFilter) {
    preferences.customerFilter = customerFilter;
  }

  if (referenceFilter) {
    preferences.referenceFilter = referenceFilter;
  }

  if (isAllowedPageSize(pageSize)) {
    preferences.pageSize = pageSize;
  }

  if (showSyncAlerts === "0" || showSyncAlerts === "1") {
    preferences.showSyncAlerts = showSyncAlerts === "1";
  }

  if (visibleColumns !== null) {
    const visibleColumnSet = new Set(
      visibleColumns === "none"
        ? []
        : visibleColumns
            .split(",")
            .filter((status): status is BoardColumnStatus =>
              boardColumnStatuses.includes(status as BoardColumnStatus),
            ),
    );

    preferences.columnVisibility = Object.fromEntries(
      boardColumnStatuses.map((status) => [status, visibleColumnSet.has(status)]),
    ) as DashboardPreferences["columnVisibility"];
  }

  if (visibleKitchens !== null) {
    const visibleKitchenSet = new Set(
      visibleKitchens === "none"
        ? []
        : visibleKitchens
            .split(",")
            .filter((kitchenId): kitchenId is KitchenAreaId =>
              kitchenAreaIds.includes(kitchenId as KitchenAreaId),
            ),
    );

    preferences.kitchenVisibility = Object.fromEntries(
      kitchenAreaIds.map((kitchenId) => [kitchenId, visibleKitchenSet.has(kitchenId)]),
    ) as DashboardPreferences["kitchenVisibility"];
  }

  return Object.keys(preferences).length > 0 ? preferences : null;
}

function buildDashboardSearchParams(preferences: DashboardPreferences) {
  const searchParams = new URLSearchParams();
  const resolvedColumnVisibility = preferences.columnVisibility ?? defaultColumnVisibility;
  const resolvedKitchenVisibility = preferences.kitchenVisibility ?? {};
  const hasNonDefaultColumns = boardColumnStatuses.some(
    (status) =>
      (resolvedColumnVisibility[status] ?? defaultColumnVisibility[status]) !==
      defaultColumnVisibility[status],
  );
  const visibleKitchenIds = kitchenAreaIds.filter(
    (kitchenId) => resolvedKitchenVisibility[kitchenId] ?? true,
  );

  if (preferences.customerFilter) {
    searchParams.set("customer", preferences.customerFilter);
  }

  if (preferences.referenceFilter) {
    searchParams.set("reference", preferences.referenceFilter);
  }

  if (preferences.pageSize && preferences.pageSize !== 4) {
    searchParams.set("pageSize", String(preferences.pageSize));
  }

  if (preferences.showSyncAlerts === false) {
    searchParams.set("alerts", "0");
  }

  if (hasNonDefaultColumns) {
    const visibleStatuses = boardColumnStatuses.filter(
      (status) => resolvedColumnVisibility[status] ?? defaultColumnVisibility[status],
    );

    searchParams.set(
      "columns",
      visibleStatuses.length > 0 ? visibleStatuses.join(",") : "none",
    );
  }

  if (visibleKitchenIds.length !== kitchenAreaIds.length) {
    searchParams.set(
      "kitchens",
      visibleKitchenIds.length > 0 ? visibleKitchenIds.join(",") : "none",
    );
  }

  return searchParams;
}

function writeDashboardPreferencesToUrl(preferences: DashboardPreferences) {
  if (typeof window === "undefined") {
    return;
  }

  const searchParams = buildDashboardSearchParams(preferences);
  const nextSearch = searchParams.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
  const currentUrl = `${window.location.pathname}${window.location.search}`;

  if (nextUrl !== currentUrl) {
    window.history.replaceState(window.history.state, "", nextUrl);
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
  const [customerFilter, setCustomerFilter] = useState("");
  const [referenceFilter, setReferenceFilter] = useState("");
  const [columnVisibility, setColumnVisibility] = useState(
    defaultColumnVisibility,
  );
  const [kitchenVisibility, setKitchenVisibility] = useState<
    Partial<Record<KitchenAreaId, boolean>>
  >({});
  const [showSyncAlerts, setShowSyncAlerts] = useState(true);
  const [pageSize, setPageSize] = useState<4 | 6 | 8>(4);
  const [columnPageByKey, setColumnPageByKey] = useState<
    Record<string, number>
  >({});
  const preferencesHydratedRef = useRef(false);
  const deferredCustomerFilter = useDeferredValue(customerFilter);
  const deferredReferenceFilter = useDeferredValue(referenceFilter);

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

  useEffect(() => {
    const applyDashboardPreferences = (preferences: DashboardPreferences | null) => {
      if (!preferences) {
        return;
      }

      if (typeof preferences.customerFilter === "string") {
        setCustomerFilter(preferences.customerFilter);
      }

      if (typeof preferences.referenceFilter === "string") {
        setReferenceFilter(preferences.referenceFilter);
      }

      if (preferences.pageSize && isAllowedPageSize(preferences.pageSize)) {
        setPageSize(preferences.pageSize);
      }

      if (preferences.showSyncAlerts !== undefined) {
        setShowSyncAlerts(preferences.showSyncAlerts);
      }

      if (preferences.columnVisibility) {
        setColumnVisibility((current) => {
          const next = { ...current };

          for (const status of boardColumnStatuses) {
            const value = preferences.columnVisibility?.[status];

            if (typeof value === "boolean") {
              next[status] = value;
            }
          }

          return next;
        });
      }

      if (preferences.kitchenVisibility) {
        setKitchenVisibility((current) => {
          const next = { ...current };

          for (const kitchenId of kitchenAreaIds) {
            const value = preferences.kitchenVisibility?.[kitchenId];

            if (typeof value === "boolean") {
              next[kitchenId] = value;
            }
          }

          return next;
        });
      }
    };

    applyDashboardPreferences(readDashboardPreferences());
    applyDashboardPreferences(readDashboardPreferencesFromUrl());
    preferencesHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!preferencesHydratedRef.current) {
      return;
    }

    writeDashboardPreferences({
      columnVisibility,
      customerFilter,
      kitchenVisibility,
      pageSize,
      referenceFilter,
      showSyncAlerts,
    });
    writeDashboardPreferencesToUrl({
      columnVisibility,
      customerFilter,
      kitchenVisibility,
      pageSize,
      referenceFilter,
      showSyncAlerts,
    });
  }, [
    columnVisibility,
    customerFilter,
    kitchenVisibility,
    pageSize,
    referenceFilter,
    showSyncAlerts,
  ]);

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
  const availableColumnToggles = prioritizedKitchens[0]?.columns.map((column) => ({
    label: column.label,
    status: column.status,
  })) ?? [];
  const normalizedCustomerFilter = normalizeFilterValue(deferredCustomerFilter);
  const normalizedReferenceFilter = normalizeFilterValue(deferredReferenceFilter);
  const hasActiveFilters =
    normalizedCustomerFilter.length > 0 || normalizedReferenceFilter.length > 0;
  const filteredKitchens = prioritizedKitchens
    .filter((kitchen) => kitchenVisibility[kitchen.id] ?? true)
    .map((kitchen) => ({
      ...kitchen,
      columns: kitchen.columns
        .filter((column) => columnVisibility[column.status])
        .map((column) => ({
          ...column,
          tickets: column.tickets.filter((ticket) =>
            matchesTicketFilters(
              ticket,
              normalizedCustomerFilter,
              normalizedReferenceFilter,
            ),
          ),
        })),
    }));
  const visibleTickets = filteredKitchens.flatMap((kitchen) =>
    kitchen.columns.flatMap((column) => column.tickets),
  );
  const visibleOrderCount = new Set(
    visibleTickets.map((ticket) => ticket.orderId),
  ).size;
  const visibleKitchenCount = filteredKitchens.length;

  function openTicket(orderId: string) {
    const returnTo = (() => {
      const searchParams = buildDashboardSearchParams({
        columnVisibility,
        customerFilter,
        kitchenVisibility,
        pageSize,
        referenceFilter,
        showSyncAlerts,
      });
      const search = searchParams.toString();

      if (typeof window === "undefined") {
        return search ? `/?${search}` : "/";
      }

      return `${window.location.pathname}${search ? `?${search}` : ""}`;
    })();

    startTransition(() => {
      const searchParams = new URLSearchParams({
        kitchen: activeKitchenId,
        returnTo,
      });

      router.push(`/orders/${orderId}?${searchParams.toString()}`);
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
                Área ativa{" "}
                {localizeKitchenLabel(activeKitchen?.name ?? activeKitchenId)}
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
            {formatOperationalTime(board.generatedAt, {
              includeSeconds: true,
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
            <AreaSwitchButton />
          </div>
        </div>

        <Card className="overflow-hidden border-[var(--panel-border-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(247,241,231,0.98))]">
          <div className="grid gap-4 px-5 py-5 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-[var(--ink-strong)]">
                <Search className="size-4 text-[var(--accent-hot)]" />
                <p className="font-display text-2xl uppercase tracking-[0.08em]">
                  Localizar pedidos
                </p>
              </div>
              <p className="max-w-2xl text-sm leading-6 text-[var(--ink-soft)]">
                Filtre por cliente ou pela comanda para reduzir ruído no pico e
                use o nome do garçom nos cards para identificar quem atendeu.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              <span className="rounded-full border border-[var(--panel-border)] bg-white/85 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                {visibleOrderCount} de {board.salonSummary.length} pedido(s)
              </span>
              <span className="rounded-full border border-[var(--panel-border)] bg-white/85 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                {visibleTickets.length} ticket(s) visíveis
              </span>
              {hasActiveFilters ? (
                <Button
                  onClick={() => {
                    setCustomerFilter("");
                    setReferenceFilter("");
                  }}
                  size="sm"
                  variant="ghost"
                >
                  <FilterX className="size-4" />
                  Limpar filtros
                </Button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 border-t border-[var(--panel-border)] px-5 py-5 xl:grid-cols-[1fr_1fr_auto_auto_auto]">
            <label className="space-y-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
                Cliente / mesa
              </span>
              <Input
                data-testid="board-filter-customer"
                onChange={(event) => setCustomerFilter(event.target.value)}
                placeholder="Ex.: Mesa 7 ou Carla"
                value={customerFilter}
              />
            </label>

            <label className="space-y-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
                Comanda
              </span>
              <Input
                data-testid="board-filter-reference"
                onChange={(event) => setReferenceFilter(event.target.value)}
                placeholder="Ex.: 103"
                value={referenceFilter}
              />
            </label>

            <div className="space-y-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
                Tickets por lista
              </span>
              <div className="flex flex-wrap gap-2">
                {[4, 6, 8].map((size) => (
                  <Button
                    className="min-w-14"
                    data-testid={`board-page-size-${size}`}
                    key={size}
                    onClick={() => setPageSize(size as 4 | 6 | 8)}
                    size="sm"
                    variant={pageSize === size ? "default" : "secondary"}
                  >
                    {size}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
                Colunas do board
              </span>
              <div className="flex flex-wrap gap-2">
                {availableColumnToggles.map((column) => {
                  const visible = columnVisibility[column.status];

                  return (
                    <Button
                      data-testid={`board-toggle-column-${column.status}`}
                      key={column.status}
                      onClick={() =>
                        setColumnVisibility((current) => ({
                          ...current,
                          [column.status]: !current[column.status],
                        }))
                      }
                      size="sm"
                      variant={visible ? "default" : "secondary"}
                    >
                      {visible ? (
                        <Eye className="size-4" />
                      ) : (
                        <EyeOff className="size-4" />
                      )}
                      {column.label}
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="flex min-w-[13rem] flex-col items-start gap-2">
              <span className="block font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
                Alertas operacionais
              </span>
              {board.openSyncExceptions > 0 ? (
                <Button
                  data-testid="board-toggle-sync-alerts"
                  onClick={() => setShowSyncAlerts((current) => !current)}
                  size="sm"
                  variant={showSyncAlerts ? "default" : "secondary"}
                >
                  {showSyncAlerts ? (
                    <Eye className="size-4" />
                  ) : (
                    <EyeOff className="size-4" />
                  )}
                  {showSyncAlerts ? "Ocultar alertas" : "Mostrar alertas"}
                </Button>
              ) : (
                <div className="rounded-full border border-[var(--panel-border)] bg-white/75 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                  Sem exceções ativas
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-[var(--panel-border)] px-5 py-5">
            <div className="space-y-2">
              <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
                Cozinhas no painel
              </span>
              <div className="flex flex-wrap gap-2">
                {prioritizedKitchens.map((kitchen) => {
                  const visible = kitchenVisibility[kitchen.id] ?? true;

                  return (
                    <Button
                      data-testid={`board-toggle-kitchen-${kitchen.id}`}
                      key={kitchen.id}
                      onClick={() =>
                        setKitchenVisibility((current) => ({
                          ...current,
                          [kitchen.id]: !visible,
                        }))
                      }
                      size="sm"
                      variant={visible ? "default" : "secondary"}
                    >
                      {visible ? (
                        <Eye className="size-4" />
                      ) : (
                        <EyeOff className="size-4" />
                      )}
                      {localizeKitchenLabel(kitchen.name)}
                    </Button>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>

        {actionAuthFeedback ? (
          <ProtectedSurfaceBanner feedback={actionAuthFeedback} />
        ) : null}

        <section
          className={cn(
            "grid gap-5",
            visibleKitchenCount > 1 && "2xl:grid-cols-2",
          )}
        >
          {filteredKitchens.length === 0 ? (
            <Card className="rounded-[1.8rem] border-dashed border-[var(--panel-border-strong)] bg-white/60 p-8 text-center text-[var(--ink-soft)] 2xl:col-span-2">
              Nenhuma cozinha visível no painel. Use os botões com ícone de olho
              para reexibir os cards.
            </Card>
          ) : null}

          {filteredKitchens.map((kitchen) => {
            const isActionKitchen = canManageKitchen(activeKitchenId, kitchen.id);

            return (
            <Card
              className={cn(
                "overflow-hidden border-[var(--panel-border-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(249,244,235,0.98))]",
                visibleKitchenCount === 1 && "2xl:col-span-2",
                isActionKitchen &&
                  "shadow-[0_20px_60px_rgba(34,30,25,0.12)] ring-1 ring-[color-mix(in_oklab,var(--accent-hot)_28%,transparent)]",
              )}
              key={kitchen.id}
            >
              <div className="flex items-end justify-between gap-4 border-b border-[var(--panel-border)] px-5 py-5">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.24em] text-[var(--ink-muted)]">
                    {localizeKitchenDescription(kitchen.description)}
                  </p>
                  <h2 className="font-display text-4xl uppercase tracking-[0.08em] text-[var(--ink-strong)]">
                    {localizeKitchenLabel(kitchen.name)}
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

              <div className="overflow-x-auto overscroll-x-contain p-4 pb-5 touch-pan-x [-webkit-overflow-scrolling:touch]">
                {kitchen.columns.length === 0 ? (
                  <div className="rounded-[1.6rem] border border-dashed border-[var(--panel-border)] bg-white/70 px-6 py-12 text-center text-sm text-[var(--ink-soft)]">
                    Nenhuma coluna visível nesta cozinha. Reative um status nos
                    controles acima.
                  </div>
                ) : (
                  <div
                    className="grid min-w-full gap-4"
                    style={{
                      gridTemplateColumns: `repeat(${kitchen.columns.length}, minmax(${boardColumnMinWidthRem}rem, 1fr))`,
                    }}
                  >
                  {kitchen.columns.map((column) => {
                  const pageKey = getColumnPageKey(kitchen.id, column.status);
                  const totalPages = Math.max(
                    1,
                    Math.ceil(column.tickets.length / pageSize),
                  );
                  const currentPage = Math.min(
                    columnPageByKey[pageKey] ?? 1,
                    totalPages,
                  );
                  const pageStartIndex = (currentPage - 1) * pageSize;
                  const paginatedTickets = column.tickets.slice(
                    pageStartIndex,
                    pageStartIndex + pageSize,
                  );
                  const pageEndIndex =
                    column.tickets.length === 0
                      ? 0
                      : pageStartIndex + paginatedTickets.length;

                  return (
                    <div
                      className="flex min-h-[560px] flex-col gap-3"
                      data-testid={`board-column-${kitchen.id}-${column.status}`}
                      key={column.status}
                    >
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

                      <ScrollArea
                        className="h-[clamp(18rem,calc(100dvh-24rem),32.5rem)] rounded-[1.6rem] border border-[var(--panel-border)] bg-[var(--panel)] p-1"
                      >
                        <div className="space-y-3 p-2">
                          {paginatedTickets.length === 0 ? (
                            <div className="rounded-[1.4rem] border border-dashed border-[var(--panel-border)] px-4 py-8 text-center text-sm text-[var(--ink-muted)]">
                              {hasActiveFilters
                                ? "Nenhum pedido com estes filtros."
                                : "Nenhum pedido nesta coluna."}
                            </div>
                          ) : (
                            paginatedTickets.map((ticket) => {
                              const busy =
                                busyTicketId === `${ticket.orderId}:${ticket.kitchenId}`;

                              return (
                                <div
                                  className="min-w-0 w-full"
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
                                      "min-w-0 space-y-4 rounded-[1.6rem] border-[var(--panel-border)] bg-[rgba(255,255,255,0.9)] p-4 transition",
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
                                        Comanda {ticket.reference}
                                      </p>
                                      <h3 className="font-display text-3xl uppercase tracking-[0.08em] text-[var(--ink-strong)]">
                                        {ticket.customerName ?? "Sem nome"}
                                      </h3>
                                      <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-[var(--ink-soft)]">
                                        <UserRound className="size-4 text-[var(--accent-hot)]" />
                                        {ticket.waiterName
                                          ? `Garçom ${ticket.waiterName}`
                                          : "Garçom não informado"}
                                      </p>
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
                                          {localizeKitchenLabel(
                                            ticket.otherKitchenName ?? "Outra cozinha",
                                          )}
                                          :{" "}
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
                      <div className="flex items-center justify-between rounded-[1.2rem] border border-[var(--panel-border)] bg-white/80 px-4 py-3">
                        <p
                          className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-muted)]"
                          data-testid={`board-column-page-${kitchen.id}-${column.status}`}
                        >
                          {column.tickets.length === 0
                            ? "Sem tickets"
                            : `Mostrando ${pageStartIndex + 1}-${pageEndIndex} de ${column.tickets.length}`}
                        </p>
                        <div className="flex items-center gap-2">
                          <Button
                            disabled={currentPage <= 1}
                            onClick={() =>
                              setColumnPageByKey((current) => ({
                                ...current,
                                [pageKey]: Math.max(1, currentPage - 1),
                              }))
                            }
                            size="sm"
                            variant="ghost"
                          >
                            <ChevronLeft className="size-4" />
                            Anterior
                          </Button>
                          <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                            {currentPage}/{totalPages}
                          </span>
                          <Button
                            disabled={currentPage >= totalPages}
                            onClick={() =>
                              setColumnPageByKey((current) => ({
                                ...current,
                                [pageKey]: Math.min(totalPages, currentPage + 1),
                              }))
                            }
                            size="sm"
                            variant="ghost"
                          >
                            Próxima
                            <ChevronRight className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                  })}
                  </div>
                )}
              </div>
            </Card>
            );
          })}
        </section>

        {board.openSyncExceptions > 0 && showSyncAlerts ? (
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
                        {alert.waiterName ? ` • Garçom ${alert.waiterName}` : ""}
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
