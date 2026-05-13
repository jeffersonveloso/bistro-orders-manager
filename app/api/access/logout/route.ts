import {
  areaAccessCookieName,
  clearAreaSessionCookie,
} from "@/src/infrastructure/area-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface AccessLogoutRouteDependencies {
  cookieName?: string;
  env?: NodeJS.ProcessEnv;
  secureCookies?: boolean;
}

export async function POST() {
  return handlePostAccessLogout();
}

export function handlePostAccessLogout(
  dependencies: AccessLogoutRouteDependencies = {},
) {
  const env = dependencies.env ?? process.env;
  const secureCookies =
    dependencies.secureCookies ?? env.NODE_ENV !== "development";

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
