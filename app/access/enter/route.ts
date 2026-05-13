import { NextResponse } from "next/server";

import {
  AreaAuthenticationError,
  createAreaAccessService,
} from "@/src/application/area-access-service";
import { isAreaId } from "@/src/domain/area-access";
import {
  AreaAccessConfigurationError,
  createAreaSessionCookieOptions,
  getAreaRequestOrigin,
  loadAreaAccessRuntimeConfig,
  signAreaSession,
  shouldUseSecureAreaCookies,
} from "@/src/infrastructure/area-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const formData = await request.formData();
  const areaId = normalizeOptionalString(formData.get("areaId"));
  const next = normalizeOptionalString(formData.get("next"));
  const pin = normalizeOptionalString(formData.get("pin"));

  if (!areaId || !isAreaId(areaId) || !pin) {
    return redirectBackToAccess(request, {
      areaId,
      next,
      reason: "invalid_payload",
    });
  }

  try {
    const now = new Date();
    const config = loadAreaAccessRuntimeConfig();
    const areaAccessService = createAreaAccessService(config, () => now);
    const session = areaAccessService.authenticate(areaId, pin);
    const redirectTo = areaAccessService.resolveNextTarget(session, next);
    const targetUrl = new URL(redirectTo, getAreaRequestOrigin(request));
    const cookieConfig = {
      ...config,
      secureCookies: shouldUseSecureAreaCookies(request, config.secureCookies),
    };
    const response = new NextResponse(createAccessRedirectDocument(targetUrl), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "text/html; charset=utf-8",
      },
      status: 200,
    });

    response.cookies.set(
      cookieConfig.cookieName,
      signAreaSession(session, cookieConfig),
      createAreaSessionCookieOptions(cookieConfig),
    );

    return response;
  } catch (error) {
    if (error instanceof AreaAuthenticationError) {
      return redirectBackToAccess(request, {
        areaId,
        next,
        reason: "invalid_pin",
      });
    }

    if (error instanceof AreaAccessConfigurationError) {
      return redirectBackToAccess(request, {
        areaId,
        next,
        reason: "config_unavailable",
      });
    }

    throw error;
  }
}

function redirectBackToAccess(
  request: Request,
  {
    areaId,
    next,
    reason,
  }: {
    areaId?: string;
    next?: string;
    reason: "config_unavailable" | "invalid_payload" | "invalid_pin";
  },
) {
  const params = new URLSearchParams();

  if (areaId) {
    params.set("area", areaId);
  }

  if (next) {
    params.set("next", next);
  }

  params.set("reason", reason);

  return NextResponse.redirect(
    new URL(`/access?${params.toString()}`, getAreaRequestOrigin(request)),
    303,
  );
}

function normalizeOptionalString(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

function createAccessRedirectDocument(targetUrl: URL) {
  const escapedUrl = escapeHtml(targetUrl.toString());
  const jsonUrl = JSON.stringify(targetUrl.toString());

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="refresh" content="0;url=${escapedUrl}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Redirecionando</title>
  </head>
  <body style="margin:0;display:grid;min-height:100vh;place-items:center;background:#f6ecde;color:#18120d;font-family:system-ui,sans-serif;">
    <main style="max-width:28rem;padding:2rem;text-align:center;">
      <p style="margin:0 0 0.75rem;font-size:0.8rem;letter-spacing:0.3em;text-transform:uppercase;">Vó Ziluca</p>
      <h1 style="margin:0 0 1rem;font-size:2rem;line-height:1;text-transform:uppercase;">Acesso liberado</h1>
      <p style="margin:0;color:#4b4035;">Abrindo sua area de trabalho.</p>
      <p style="margin:1rem 0 0;">
        <a href="${escapedUrl}" style="color:#18120d;font-weight:600;">Continuar</a>
      </p>
    </main>
    <script>
      window.location.replace(${jsonUrl});
    </script>
  </body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
