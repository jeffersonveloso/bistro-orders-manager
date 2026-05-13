"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ChefHat,
  ClipboardList,
  CloudDownload,
  Copy,
  RefreshCw,
  TriangleAlert,
  WandSparkles,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  CatalogMappingPageData,
  CatalogPendingProviderItem,
  ProviderCatalogPullResult,
  UpsertCatalogMappingResult,
} from "@/src/application/catalog-mapping-service";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { fetchJson } from "@/src/lib/fetch-json";
import { localizeKitchenLabel } from "@/src/lib/kitchen-labels";
import { cn, formatMinutesFrom } from "@/src/lib/utils";

const fieldClassName =
  "h-12 w-full rounded-[1.15rem] border border-[var(--panel-border)] bg-[rgba(255,255,255,0.92)] px-4 text-sm text-[var(--ink-strong)] outline-none transition placeholder:text-[var(--ink-muted)] focus:border-[var(--panel-border-strong)] focus:ring-2 focus:ring-[var(--ring-strong)]";

function fetchCatalogMappings() {
  return fetchJson<CatalogMappingPageData>("/api/catalog/mappings");
}

function mergePendingProviderItems(
  persistedItems: CatalogPendingProviderItem[],
  previewItems: CatalogPendingProviderItem[],
) {
  const merged = new Map<string, CatalogPendingProviderItem>();

  for (const item of persistedItems) {
    merged.set(item.key, item);
  }

  for (const item of previewItems) {
    const existing = merged.get(item.key);

    if (!existing || item.lastSeenAt.localeCompare(existing.lastSeenAt) >= 0) {
      merged.set(item.key, item);
    }
  }

  return [...merged.values()].sort((left, right) =>
    right.lastSeenAt.localeCompare(left.lastSeenAt),
  );
}

function buildSaveFeedback(result: UpsertCatalogMappingResult) {
  const providerPublication = result.providerPublication;

  if (result.replay.attemptedCount === 0) {
    if (providerPublication?.status === "published") {
      return `Mapping salvo para ${result.mapping.menuItemName}. External ID publicado automaticamente no provider.`;
    }

    if (providerPublication?.status === "skipped" && providerPublication.providerMessage) {
      return `Mapping salvo para ${result.mapping.menuItemName}. ${providerPublication.providerMessage}`;
    }

    return `Mapping salvo para ${result.mapping.menuItemName}.`;
  }

  const replayMessage = `Mapping salvo para ${result.mapping.menuItemName}. Replay tentou ${result.replay.attemptedCount} pedido(s), importou ${result.replay.importedOrders} e deixou ${result.replay.remainingBlockingExceptions} bloqueio(s) restante(s).`;

  if (providerPublication?.status === "published") {
    return `${replayMessage} External ID publicado automaticamente no provider.`;
  }

  if (providerPublication?.status === "skipped" && providerPublication.providerMessage) {
    return `${replayMessage} ${providerPublication.providerMessage}`;
  }

  return replayMessage;
}

function protectProviderValue(value: string | null) {
  if (!value) {
    return "Chave protegida";
  }

  if (value.length <= 8) {
    return `Protegida • ${value.slice(-4)}`;
  }

  return `Protegida • ${value.slice(0, 4)}…${value.slice(-4)}`;
}

function generateBistroDraftId() {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return `bistro-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

interface PublishDraftState {
  itemName: string;
  localMenuItemId: string;
  providerExternalId: string | null;
  providerItemId: string | null;
}

interface CatalogToast {
  id: string;
  title: string;
  description?: string;
  variant: "error" | "info" | "success";
}

export function CatalogMappingsClient({
  initialData,
}: {
  initialData?: CatalogMappingPageData;
}) {
  const queryClient = useQueryClient();
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [manualForm, setManualForm] = useState({
    kitchenId: "kitchen-1",
    menuItemId: "",
    menuItemName: "",
    providerItemId: "",
    providerExternalId: "",
    publishProviderExternalId: false,
  });
  const [providerItemIdLocked, setProviderItemIdLocked] = useState(false);
  const [providerExternalIdLocked, setProviderExternalIdLocked] = useState(false);
  const [linkedDraftIds, setLinkedDraftIds] = useState(false);
  const [publishDraft, setPublishDraft] = useState<PublishDraftState | null>(null);
  const [publishDraftDialogOpen, setPublishDraftDialogOpen] = useState(false);
  const [pullPreview, setPullPreview] = useState<ProviderCatalogPullResult | null>(
    null,
  );
  const [toasts, setToasts] = useState<CatalogToast[]>([]);
  const shownProviderCatalogFailureRef = useRef<string | null>(null);

  const pushToast = useCallback(
    ({
      description,
      title,
      variant,
    }: Omit<CatalogToast, "id">) => {
      const id = generateBistroDraftId();

      setToasts((current) => [...current, { id, description, title, variant }]);
      window.setTimeout(() => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
      }, variant === "error" ? 9000 : 5000);
    },
    [],
  );

  const dismissToast = useCallback((toastId: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }, []);

  const mappingsQuery = useQuery({
    queryKey: ["catalog", "mappings"],
    queryFn: fetchCatalogMappings,
    initialData,
  });

  const providerCatalogFailureKey = useMemo(() => {
    if (
      mappingsQuery.data?.providerCatalogStatus.status !== "failed" ||
      !mappingsQuery.data.providerCatalogStatus.errorMessage
    ) {
      return null;
    }

    return mappingsQuery.data.providerCatalogStatus.errorMessage;
  }, [mappingsQuery.data?.providerCatalogStatus]);

  useEffect(() => {
    if (
      !providerCatalogFailureKey ||
      providerCatalogFailureKey === shownProviderCatalogFailureRef.current
    ) {
      return;
    }

    shownProviderCatalogFailureRef.current = providerCatalogFailureKey;
    const timeoutId = window.setTimeout(() => {
      pushToast({
        title: "Falha ao carregar catálogo do provider",
        description: providerCatalogFailureKey,
        variant: "error",
      });
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [providerCatalogFailureKey, pushToast]);

  const saveMutation = useMutation({
    mutationFn: async (input: {
      actionKey: string;
      kitchenId: string;
      menuItemId: string;
      menuItemName: string;
      providerItemId?: string;
      providerExternalId?: string;
      mirrorMenuItemIdToProviderExternalId?: boolean;
      publishProviderExternalId?: boolean;
    }) => {
      setBusyActionKey(input.actionKey);

      return fetchJson<UpsertCatalogMappingResult>("/api/catalog/mappings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kitchenId: input.kitchenId,
          menuItemId: input.menuItemId,
          menuItemName: input.menuItemName,
          providerItemId: input.providerItemId,
          providerExternalId: input.providerExternalId,
          mirrorMenuItemIdToProviderExternalId:
            input.mirrorMenuItemIdToProviderExternalId,
          publishProviderExternalId: input.publishProviderExternalId,
        }),
      });
    },
    onSuccess: async (result, variables) => {
      pushToast({
        title: "Mapping salvo",
        description: buildSaveFeedback(result),
        variant:
          result.providerPublication?.status === "published" ? "success" : "info",
      });
      setManualForm({
        kitchenId: result.mapping.kitchenId,
        menuItemId: "",
        menuItemName: "",
        providerItemId: "",
        providerExternalId: "",
        publishProviderExternalId: false,
      });
      setProviderItemIdLocked(false);
      setProviderExternalIdLocked(false);
      setLinkedDraftIds(false);
      if (
        variables.mirrorMenuItemIdToProviderExternalId &&
        result.providerPublication?.status !== "published"
      ) {
        setPublishDraft({
          itemName: result.mapping.menuItemName,
          localMenuItemId: result.mapping.menuItemId,
          providerExternalId: result.mapping.providerExternalId ?? null,
          providerItemId: result.mapping.providerItemId ?? null,
        });
        setPublishDraftDialogOpen(true);
      } else if (result.providerPublication?.status === "published") {
        setPublishDraft(null);
        setPublishDraftDialogOpen(false);
      }
      setPullPreview((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          pendingProviderItems: current.pendingProviderItems.filter(
            (item) => item.providerExternalId !== variables.providerExternalId,
          ),
        };
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["catalog", "mappings"] }),
        queryClient.invalidateQueries({ queryKey: ["board"] }),
      ]);
    },
    onError: (error) => {
      pushToast({
        title: "Falha ao salvar mapping",
        description:
          error instanceof Error ? error.message : "Falha ao salvar mapping.",
        variant: "error",
      });
    },
    onSettled: () => {
      setBusyActionKey(null);
    },
  });

  const pullMutation = useMutation({
    mutationFn: async () => {
      setBusyActionKey("provider-pull");

      return fetchJson<ProviderCatalogPullResult>("/api/catalog/provider-pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
    },
    onSuccess: (result) => {
      setPullPreview(result);
      pushToast({
        title: "Pull concluído",
        description: `${result.catalogItemsScanned} item(ns) do catálogo consultado(s) e ${result.metrics.pendingProviderItems} item(ns) novo(s) com chave válida encontrado(s).`,
        variant: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: "Falha ao puxar itens do provider",
        description:
          error instanceof Error
            ? error.message
            : "Falha ao puxar itens do provider.",
        variant: "error",
      });
    },
    onSettled: () => {
      setBusyActionKey(null);
    },
  });

  if (mappingsQuery.isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <Card className="w-full max-w-xl p-8 text-center">
          <p className="font-mono text-sm uppercase tracking-[0.28em] text-[var(--ink-muted)]">
            Carregando catálogo
          </p>
        </Card>
      </main>
    );
  }

  if (mappingsQuery.isError || !mappingsQuery.data) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <Card className="w-full max-w-xl space-y-4 p-8 text-center">
          <p className="font-mono text-sm uppercase tracking-[0.28em] text-[var(--accent-hot)]">
            Falha ao carregar o catálogo
          </p>
          <Button onClick={() => mappingsQuery.refetch()}>Tentar novamente</Button>
        </Card>
      </main>
    );
  }

  const data = mappingsQuery.data;
  const mergedPendingItems = mergePendingProviderItems(
    data.pendingProviderItems,
    pullPreview?.pendingProviderItems ?? [],
  );
  const actionablePendingItems = mergedPendingItems.filter(
    (item) => item.status === "needs_mapping",
  );
  const blockedPendingItems = mergedPendingItems.filter(
    (item) => item.status === "missing_external_id",
  );

  function prefillManualForm(item: CatalogPendingProviderItem) {
    const hasProviderItemId = Boolean(item.providerItemId);
    const hasProviderExternalId = Boolean(item.providerExternalId);
    const shouldGenerateLinkedDraft = !hasProviderExternalId;
    const generatedDraftId = shouldGenerateLinkedDraft
      ? item.suggestedMenuItemId ?? generateBistroDraftId()
      : null;
    const shouldPublishViaApi =
      data.providerExternalIdSupport?.mode === "api_write" &&
      hasProviderItemId &&
      !hasProviderExternalId;

    setManualForm((current) => ({
      kitchenId: current.kitchenId,
      menuItemId: generatedDraftId ?? item.suggestedMenuItemId ?? "",
      menuItemName: item.latestName,
      providerItemId: item.providerItemId ?? "",
      providerExternalId: item.providerExternalId ?? generatedDraftId ?? "",
      publishProviderExternalId: shouldPublishViaApi,
    }));
    setProviderItemIdLocked(hasProviderItemId);
    setProviderExternalIdLocked(hasProviderExternalId || shouldGenerateLinkedDraft);
    setLinkedDraftIds(Boolean(shouldGenerateLinkedDraft));
  }

  function saveQuickMapping(
    item: CatalogPendingProviderItem,
    kitchenId: string,
  ) {
    if (!item.providerExternalId) {
      return;
    }

    saveMutation.mutate({
      actionKey: `pending:${item.key}:${kitchenId}`,
      kitchenId,
      menuItemId: "",
      menuItemName: item.latestName,
      providerItemId: item.providerItemId ?? undefined,
      providerExternalId: item.providerExternalId,
    });
  }

  function saveExistingMapping(
    menuItemId: string,
    menuItemName: string,
    kitchenId: string,
  ) {
    const existingMapping = data.mappings.find(
      (mapping) => mapping.menuItemId === menuItemId,
    );

    saveMutation.mutate({
      actionKey: `existing:${menuItemId}:${kitchenId}`,
      kitchenId,
      menuItemId,
      menuItemName,
      providerItemId: existingMapping?.providerItemId ?? undefined,
      providerExternalId: existingMapping?.providerExternalId ?? undefined,
    });
  }

  function createProviderDraftForBlockedItem(
    item: CatalogPendingProviderItem,
    kitchenId: string,
  ) {
    const shouldPublishViaApi =
      data.providerExternalIdSupport?.mode === "api_write" &&
      Boolean(item.providerItemId);

    saveMutation.mutate({
      actionKey: `blocked:${item.key}:${kitchenId}`,
      kitchenId,
      menuItemId: "",
      menuItemName: item.latestName,
      providerItemId: item.providerItemId ?? "",
      providerExternalId: "",
      mirrorMenuItemIdToProviderExternalId: true,
      publishProviderExternalId: shouldPublishViaApi,
    });
  }

  async function copyPublishDraftValue() {
    if (!publishDraft?.providerExternalId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(publishDraft.providerExternalId);
      pushToast({
        title: "ID copiado",
        description: `ID do bistrô copiado para ${publishDraft.itemName}.`,
        variant: "success",
      });
    } catch {
      pushToast({
        title: "Falha ao copiar ID",
        description: "Não foi possível copiar automaticamente o ID do bistrô.",
        variant: "error",
      });
    }
  }

  async function copyManualProviderExternalId() {
    if (!manualForm.providerExternalId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(manualForm.providerExternalId);
      pushToast({
        title: "External ID copiado",
        description: "External ID do bistrô copiado.",
        variant: "success",
      });
    } catch {
      pushToast({
        title: "Falha ao copiar external ID",
        description: "Não foi possível copiar o external ID automaticamente.",
        variant: "error",
      });
    }
  }

  function generateManualAssistDraftId() {
    const generatedId = manualForm.menuItemId.trim() || generateBistroDraftId();

    setManualForm((current) => ({
      ...current,
      menuItemId: generatedId,
      providerExternalId: generatedId,
      publishProviderExternalId: false,
    }));
    setProviderExternalIdLocked(true);
    setLinkedDraftIds(true);
    pushToast({
      title: "ID do bistrô gerado",
      description: "O external ID está pronto para copiar e publicar.",
      variant: "info",
    });
  }

  function submitManualForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      data.providerExternalIdSupport?.mode === "manual_assist" &&
      manualForm.providerExternalId.trim().length === 0
    ) {
      pushToast({
        title: "External ID obrigatório",
        description:
          "Gere ou informe o external ID do bistrô antes de salvar o mapping.",
        variant: "error",
      });
      return;
    }

    saveMutation.mutate({
      actionKey: "manual-form",
      ...manualForm,
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
                Catálogo operacional
              </span>
            </div>
            <div className="space-y-2">
              <h1 className="font-display text-5xl uppercase tracking-[0.08em] text-[var(--ink-strong)] md:text-7xl">
                Mapeamento sem editar código
              </h1>
              <p className="max-w-3xl text-base text-[var(--ink-soft)] md:text-lg">
                Cadastre novos itens, reatribua cozinhas e puxe sugestões direto
                do catálogo do provider. Quando um mapping resolve um bloqueio,
                o sistema tenta reprocessar o pedido automaticamente.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MetricCard
              icon={ClipboardList}
              label="Mappings ativos"
              value={String(data.metrics.totalMappings)}
            />
            <MetricCard
              icon={ChefHat}
              label="Pedidos bloqueados"
              value={String(data.metrics.pendingMissingMappingOrders)}
            />
            <MetricCard
              icon={CloudDownload}
              label="Itens novos"
              value={String(data.metrics.pendingProviderItems)}
            />
            <MetricCard
              icon={TriangleAlert}
              label="Sem externalID"
              value={String(data.metrics.pendingMissingExternalIdItems)}
            />
          </div>
        </header>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--ink-muted)]">
            Atualizado em{" "}
            {new Date(data.generatedAt).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="secondary"
              onClick={() => mappingsQuery.refetch()}
              disabled={mappingsQuery.isRefetching}
            >
              <RefreshCw
                className={cn("size-4", mappingsQuery.isRefetching && "animate-spin")}
              />
              Atualizar
            </Button>
            <Button asChild variant="secondary">
              <Link href="/">
                Sync board
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/salon">
                Visão do salão
                <ArrowUpRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>

        <section className="grid gap-5 xl:grid-cols-[0.88fr_1.12fr]">
          <Card className="space-y-5 p-5">
            <div className="space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--ink-muted)]">
                Pull manual
              </p>
              <h2 className="font-display text-4xl uppercase tracking-[0.08em] text-[var(--ink-strong)]">
                Buscar itens do catálogo do provider
              </h2>
              <p className="text-sm leading-6 text-[var(--ink-soft)]">
                O pull manual consulta o catálogo do provider atual e retorna
                itens ainda sem mapping local. Isso permite adiantar o vínculo
                operacional sem depender de pedidos em aberto.
              </p>
            </div>

            <div className="rounded-[1.5rem] border border-[var(--panel-border)] bg-[var(--panel-elevated)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <p className="font-semibold text-[var(--ink-strong)]">
                    Janela padrão do MVP
                  </p>
                  <p className="text-sm leading-6 text-[var(--ink-soft)]">
                    Até 500 itens atualizados nos últimos 7 dias, usando a
                    capability de catálogo do provider atual.
                  </p>
                  {data.providerCatalogStatus.status === "loaded" ? (
                    <p className="text-sm leading-6 text-[var(--ink-soft)]">
                      Carga inicial do catálogo:{" "}
                      {data.providerCatalogStatus.fetchedItemCount} item(ns)
                      recebido(s) do provider.
                    </p>
                  ) : null}
                </div>
                <Button
                  disabled={busyActionKey === "provider-pull"}
                  onClick={() => {
                    pullMutation.mutate();
                  }}
                >
                  <CloudDownload className="size-4" />
                  Puxar do provider
                </Button>
              </div>

              {pullPreview ? (
                <div className="mt-4 rounded-[1.2rem] border border-[var(--panel-border)] bg-[rgba(255,255,255,0.88)] px-4 py-4 text-sm text-[var(--ink-soft)]">
                  <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
                    Último pull
                  </p>
                  <p className="mt-2 text-[var(--ink-strong)]">
                    {pullPreview.catalogItemsScanned} item(ns) do catálogo consultado(s) desde{" "}
                    {new Date(pullPreview.updatedSinceUsed).toLocaleString("pt-BR")}
                    .
                  </p>
                  <p className="mt-1">
                    {pullPreview.metrics.pendingProviderItems} item(ns) novo(s)
                    com chave válida e{" "}
                    {pullPreview.metrics.pendingMissingExternalIdItems} item(ns)
                    sem `externalID`.
                  </p>
                </div>
              ) : null}
            </div>
          </Card>

          <Card className="space-y-5 p-5">
            <div className="space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--ink-muted)]">
                Cadastro manual
              </p>
              <h2 className="font-display text-4xl uppercase tracking-[0.08em] text-[var(--ink-strong)]">
                Criar ou corrigir mapping
              </h2>
              <p className="text-sm leading-6 text-[var(--ink-soft)]">
                O item local pode ter um UUID interno próprio. Quando houver
                ID interno do provider ou `externalID`, eles ficam vinculados em
                campos separados para preservar o identificador operacional do
                catálogo.
              </p>
            </div>

            <form className="grid gap-4 md:grid-cols-2" onSubmit={submitManualForm}>
              <label className="space-y-2 md:col-span-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                  ID local
                </span>
                <input
                  className={fieldClassName}
                  onChange={(event) =>
                    setManualForm((current) => ({
                      ...current,
                      menuItemId: event.target.value,
                      providerExternalId: linkedDraftIds
                        ? event.target.value
                        : current.providerExternalId,
                    }))
                  }
                  placeholder="Opcional. Se vazio, o sistema gera um UUID."
                  value={manualForm.menuItemId}
                />
              </label>

              <label className="space-y-2 md:col-span-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                  ID interno do provider
                </span>
                <input
                  className={fieldClassName}
                  readOnly={providerItemIdLocked}
                  onChange={(event) =>
                    setManualForm((current) => ({
                      ...current,
                      providerItemId: event.target.value,
                    }))
                  }
                  placeholder="Opcional. Carregado do provider quando disponível."
                  value={manualForm.providerItemId}
                />
                <p className="text-xs leading-5 text-[var(--ink-muted)]">
                  {providerItemIdLocked
                    ? "Valor identificado no provider. Este campo fica bloqueado para evitar divergência manual."
                    : "Opcional. Use “Revisar no formulário” para carregar o ID interno do provider quando ele estiver disponível."}
                </p>
              </label>

              <label className="space-y-2 md:col-span-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                  External ID do provider
                </span>
                <input
                  className={fieldClassName}
                  readOnly={providerExternalIdLocked}
                  onChange={(event) =>
                    setManualForm((current) => ({
                      ...current,
                      providerExternalId: event.target.value,
                    }))
                  }
                  placeholder="Opcional. Se vazio, o sistema pode gerar um valor local."
                  value={manualForm.providerExternalId}
                />
                <p className="text-xs leading-5 text-[var(--ink-muted)]">
                  {providerExternalIdLocked
                    ? linkedDraftIds
                      ? "ID do bistrô gerado para publicação manual. Copie este valor e publique no provider antes ou logo após salvar."
                      : "External ID já observado no provider. O campo fica bloqueado para evitar sobrescrita acidental."
                    : "Se o item ainda não tem external ID no provider, o bistrô pode gerar um ID local e publicá-lo manualmente ou por API quando o provider suportar."}
                </p>
              </label>

              <label className="space-y-2 md:col-span-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                  Nome local
                </span>
                <input
                  className={fieldClassName}
                  onChange={(event) =>
                    setManualForm((current) => ({
                      ...current,
                      menuItemName: event.target.value,
                    }))
                  }
                  placeholder="Club Sandwich"
                  value={manualForm.menuItemName}
                />
              </label>

              <label className="space-y-2 md:col-span-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                  Cozinha
                </span>
                <select
                  className={fieldClassName}
                  onChange={(event) =>
                    setManualForm((current) => ({
                      ...current,
                      kitchenId: event.target.value,
                    }))
                  }
                  value={manualForm.kitchenId}
                >
                  {data.kitchens.map((kitchen) => (
                    <option key={kitchen.id} value={kitchen.id}>
                      {localizeKitchenLabel(kitchen.name)}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-end gap-3 md:col-span-1">
                <Button
                  className="w-full"
                  disabled={busyActionKey === "manual-form"}
                  type="submit"
                >
                  <WandSparkles className="size-4" />
                  Salvar mapping
                </Button>
              </div>

              <div className="flex flex-wrap items-end gap-3 md:col-span-1">
                {data.providerExternalIdSupport?.mode === "manual_assist" ? (
                  <Button
                    disabled={busyActionKey === "manual-form"}
                    onClick={() => generateManualAssistDraftId()}
                    type="button"
                    variant="secondary"
                  >
                    <WandSparkles className="size-4" />
                    Gerar ID do bistrô
                  </Button>
                ) : null}
                {manualForm.providerExternalId ? (
                  <Button
                    disabled={busyActionKey === "manual-form"}
                    onClick={() => copyManualProviderExternalId()}
                    type="button"
                    variant="secondary"
                  >
                    <Copy className="size-4" />
                    Copiar external ID
                  </Button>
                ) : null}
              </div>

              {manualForm.publishProviderExternalId ? (
                <div className="md:col-span-2">
                  <p className="rounded-[1rem] border border-[var(--panel-border)] bg-[var(--panel-elevated)] px-4 py-3 text-sm leading-6 text-[var(--ink-soft)]">
                    Ao salvar, o sistema também tentará publicar este external ID
                    no provider usando a capability `api_write`.
                  </p>
                </div>
              ) : null}
            </form>
          </Card>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="space-y-5 p-5">
            <div className="space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--ink-muted)]">
                Itens pendentes
              </p>
              <h2 className="font-display text-4xl uppercase tracking-[0.08em] text-[var(--ink-strong)]">
                Sugestões do provider
              </h2>
              <p className="text-sm leading-6 text-[var(--ink-soft)]">
                Estes itens apareceram no provider, mas ainda não têm routing
                local definido. Se houver `externalID`, o mapping pode ser
                criado com um clique sem expor o ID bruto como chave local.
              </p>
            </div>

            {actionablePendingItems.length === 0 && blockedPendingItems.length === 0 ? (
              <div className="rounded-[1.4rem] border border-dashed border-[var(--panel-border-strong)] bg-[var(--panel-elevated)] px-5 py-6 text-sm leading-6 text-[var(--ink-soft)]">
                Nenhum item pendente encontrado. Quando um pedido confirmado trouxer
                uma chave nova do provider, ele aparecerá aqui.
              </div>
            ) : null}

            {actionablePendingItems.length > 0 ? (
              <div className="grid gap-4">
                {actionablePendingItems.map((item) => (
                  <div
                    className="rounded-[1.5rem] border border-[var(--panel-border)] bg-[rgba(255,255,255,0.92)] p-4"
                    key={item.key}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-2">
                        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
                          {item.providerExternalId
                            ? protectProviderValue(item.providerExternalId)
                            : "Sem external ID"}
                        </p>
                        <h3 className="text-lg font-semibold text-[var(--ink-strong)]">
                          {item.latestName}
                        </h3>
                        <p className="text-sm leading-6 text-[var(--ink-soft)]">
                          {item.seenOrderCount > 0
                            ? `Visto em ${item.seenOrderCount} pedido(s). Última leitura ${formatMinutesFrom(item.lastSeenAt)} atrás.`
                            : `Lido diretamente do catálogo do provider. Última leitura ${formatMinutesFrom(item.lastSeenAt)} atrás.`}
                        </p>
                        {item.providerItemId ? (
                          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                            Item provider: {protectProviderValue(item.providerItemId)}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {data.kitchens.map((kitchen) => (
                          <Button
                            disabled={
                              busyActionKey === `pending:${item.key}:${kitchen.id}`
                            }
                            key={kitchen.id}
                            onClick={() => saveQuickMapping(item, kitchen.id)}
                            size="sm"
                          >
                            {localizeKitchenLabel(kitchen.name)}
                          </Button>
                        ))}
                        <Button
                          onClick={() => prefillManualForm(item)}
                          size="sm"
                          variant="secondary"
                        >
                          Revisar no formulário
                        </Button>
                      </div>
                    </div>

                    {item.sourceOrders.length > 0 ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {item.sourceOrders.map((order) => (
                          <span
                            className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ink-muted)]"
                            key={`${item.key}:${order.externalOrderId}`}
                          >
                            {order.reference}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            {blockedPendingItems.length > 0 ? (
              <div className="grid gap-4">
                {blockedPendingItems.map((item) => (
                  <div
                    className="rounded-[1.5rem] border border-[color-mix(in_oklab,var(--accent-warm)_42%,white)] bg-[color-mix(in_oklab,var(--accent-warm)_10%,white)] p-4"
                    key={item.key}
                  >
                    <div className="flex items-start gap-3">
                      <TriangleAlert className="mt-0.5 size-5 text-[color-mix(in_oklab,var(--accent-warm)_84%,black)]" />
                      <div className="space-y-2">
                        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
                          Sem chave externa utilizável
                        </p>
                        <h3 className="text-lg font-semibold text-[var(--ink-strong)]">
                          {item.latestName}
                        </h3>
                        <p className="text-sm leading-6 text-[var(--ink-soft)]">
                          Este item foi lido no provider sem `externalID`. O
                          sistema pode gerar agora um ID do bistrô, salvar o
                          binding local e
                          {data.providerExternalIdSupport?.mode === "api_write"
                            ? " tentar publicar esse valor automaticamente no provider."
                            : " te entregar o valor para publicação manual no provider."}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {data.kitchens.map((kitchen) => (
                            <Button
                              disabled={
                                busyActionKey === `blocked:${item.key}:${kitchen.id}`
                              }
                              key={kitchen.id}
                              onClick={() =>
                                createProviderDraftForBlockedItem(item, kitchen.id)
                              }
                              size="sm"
                            >
                              Gerar ID para {localizeKitchenLabel(kitchen.name)}
                            </Button>
                          ))}
                          <Button
                            onClick={() => prefillManualForm(item)}
                            size="sm"
                            variant="secondary"
                          >
                            Revisar no formulário
                          </Button>
                        </div>
                        {item.sourceOrders.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {item.sourceOrders.map((order) => (
                              <span
                                className="rounded-full border border-[color-mix(in_oklab,var(--accent-warm)_42%,white)] bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[color-mix(in_oklab,var(--accent-warm)_82%,black)]"
                                key={`${item.key}:${order.externalOrderId}`}
                              >
                                {order.reference}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </Card>

          <Card className="space-y-5 p-5">
            <div className="space-y-2">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--ink-muted)]">
                Base local
              </p>
              <h2 className="font-display text-4xl uppercase tracking-[0.08em] text-[var(--ink-strong)]">
                Mappings atuais
              </h2>
              <p className="text-sm leading-6 text-[var(--ink-soft)]">
                Como existem só duas cozinhas, a troca de linha pode ser feita
                diretamente nesta lista com reatribuição rápida.
              </p>
            </div>

            <div className="grid gap-3">
              {data.mappings.map((mapping) => (
                <div
                  className="rounded-[1.35rem] border border-[var(--panel-border)] bg-[rgba(255,255,255,0.9)] px-4 py-4"
                  key={mapping.menuItemId}
                >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[var(--ink-muted)]">
                          {mapping.menuItemId}
                        </p>
                        <p className="mt-1 text-base font-semibold text-[var(--ink-strong)]">
                          {mapping.menuItemName}
                        </p>
                        <p className="mt-1 text-sm text-[var(--ink-soft)]">
                          {localizeKitchenLabel(mapping.kitchenName)}
                        </p>
                        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                          {mapping.providerExternalId
                            ? protectProviderValue(mapping.providerExternalId)
                            : "Sem vínculo externo"}
                        </p>
                        {mapping.providerItemId ? (
                          <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--ink-muted)]">
                            Item provider: {protectProviderValue(mapping.providerItemId)}
                          </p>
                        ) : null}
                      </div>

                    <div className="flex flex-wrap gap-2">
                      {data.kitchens.map((kitchen) => (
                        <Button
                          disabled={
                            mapping.kitchenId === kitchen.id ||
                            busyActionKey ===
                              `existing:${mapping.menuItemId}:${kitchen.id}`
                          }
                          key={kitchen.id}
                          onClick={() =>
                            saveExistingMapping(
                              mapping.menuItemId,
                              mapping.menuItemName,
                              kitchen.id,
                            )
                          }
                          size="sm"
                          variant={
                            mapping.kitchenId === kitchen.id ? "secondary" : "default"
                          }
                        >
                          {mapping.kitchenId === kitchen.id
                            ? `${localizeKitchenLabel(kitchen.name)} atual`
                            : localizeKitchenLabel(kitchen.name)}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </section>
      </div>
      <CatalogToastViewport onDismiss={dismissToast} toasts={toasts} />
      {publishDraft && data.providerExternalIdSupport && publishDraftDialogOpen ? (
        <CatalogPublishDraftDialog
          onClose={() => {
            setPublishDraftDialogOpen(false);
            setPublishDraft(null);
          }}
          onCopy={copyPublishDraftValue}
          publishDraft={publishDraft}
          support={data.providerExternalIdSupport}
        />
      ) : null}
    </main>
  );
}

function CatalogPublishDraftDialog({
  onClose,
  onCopy,
  publishDraft,
  support,
}: {
  onClose(): void;
  onCopy(): void;
  publishDraft: PublishDraftState;
  support: NonNullable<CatalogMappingPageData["providerExternalIdSupport"]>;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(24,22,19,0.56)] px-4 py-6 backdrop-blur-sm">
      <Card className="w-full max-w-2xl space-y-4 border-[color-mix(in_oklab,var(--accent-cold)_32%,white)] bg-[rgba(255,255,255,0.97)] p-5 shadow-[0_28px_90px_rgba(24,22,19,0.26)]">
        <div className="space-y-2">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--ink-muted)]">
            Draft de publicação
          </p>
          <h2 className="font-display text-3xl uppercase tracking-[0.08em] text-[var(--ink-strong)]">
            {support.providerLabel}
          </h2>
          <p className="text-sm leading-6 text-[var(--ink-soft)]">
            {support.summary}
          </p>
        </div>

        <div className="rounded-[1.5rem] border border-[var(--panel-border)] bg-white/80 p-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
            ID do bistrô para {publishDraft.itemName}
          </p>
          <p className="mt-2 break-all font-mono text-sm text-[var(--ink-strong)]">
            {publishDraft.providerExternalId ?? publishDraft.localMenuItemId}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button onClick={onCopy} size="sm">
              <Copy className="size-4" />
              Copiar ID
            </Button>
            {support.helpUrl ? (
              <Button asChild size="sm" variant="secondary">
                <Link href={support.helpUrl} target="_blank">
                  Abrir ajuda do provider
                  <ArrowUpRight className="size-4" />
                </Link>
              </Button>
            ) : null}
            <Button onClick={onClose} size="sm" variant="secondary">
              Fechar
            </Button>
          </div>
        </div>

        <div className="grid gap-2">
          {support.instructions.map((instruction) => (
            <div
              className="rounded-[1rem] border border-[var(--panel-border)] bg-white/70 px-4 py-3 text-sm leading-6 text-[var(--ink-soft)]"
              key={instruction}
            >
              {instruction}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function CatalogToastViewport({
  onDismiss,
  toasts,
}: {
  onDismiss(toastId: string): void;
  toasts: CatalogToast[];
}) {
  if (toasts.length === 0) {
    return null;
  }

  const variantClasses: Record<CatalogToast["variant"], string> = {
    error:
      "border-[color-mix(in_oklab,var(--accent-hot)_36%,white)] bg-[color-mix(in_oklab,var(--accent-hot)_10%,white)]",
    info:
      "border-[color-mix(in_oklab,var(--accent-cold)_30%,white)] bg-[color-mix(in_oklab,var(--accent-cold)_10%,white)]",
    success:
      "border-[color-mix(in_oklab,var(--accent-herb)_32%,white)] bg-[color-mix(in_oklab,var(--accent-herb)_12%,white)]",
  };

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-3">
      {toasts.map((toast) => (
        <div
          className={cn(
            "pointer-events-auto rounded-[1.4rem] border px-4 py-4 shadow-[0_18px_42px_rgba(24,22,19,0.2)] backdrop-blur-sm",
            variantClasses[toast.variant],
          )}
          key={toast.id}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-semibold text-[var(--ink-strong)]">
                {toast.title}
              </p>
              {toast.description ? (
                <p className="text-sm leading-6 text-[var(--ink-soft)]">
                  {toast.description}
                </p>
              ) : null}
            </div>
            <Button
              className="h-8 rounded-full px-3"
              onClick={() => onDismiss(toast.id)}
              size="sm"
              variant="secondary"
            >
              Fechar
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card className="border-[var(--panel-border)] bg-[var(--panel-elevated)] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--ink-muted)]">
          {label}
        </p>
        <Icon className="size-5 text-[var(--accent-hot)]" />
      </div>
      <p className="mt-4 font-display text-5xl uppercase tracking-[0.08em] text-[var(--ink-strong)]">
        {value}
      </p>
    </Card>
  );
}
