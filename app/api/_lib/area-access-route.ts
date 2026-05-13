import type { AreaAccessService } from "@/src/application/area-access-service";
import {
  AreaAuthorizationError,
  createAreaAccessService,
} from "@/src/application/area-access-service";
import type { AreaSession, KitchenAreaId } from "@/src/domain/area-access";
import {
  AreaAccessConfigurationError,
  type AreaAccessRuntimeConfig,
  shouldUseSecureAreaCookies,
  maybeCreateRenewedAreaSessionCookie,
  loadAreaAccessRuntimeConfig,
  verifyAreaSessionFromCookieHeader,
} from "@/src/infrastructure/area-session";
import { jsonNoStore } from "@/app/api/_lib/provider-sync-route";

export interface AreaAccessRouteDependencies {
  areaAccessService?: AreaAccessService;
  config?: AreaAccessRuntimeConfig;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}

export interface AuthorizedAreaRouteContext {
  areaAccessService: AreaAccessService;
  config: AreaAccessRuntimeConfig;
  request: Request;
  session: AreaSession;
}

export interface AuthorizedKitchenRouteContext
  extends AuthorizedAreaRouteContext {
  kitchenId: KitchenAreaId;
}

export function unauthorizedAreaResponse(message = "Unauthorized") {
  return jsonNoStore(message, { status: 401 });
}

export function forbiddenAreaResponse(message = "Forbidden") {
  return jsonNoStore(message, { status: 403 });
}

export function areaAccessConfigurationResponse(message: string) {
  return jsonNoStore(message, { status: 503 });
}

export async function withAreaSession(
  request: Request,
  onAuthorized: (
    context: AuthorizedAreaRouteContext,
  ) => Response | Promise<Response>,
  dependencies: AreaAccessRouteDependencies = {},
) {
  return withAreaAuthorization(
    request,
    {
      authorize() {
        return undefined;
      },
      onAuthorized,
    },
    dependencies,
  );
}

export async function withKitchenArea(
  request: Request,
  onAuthorized: (
    context: AuthorizedKitchenRouteContext,
  ) => Response | Promise<Response>,
  dependencies: AreaAccessRouteDependencies = {},
) {
  return withAreaAuthorization(
    request,
    {
      authorize(areaAccessService, session) {
        return areaAccessService.requireKitchenArea(session);
      },
      onAuthorized(context, kitchenId) {
        return onAuthorized({
          ...context,
          kitchenId,
        });
      },
    },
    dependencies,
  );
}

export async function withSalonArea(
  request: Request,
  onAuthorized: (
    context: AuthorizedAreaRouteContext,
  ) => Response | Promise<Response>,
  dependencies: AreaAccessRouteDependencies = {},
) {
  return withAreaAuthorization(
    request,
    {
      authorize(areaAccessService, session) {
        areaAccessService.requireSalonArea(session);

        return undefined;
      },
      onAuthorized,
    },
    dependencies,
  );
}

async function withAreaAuthorization<TAuthorization>(
  request: Request,
  options: {
    authorize: (
      areaAccessService: AreaAccessService,
      session: AreaSession,
    ) => TAuthorization;
    onAuthorized: (
      context: AuthorizedAreaRouteContext,
      authorization: TAuthorization,
    ) => Response | Promise<Response>;
  },
  dependencies: AreaAccessRouteDependencies,
) {
  const runtime = resolveAreaRouteRuntime(dependencies);

  if (!runtime.ok) {
    return runtime.response;
  }

  const sessionResult = verifyAreaSessionFromCookieHeader(
    request.headers.get("cookie"),
    runtime.value.config,
    runtime.value.now,
  );

  if (!sessionResult.ok) {
    return unauthorizedAreaResponse();
  }

  let authorization: TAuthorization;

  try {
    authorization = options.authorize(
      runtime.value.areaAccessService,
      sessionResult.session,
    );
  } catch (error) {
    if (error instanceof AreaAuthorizationError) {
      return forbiddenAreaResponse();
    }

    throw error;
  }

  const response = await options.onAuthorized(
    {
      areaAccessService: runtime.value.areaAccessService,
      config: runtime.value.config,
      request,
      session: sessionResult.session,
    },
    authorization,
  );

  const renewedCookie = maybeCreateRenewedAreaSessionCookie(
    sessionResult.session,
    {
      ...runtime.value.config,
      secureCookies: shouldUseSecureAreaCookies(
        request,
        runtime.value.config.secureCookies,
      ),
    },
    runtime.value.now,
  );

  if (renewedCookie) {
    response.headers.append("Set-Cookie", renewedCookie);
  }

  return response;
}

function resolveAreaRouteRuntime(
  dependencies: AreaAccessRouteDependencies,
):
  | {
      ok: true;
      value: {
        areaAccessService: AreaAccessService;
        config: AreaAccessRuntimeConfig;
        now: Date;
      };
    }
  | {
      ok: false;
      response: Response;
    } {
  try {
    const now = dependencies.now ?? new Date();
    const config =
      dependencies.config ?? loadAreaAccessRuntimeConfig(dependencies.env);

    return {
      ok: true,
      value: {
        areaAccessService:
          dependencies.areaAccessService ??
          createAreaAccessService(config, () => now),
        config,
        now,
      },
    };
  } catch (error) {
    if (error instanceof AreaAccessConfigurationError) {
      return {
        ok: false,
        response: areaAccessConfigurationResponse(error.message),
      };
    }

    throw error;
  }
}
