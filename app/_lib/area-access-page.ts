import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { AreaAccessService } from "@/src/application/area-access-service";
import {
  AreaAuthorizationError,
  createAreaAccessService,
} from "@/src/application/area-access-service";
import {
  getCanonicalAreaPath,
  type AreaSession,
  type KitchenAreaId,
} from "@/src/domain/area-access";
import {
  areaAccessCookieName,
  AreaAccessConfigurationError,
  type AreaAccessRuntimeConfig,
  type AreaSessionVerificationFailureReason,
  loadAreaAccessRuntimeConfig,
  verifyAreaSessionValue,
} from "@/src/infrastructure/area-session";

interface CookieStoreLike {
  get(name: string): { value: string } | undefined;
}

export interface AreaPageDependencies {
  areaAccessService?: AreaAccessService;
  config?: AreaAccessRuntimeConfig;
  cookieStore?: CookieStoreLike;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}

export interface AuthorizedAreaPageContext {
  areaAccessService: AreaAccessService;
  config: AreaAccessRuntimeConfig;
  session: AreaSession;
}

export interface AuthorizedKitchenPageContext extends AuthorizedAreaPageContext {
  kitchenId: KitchenAreaId;
}

export async function requireAreaPageAccess(
  dependencies: AreaPageDependencies = {},
) {
  const runtime = resolveAreaPageRuntime(dependencies);
  const cookieStore = dependencies.cookieStore ?? (await cookies());
  const rawSessionValue = cookieStore.get(areaAccessCookieName)?.value;
  const sessionResult = verifyAreaSessionValue(
    rawSessionValue,
    runtime.config,
    runtime.now,
  );

  if (!sessionResult.ok) {
    redirect(buildAccessRedirectTarget(sessionResult.reason));
  }

  return {
    areaAccessService: runtime.areaAccessService,
    config: runtime.config,
    session: sessionResult.session,
  } satisfies AuthorizedAreaPageContext;
}

export async function requireKitchenPageAccess(
  dependencies: AreaPageDependencies = {},
) {
  const context = await requireAreaPageAccess(dependencies);

  try {
    return {
      ...context,
      kitchenId: context.areaAccessService.requireKitchenArea(context.session),
    } satisfies AuthorizedKitchenPageContext;
  } catch (error) {
    if (error instanceof AreaAuthorizationError) {
      redirect(getCanonicalAreaPath(context.session.areaId));
    }

    throw error;
  }
}

export async function requireSalonPageAccess(
  dependencies: AreaPageDependencies = {},
) {
  const context = await requireAreaPageAccess(dependencies);

  try {
    context.areaAccessService.requireSalonArea(context.session);
    return context;
  } catch (error) {
    if (error instanceof AreaAuthorizationError) {
      redirect(getCanonicalAreaPath(context.session.areaId));
    }

    throw error;
  }
}

function resolveAreaPageRuntime(dependencies: AreaPageDependencies): {
  areaAccessService: AreaAccessService;
  config: AreaAccessRuntimeConfig;
  now: Date;
} {
  try {
    const now = dependencies.now ?? new Date();
    const config =
      dependencies.config ?? loadAreaAccessRuntimeConfig(dependencies.env);

    return {
      areaAccessService:
        dependencies.areaAccessService ??
        createAreaAccessService(config, () => now),
      config,
      now,
    };
  } catch (error) {
    if (error instanceof AreaAccessConfigurationError) {
      redirect("/access");
    }

    throw error;
  }
}

function buildAccessRedirectTarget(
  reason: AreaSessionVerificationFailureReason,
) {
  return reason === "expired" ? "/access?reason=expired" : "/access";
}
