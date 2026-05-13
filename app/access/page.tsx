import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { AccessEntryForm, type AccessEntryNotice } from "@/src/components/access/access-entry-form";
import { getCanonicalAreaPath } from "@/src/domain/area-access";
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
    next?: string | string[];
    reason?: string | string[];
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const next = readFirstSearchParam(resolvedSearchParams.next);
  const explicitReason = readFirstSearchParam(resolvedSearchParams.reason);
  const cookieStore = await cookies();
  const rawSessionValue = cookieStore.get(areaAccessCookieName)?.value;
  let initialNotice = resolveReasonNotice(explicitReason);
  let unavailableMessage: string | undefined;

  try {
    const config = loadAreaAccessRuntimeConfig();
    const sessionResult = verifyAreaSessionValue(rawSessionValue, config);

    if (sessionResult.ok) {
      redirect(getCanonicalAreaPath(sessionResult.session.areaId));
    }

    const sessionNotice = resolveSessionFailureNotice(sessionResult.reason);

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
    default:
      return undefined;
  }
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
