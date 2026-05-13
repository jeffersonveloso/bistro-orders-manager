import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AccessEntryForm, type AccessEntryNotice } from "@/src/components/access/access-entry-form";
import { getCanonicalAreaPath, isAreaId, type AreaId } from "@/src/domain/area-access";
import {
  areaAccessCookieName,
  AreaAccessConfigurationError,
  type AreaSessionVerificationFailureReason,
  loadAreaAccessRuntimeConfig,
  verifyAreaSessionValue,
} from "@/src/infrastructure/area-session";

export const dynamic = "force-dynamic";

export default async function AccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string | string[];
    next?: string | string[];
    area?: string | string[];
    reason?: string | string[];
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const accessMode = readFirstSearchParam(resolvedSearchParams.mode);
  const next = readFirstSearchParam(resolvedSearchParams.next);
  const requestedArea = readFirstSearchParam(resolvedSearchParams.area);
  const explicitReason = readFirstSearchParam(resolvedSearchParams.reason);
  const initialAreaId: AreaId | undefined = requestedArea && isAreaId(requestedArea)
    ? requestedArea
    : undefined;
  const switchMode = accessMode === "switch";
  const cookieStore = await cookies();
  const rawSessionValue = cookieStore.get(areaAccessCookieName)?.value;
  let initialNotice =
    resolveReasonNotice(explicitReason) ?? resolveAccessModeNotice(accessMode);
  let unavailableMessage: string | undefined;

  try {
    const config = loadAreaAccessRuntimeConfig();
    const sessionResult = verifyAreaSessionValue(rawSessionValue, config);

    if (sessionResult.ok && !switchMode) {
      redirect(getCanonicalAreaPath(sessionResult.session.areaId));
    }

    const sessionNotice = sessionResult.ok
      ? undefined
      : resolveSessionFailureNotice(sessionResult.reason);

    if (sessionNotice) {
      initialNotice = sessionNotice;
    }
  } catch (error) {
    if (error instanceof AreaAccessConfigurationError) {
      unavailableMessage = error.message;
    } else {
      throw error;
    }
  }

  return (
    <AccessEntryForm
      initialAreaId={initialAreaId}
      initialNext={next}
      initialNotice={initialNotice}
      unavailableMessage={unavailableMessage}
    />
  );
}

function readFirstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function resolveReasonNotice(reason?: string): AccessEntryNotice | undefined {
  switch (reason) {
    case "expired":
      return {
        message: "A sessao da area expirou. Informe o PIN novamente para continuar.",
        tone: "warning",
      };
    case "signed_out":
      return {
        message: "Sessao encerrada. Escolha a area para seguir com a operacao.",
        tone: "info",
      };
    case "invalid_pin":
      return {
        message: "PIN invalido. Confira a area selecionada e tente novamente.",
        tone: "error",
      };
    case "invalid_payload":
      return {
        message: "Nao foi possivel ler os dados de acesso. Tente novamente.",
        tone: "warning",
      };
    case "config_unavailable":
      return {
        message:
          "A configuracao de acesso ainda nao esta pronta nesta estacao.",
        tone: "warning",
      };
    default:
      return undefined;
  }
}

function resolveAccessModeNotice(mode?: string): AccessEntryNotice | undefined {
  if (mode !== "switch") {
    return undefined;
  }

  return {
    message:
      "Modo de troca de area ativo. Escolha a proxima area e informe o PIN para continuar.",
    tone: "info",
  };
}

function resolveSessionFailureNotice(
  reason: AreaSessionVerificationFailureReason,
): AccessEntryNotice | undefined {
  switch (reason) {
    case "expired":
      return {
        message: "A sessao anterior expirou. Informe o PIN da area novamente.",
        tone: "warning",
      };
    case "invalid_signature":
    case "malformed":
    case "unsupported_version":
      return {
        message: "A sessao anterior nao e mais valida. Entre novamente na area.",
        tone: "warning",
      };
    default:
      return undefined;
  }
}
