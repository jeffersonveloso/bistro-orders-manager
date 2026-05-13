"use client";

import { ArrowRight, ChefHat, Store } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useState, type FormEvent } from "react";

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
  initialNext,
  initialNotice,
  unavailableMessage,
}: {
  initialNext?: string;
  initialNotice?: AccessEntryNotice;
  unavailableMessage?: string;
}) {
  const router = useRouter();
  const [selectedAreaId, setSelectedAreaId] = useState<AreaId>(
    deriveInitialAreaId(initialNext),
  );
  const [pin, setPin] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<AccessEntryNotice | undefined>(
    initialNotice,
  );

  const accessDisabled = Boolean(unavailableMessage);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (accessDisabled || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setNotice(undefined);

    try {
      const response = await fetch("/api/access/session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          areaId: selectedAreaId,
          next: initialNext,
          pin,
        }),
      });

      if (!response.ok) {
        setNotice({
          message: await readResponseMessage(
            response,
            response.status === 401
              ? "PIN invalido. Confira a area e tente novamente."
              : "Nao foi possivel abrir a area agora.",
          ),
          tone: response.status === 401 ? "error" : "warning",
        });
        setPin("");
        return;
      }

      const payload = (await response.json()) as {
        areaId: AreaId;
        redirectTo: string;
      };

      setPin("");
      startTransition(() => {
        router.replace(payload.redirectTo);
        router.refresh();
      });
    } catch {
      setNotice({
        message:
          "Falha de conexao ao liberar a area. Verifique a rede local e tente novamente.",
        tone: "warning",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-5 md:px-6 md:py-6">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-[1680px] gap-5 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="overflow-hidden border-[var(--panel-border-strong)] bg-[linear-gradient(145deg,rgba(255,250,242,0.95),rgba(243,229,209,0.92))] p-6 md:p-8">
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
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {areaOptions.map((option) => {
                const Icon = option.icon;

                return (
                  <div
                    className="rounded-[1.6rem] border border-[var(--panel-border)] bg-white/72 p-4 shadow-[0_12px_32px_rgba(23,19,15,0.08)]"
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
                  </div>
                );
              })}
            </div>
          </div>
        </Card>

        <Card className="border-[var(--panel-border-strong)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,240,229,0.96))] p-6 md:p-8">
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--ink-muted)]">
                Liberar estacao
              </p>
              <h2 className="font-display text-4xl uppercase tracking-[0.08em] text-[var(--ink-strong)] md:text-5xl">
                Escolha a area e informe o PIN
              </h2>
            </div>

            <form className="space-y-6" onSubmit={handleSubmit}>
              <fieldset className="space-y-3">
                <legend className="font-mono text-xs uppercase tracking-[0.28em] text-[var(--ink-muted)]">
                  Area
                </legend>
                <div className="grid gap-3">
                  {areaOptions.map((option) => {
                    const isSelected = option.areaId === selectedAreaId;

                    return (
                      <button
                        aria-pressed={isSelected}
                        className={cn(
                          "rounded-[1.6rem] border px-4 py-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring-strong)] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
                          isSelected
                            ? "border-[var(--panel-border-strong)] bg-[color-mix(in_oklab,var(--accent-hot)_18%,white)] shadow-[0_18px_35px_rgba(239,139,69,0.14)]"
                            : "border-[var(--panel-border)] bg-[var(--panel-elevated)] hover:border-[var(--panel-border-strong)] hover:bg-white",
                        )}
                        data-testid={`access-area-${option.areaId}`}
                        key={option.areaId}
                        onClick={() => setSelectedAreaId(option.areaId)}
                        type="button"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-display text-2xl uppercase tracking-[0.08em] text-[var(--ink-strong)]">
                              {option.label}
                            </p>
                            <p className="mt-1 text-sm leading-6 text-[var(--ink-soft)]">
                              {option.description}
                            </p>
                          </div>
                          <span
                            className={cn(
                              "rounded-full border px-3 py-1 font-mono text-[11px] uppercase tracking-[0.24em]",
                              isSelected
                                ? "border-[var(--panel-border-strong)] bg-white/80 text-[var(--ink-strong)]"
                                : "border-[var(--panel-border)] text-[var(--ink-muted)]",
                            )}
                          >
                            {isSelected ? "Selecionada" : "Tocar para abrir"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
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
                  disabled={accessDisabled || isSubmitting}
                  id="access-pin"
                  inputMode="numeric"
                  onChange={(event) => setPin(event.target.value)}
                  placeholder="Digite o PIN"
                  type="password"
                  value={pin}
                />
              </div>

              {unavailableMessage ? (
                <div className="rounded-[1.5rem] border border-[color-mix(in_oklab,var(--accent-hot)_42%,white)] bg-[color-mix(in_oklab,var(--accent-hot)_12%,white)] px-4 py-4 text-sm leading-6 text-[var(--ink-strong)]">
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-[var(--accent-hot)]">
                    Configuracao pendente
                  </p>
                  <p className="mt-2">{unavailableMessage}</p>
                </div>
              ) : notice ? (
                <div
                  className={cn(
                    "rounded-[1.5rem] border px-4 py-4 text-sm leading-6",
                    notice.tone === "error" &&
                      "border-[color-mix(in_oklab,var(--accent-hot)_42%,white)] bg-[color-mix(in_oklab,var(--accent-hot)_12%,white)] text-[var(--ink-strong)]",
                    notice.tone === "warning" &&
                      "border-[color-mix(in_oklab,var(--accent-warm)_42%,white)] bg-[color-mix(in_oklab,var(--accent-warm)_12%,white)] text-[var(--ink-strong)]",
                    notice.tone === "info" &&
                      "border-[var(--panel-border-strong)] bg-[var(--panel)] text-[var(--ink-soft)]",
                  )}
                  data-testid="access-notice"
                >
                  <p className="font-mono text-[11px] uppercase tracking-[0.24em]">
                    {notice.tone === "error"
                      ? "Acesso bloqueado"
                      : notice.tone === "warning"
                        ? "Atencao"
                        : "Informacao"}
                  </p>
                  <p className="mt-2">{notice.message}</p>
                </div>
              ) : null}

              <Button
                className="h-16 w-full rounded-[1.5rem] text-base"
                data-testid="access-submit"
                disabled={accessDisabled || isSubmitting || pin.trim().length === 0}
                size="lg"
                type="submit"
              >
                {isSubmitting ? "Liberando area..." : "Entrar na area"}
                <ArrowRight className="size-5" />
              </Button>
            </form>
          </div>
        </Card>
      </div>
    </main>
  );
}

async function readResponseMessage(response: Response, fallbackMessage: string) {
  try {
    const body = (await response.json()) as unknown;

    if (typeof body === "string" && body.length > 0) {
      return body;
    }

    if (
      typeof body === "object" &&
      body !== null &&
      "message" in body &&
      typeof body.message === "string" &&
      body.message.length > 0
    ) {
      return body.message;
    }
  } catch {
    return fallbackMessage;
  }

  return fallbackMessage;
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
