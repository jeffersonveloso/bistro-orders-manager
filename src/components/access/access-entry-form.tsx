"use client";

import { ArrowRight, ChefHat, Store } from "lucide-react";
import { useState } from "react";

import type { AreaId } from "@/src/domain/area-access";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { cn } from "@/src/lib/utils";

export interface AccessEntryNotice {
  message: string;
  tone: "error" | "info" | "warning";
}

const areaOptions: Array<{
  areaId: AreaId;
  description: string;
  icon: typeof ChefHat;
  label: string;
  routeLabel: string;
}> = [
  {
    areaId: "kitchen-1",
    description: "Fila principal de bebidas, empratados leves e finalizacoes.",
    icon: ChefHat,
    label: "Cozinha 1",
    routeLabel: "Board da cozinha",
  },
  {
    areaId: "kitchen-2",
    description: "Linha de fornadas, massas e itens quentes da producao.",
    icon: ChefHat,
    label: "Cozinha 2",
    routeLabel: "Board da cozinha",
  },
  {
    areaId: "salon",
    description: "Acompanhamento consolidado para atendimento e expedicao.",
    icon: Store,
    label: "Salao",
    routeLabel: "Resumo do atendimento",
  },
];

export function AccessEntryForm({
  initialAreaId,
  initialNext,
  initialNotice,
  unavailableMessage,
}: {
  initialAreaId?: AreaId;
  initialNext?: string;
  initialNotice?: AccessEntryNotice;
  unavailableMessage?: string;
}) {
  const defaultAreaId = initialAreaId ?? deriveInitialAreaId(initialNext);
  const [selectedAreaId, setSelectedAreaId] = useState(defaultAreaId);
  const accessDisabled = Boolean(unavailableMessage);

  return (
    <main className="min-h-dvh px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] md:px-6 md:py-6">
      <div className="mx-auto grid min-h-[calc(100dvh-2rem)] max-w-[1680px] gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="order-2 overflow-hidden border-[var(--panel-border-strong)] bg-[linear-gradient(145deg,rgba(255,250,242,0.95),rgba(243,229,209,0.92))] p-6 md:p-8 lg:order-1">
          <div className="flex h-full flex-col justify-between gap-8">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full border border-[var(--panel-border-strong)] bg-[var(--accent-hot)]/18 px-3 py-1 font-mono text-xs uppercase tracking-[0.28em] text-[var(--accent-hot)]">
                  Vó Ziluca
                </span>
                <span className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--ink-muted)]">
                  Acesso operacional por area
                </span>
              </div>

              <div className="space-y-3">
                <h1 className="font-display text-5xl uppercase tracking-[0.08em] text-[var(--ink-strong)] md:text-7xl">
                  Entre na sua area de trabalho
                </h1>
                <p className="max-w-2xl text-base leading-7 text-[var(--ink-soft)] md:text-lg">
                  Cada estacao entra com o proprio PIN e acompanha apenas a
                  superficie liberada para cozinha ou salao.
                </p>
                <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--ink-muted)]">
                  A selecao e o acesso funcionam direto no navegador, mesmo sem
                  JavaScript.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {areaOptions.map((option) => {
                const Icon = option.icon;
                const isSelected = option.areaId === selectedAreaId;

                return (
                  <div
                    className={cn(
                      "rounded-[1.6rem] border bg-white/72 p-4 shadow-[0_12px_32px_rgba(23,19,15,0.08)]",
                      isSelected
                        ? "border-[var(--panel-border-strong)] bg-[color-mix(in_oklab,var(--accent-hot)_14%,white)]"
                        : "border-[var(--panel-border)]",
                    )}
                    data-testid={`access-hero-area-${option.areaId}`}
                    key={option.areaId}
                  >
                    <div className="flex items-center gap-3 text-[var(--ink-strong)]">
                      <span className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] p-2">
                        <Icon className="size-5" />
                      </span>
                      <p className="font-display text-2xl uppercase tracking-[0.08em]">
                        {option.label}
                      </p>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[var(--ink-soft)]">
                      {option.description}
                    </p>
                    <p className="mt-4 font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--ink-muted)]">
                      {option.routeLabel}
                    </p>
                    <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--accent-hot)]">
                      {isSelected ? "Area selecionada" : "Disponivel no acesso"}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        <Card className="order-1 border-[var(--panel-border-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,240,229,0.96))] p-5 md:p-8 lg:order-2">
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--ink-muted)]">
                Liberar estacao
              </p>
              <h2 className="font-display text-4xl uppercase tracking-[0.08em] text-[var(--ink-strong)] md:text-5xl">
                Escolha a area e informe o PIN
              </h2>
            </div>

            <form
              action="/access/enter"
              className="space-y-6"
              id="access-form"
              method="post"
            >
              {initialNext ? (
                <input name="next" type="hidden" value={initialNext} />
              ) : null}

              <fieldset className="space-y-3">
                <legend className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--ink-muted)]">
                  Area
                </legend>
                <div className="grid gap-3">
                  {areaOptions.map((option) => (
                    <label
                      aria-pressed={option.areaId === selectedAreaId}
                      className="block cursor-pointer"
                      data-testid={`access-area-${option.areaId}`}
                      key={option.areaId}
                    >
                      <input
                        className="peer sr-only"
                        defaultChecked={option.areaId === defaultAreaId}
                        name="areaId"
                        onChange={() => setSelectedAreaId(option.areaId)}
                        type="radio"
                        value={option.areaId}
                      />
                      <span
                        className={cn(
                          "flex touch-manipulation items-center justify-between gap-3 rounded-[1.6rem] border px-4 py-4 text-left transition peer-focus-visible:outline-none peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--ring-strong)] peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-transparent",
                          "border-[var(--panel-border)] bg-[var(--panel-elevated)]",
                          "peer-checked:border-[var(--panel-border-strong)] peer-checked:bg-[color-mix(in_oklab,var(--accent-hot)_18%,white)] peer-checked:shadow-[0_18px_35px_rgba(239,139,69,0.14)]",
                        )}
                      >
                        <span>
                          <span className="font-display text-2xl uppercase tracking-[0.08em] text-[var(--ink-strong)]">
                            {option.label}
                          </span>
                          <span className="mt-1 block text-sm leading-6 text-[var(--ink-soft)]">
                            {option.description}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.24em]",
                            "border-[var(--panel-border)] text-[var(--ink-muted)]",
                            "peer-checked:border-[var(--panel-border-strong)] peer-checked:bg-white/80 peer-checked:text-[var(--ink-strong)]",
                          )}
                        >
                          {option.areaId === selectedAreaId
                            ? "Selecionada"
                            : "Tocar para abrir"}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div className="space-y-3">
                <label
                  className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--ink-muted)]"
                  htmlFor="access-pin"
                >
                  PIN da area
                </label>
                <input
                  autoComplete="current-password"
                  className="h-16 w-full rounded-[1.5rem] border border-[var(--panel-border-strong)] bg-white px-5 text-2xl tracking-[0.22em] text-[var(--ink-strong)] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)] outline-none transition placeholder:text-[var(--ink-muted)] focus:border-[var(--accent-hot)] focus:ring-4 focus:ring-[var(--ring-strong)]"
                  data-testid="access-pin-input"
                  disabled={accessDisabled}
                  enterKeyHint="go"
                  id="access-pin"
                  inputMode="numeric"
                  name="pin"
                  pattern="[0-9]*"
                  placeholder="Digite o PIN"
                  required
                  type="password"
                />
              </div>

              {unavailableMessage ? (
                <div className="rounded-[1.5rem] border border-[color-mix(in_oklab,var(--accent-hot)_42%,white)] bg-[color-mix(in_oklab,var(--accent-hot)_12%,white)] px-4 py-4 text-sm leading-6 text-[var(--ink-strong)]">
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--accent-hot)]">
                    Configuracao pendente
                  </p>
                  <p className="mt-2">{unavailableMessage}</p>
                </div>
              ) : initialNotice ? (
                <div
                  className={cn(
                    "rounded-[1.5rem] border px-4 py-4 text-sm leading-6",
                    initialNotice.tone === "error" &&
                      "border-[color-mix(in_oklab,var(--accent-hot)_42%,white)] bg-[color-mix(in_oklab,var(--accent-hot)_12%,white)] text-[var(--ink-strong)]",
                    initialNotice.tone === "warning" &&
                      "border-[color-mix(in_oklab,var(--accent-warm)_42%,white)] bg-[color-mix(in_oklab,var(--accent-warm)_12%,white)] text-[var(--ink-strong)]",
                    initialNotice.tone === "info" &&
                      "border-[var(--panel-border-strong)] bg-[var(--panel)] text-[var(--ink-soft)]",
                  )}
                  data-testid="access-notice"
                >
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em]">
                    {initialNotice.tone === "error"
                      ? "Acesso bloqueado"
                      : initialNotice.tone === "warning"
                        ? "Atencao"
                        : "Informacao"}
                  </p>
                  <p className="mt-2">{initialNotice.message}</p>
                </div>
              ) : null}

              <Button
                className="h-16 w-full rounded-[1.5rem] text-base"
                data-testid="access-submit"
                disabled={accessDisabled}
                size="lg"
                type="submit"
              >
                Entrar na area
                <ArrowRight className="size-5" />
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </main>
  );
}

function deriveInitialAreaId(next?: string): AreaId {
  if (!next) {
    return "kitchen-1";
  }

  try {
    const parsedTarget = new URL(next, "http://localhost");
    const kitchenId = parsedTarget.searchParams.get("kitchen");

    if (kitchenId === "kitchen-1" || kitchenId === "kitchen-2") {
      return kitchenId;
    }

    if (parsedTarget.pathname === "/salon") {
      return "salon";
    }
  } catch {
    return "kitchen-1";
  }

  return "kitchen-1";
}
