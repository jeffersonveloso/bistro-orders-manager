import {
  AreaAuthenticationError,
  createAreaAccessService,
  type AreaAccessService,
} from "@/src/application/area-access-service";
import { isAreaId } from "@/src/domain/area-access";
import {
  AreaAccessConfigurationError,
  createAreaSessionCookie,
  loadAreaAccessRuntimeConfig,
  type AreaAccessRuntimeConfig,
} from "@/src/infrastructure/area-session";
import {
  areaAccessConfigurationResponse,
} from "@/app/api/_lib/area-access-route";
import {
  jsonNoStore,
  normalizeOptionalString,
  readJsonObject,
} from "@/app/api/_lib/provider-sync-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface AccessSessionRouteDependencies {
  areaAccessService?: AreaAccessService;
  config?: AreaAccessRuntimeConfig;
  env?: NodeJS.ProcessEnv;
  now?: Date;
}

export async function POST(request: Request) {
  return handlePostAccessSession(request);
}

export async function handlePostAccessSession(
  request: Request,
  dependencies: AccessSessionRouteDependencies = {},
) {
  const bodyResult = await readJsonObject(request);

  if (!bodyResult.ok) {
    return bodyResult.response;
  }

  const parsedLoginRequest = parseLoginRequest(bodyResult.value);

  if (!parsedLoginRequest.ok) {
    return jsonNoStore("Invalid access payload", { status: 400 });
  }

  let runtime: {
    areaAccessService: AreaAccessService;
    config: AreaAccessRuntimeConfig;
  };

  try {
    const now = dependencies.now ?? new Date();
    const config =
      dependencies.config ?? loadAreaAccessRuntimeConfig(dependencies.env);

    runtime = {
      areaAccessService:
        dependencies.areaAccessService ??
        createAreaAccessService(config, () => now),
      config,
    };
  } catch (error) {
    if (error instanceof AreaAccessConfigurationError) {
      return areaAccessConfigurationResponse(error.message);
    }

    throw error;
  }

  try {
    const session = runtime.areaAccessService.authenticate(
      parsedLoginRequest.value.areaId,
      parsedLoginRequest.value.pin,
    );
    const redirectTo = runtime.areaAccessService.resolveNextTarget(
      session,
      parsedLoginRequest.value.next,
    );

    return jsonNoStore(
      {
        areaId: session.areaId,
        redirectTo,
      },
      {
        headers: {
          "Set-Cookie": createAreaSessionCookie(session, runtime.config),
        },
      },
    );
  } catch (error) {
    if (error instanceof AreaAuthenticationError) {
      return jsonNoStore("Invalid area PIN", { status: 401 });
    }

    throw error;
  }
}

function parseLoginRequest(body: Record<string, unknown>) {
  const areaId = normalizeOptionalString(body.areaId);
  const pin = typeof body.pin === "string" ? body.pin : undefined;
  const next = normalizeOptionalString(body.next);

  if (!areaId || !isAreaId(areaId) || typeof pin !== "string" || pin.trim().length === 0) {
    return { ok: false } as const;
  }

  return {
    ok: true,
    value: {
      areaId,
      next,
      pin,
    },
  } as const;
}
