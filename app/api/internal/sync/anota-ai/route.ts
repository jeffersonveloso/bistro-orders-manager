import {
  authenticateSharedSecret,
  createRuntimeProviderSyncService,
  jsonNoStore,
  normalizeOptionalString,
  providerSyncSecretHeaders,
  providerSyncSecretEnv,
  readJsonObject,
  type ProviderSyncRouteDependencies,
} from "@/app/api/_lib/provider-sync-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function handlePostAnotaReconciliation(
  request: Request,
  dependencies: ProviderSyncRouteDependencies = {},
) {
  const unauthorizedResponse = authenticateSharedSecret(request.headers, {
    env: dependencies.env,
    secretEnvKey: "reconcile",
    secretHeaderName: "reconcile",
  });

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  const body = await readJsonObject(request, { allowEmpty: true });

  if (!body.ok) {
    return body.response;
  }

  const externalOrderId = normalizeOptionalString(body.value.externalOrderId);
  const updatedSince = normalizeOptionalString(body.value.updatedSince);
  const parsedLimit = parseOptionalPositiveInteger(body.value.limit);

  if ("externalOrderId" in body.value && !externalOrderId) {
    return jsonNoStore("Invalid externalOrderId", { status: 400 });
  }

  if ("updatedSince" in body.value && !updatedSince) {
    return jsonNoStore("Invalid updatedSince", { status: 400 });
  }

  if ("limit" in body.value && parsedLimit === null) {
    return jsonNoStore("Invalid limit", { status: 400 });
  }

  const service = dependencies.service ?? createRuntimeProviderSyncService(dependencies.env);
  const result = await service.reconcileConfirmedOrders({
    provider: "anota_ai",
    externalOrderId,
    limit: parsedLimit ?? undefined,
    updatedSince,
  });

  return jsonNoStore(result);
}

export async function POST(request: Request) {
  return handlePostAnotaReconciliation(request);
}

function parseOptionalPositiveInteger(
  value: unknown,
): number | null | undefined {
  if (typeof value === "undefined") {
    return undefined;
  }

  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : null;
}

export { providerSyncSecretEnv, providerSyncSecretHeaders };
