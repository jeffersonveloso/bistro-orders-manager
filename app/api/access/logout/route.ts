import {
  areaAccessCookieName,
  clearAreaSessionCookie,
  shouldUseSecureAreaCookies,
} from "@/src/infrastructure/area-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface AccessLogoutRouteDependencies {
  cookieName?: string;
  env?: NodeJS.ProcessEnv;
  secureCookies?: boolean;
}

export async function POST(request: Request) {
  return handlePostAccessLogout(request);
}

export function handlePostAccessLogout(
  request: Pick<Request, "headers" | "url">,
  dependencies: AccessLogoutRouteDependencies = {},
) {
  const env = dependencies.env ?? process.env;
  const secureCookies =
    dependencies.secureCookies ??
    shouldUseSecureAreaCookies(request, env.NODE_ENV !== "development");

  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Set-Cookie": clearAreaSessionCookie({
        cookieName: dependencies.cookieName ?? areaAccessCookieName,
        secureCookies,
      }),
    },
  });
}
