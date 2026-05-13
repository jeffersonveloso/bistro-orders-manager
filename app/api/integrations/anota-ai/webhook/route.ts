import type { ProviderSyncService } from "@/src/application/ports";
import type { WebhookInput } from "@/src/domain/provider-sync";
import {
  authenticateSharedSecret,
  createRuntimeProviderSyncService,
  jsonNoStore,
  normalizeOptionalString,
  providerSyncSecretHeaders,
  providerSyncSecretEnv,
  readJsonObject,
  readNestedOptionalString,
  type ProviderSyncRouteDependencies,
} from "@/app/api/_lib/provider-sync-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const webhookEnvelopeEventTypePaths = [
  ["eventType"],
  ["event_type"],
  ["event"],
  ["topic"],
  ["type"],
] as const;

const webhookEnvelopeExternalOrderIdPaths = [
  ["externalOrderId"],
  ["external_order_id"],
  ["orderId"],
  ["order_id"],
  ["_id"],
  ["id"],
  ["data", "id"],
  ["data", "_id"],
  ["payload", "id"],
  ["payload", "_id"],
  ["info", "_id"],
] as const;

const webhookEnvelopeDeliveryKeyPaths = [
  ["deliveryKey"],
  ["delivery_key"],
  ["eventId"],
  ["event_id"],
  ["requestId"],
  ["request_id"],
] as const;

export async function handlePostAnotaWebhook(
  request: Request,
  dependencies: ProviderSyncRouteDependencies = {},
) {
  const unauthorizedResponse = authenticateSharedSecret(request.headers, {
    additionalHeaderNames: ["authorization"],
    env: dependencies.env,
    secretEnvKey: "webhook",
    secretHeaderName: "webhook",
  });

  if (unauthorizedResponse) {
    return unauthorizedResponse;
  }

  const body = await readJsonObject(request);

  if (!body.ok) {
    return body.response;
  }

  const envelope = parseAnotaWebhookEnvelope(body.value, request.headers);

  if (!envelope) {
    return jsonNoStore("Invalid webhook envelope", { status: 400 });
  }

  const service = dependencies.service ?? createRuntimeProviderSyncService(dependencies.env);
  const result = await service.handleWebhook({
    deliveryKey: envelope.deliveryKey,
    eventType: envelope.eventType,
    externalOrderId: envelope.externalOrderId,
    payload: body.value,
    provider: "anota_ai",
  });

  return jsonNoStore(result, {
    status: result.status === "failed" ? 500 : 200,
  });
}

export async function POST(request: Request) {
  return handlePostAnotaWebhook(request);
}

export function parseAnotaWebhookEnvelope(
  payload: Record<string, unknown>,
  headers: Headers,
): Pick<WebhookInput, "deliveryKey" | "eventType" | "externalOrderId"> | null {
  const externalOrderId = readFirstOptionalString(
    payload,
    webhookEnvelopeExternalOrderIdPaths,
  );
  const deliveryKey =
    normalizeOptionalString(headers.get("x-anota-delivery-key")) ??
    normalizeOptionalString(headers.get("x-delivery-key")) ??
    normalizeOptionalString(headers.get("x-webhook-delivery-key")) ??
    normalizeOptionalString(headers.get("x-request-id")) ??
    readFirstOptionalString(payload, webhookEnvelopeDeliveryKeyPaths) ??
    buildSyntheticDeliveryKey(payload, externalOrderId);
  const eventType =
    readFirstOptionalString(payload, webhookEnvelopeEventTypePaths) ??
    detectCanonicalOrderWebhookEventType(payload, externalOrderId);

  if (!deliveryKey || !eventType) {
    return null;
  }

  return {
    deliveryKey,
    eventType,
    externalOrderId,
  };
}

function readFirstOptionalString(
  payload: Record<string, unknown>,
  paths: readonly (readonly string[])[],
) {
  for (const path of paths) {
    const value = readNestedOptionalString(payload, path);

    if (value) {
      return value;
    }
  }

  return undefined;
}

function detectCanonicalOrderWebhookEventType(
  payload: Record<string, unknown>,
  externalOrderId: string | undefined,
) {
  if (!externalOrderId) {
    return undefined;
  }

  if (payload.canceled === true || payload.cancelled === true) {
    return "order.canceled";
  }

  if (Array.isArray(payload.items) || "check" in payload || "salesChannel" in payload) {
    return "order.updated";
  }

  return undefined;
}

function buildSyntheticDeliveryKey(
  payload: Record<string, unknown>,
  externalOrderId: string | undefined,
) {
  if (!externalOrderId) {
    return undefined;
  }

  const versionToken =
    normalizeOptionalString(payload.updatedAt) ??
    normalizeOptionalString(payload.createdAt) ??
    (payload.canceled === true || payload.cancelled === true
      ? "canceled"
      : undefined) ??
    normalizeOptionalString(payload.menu_version) ??
    normalizeOptionalString(payload.check) ??
    "snapshot";

  return `manual:${externalOrderId}:${versionToken}`;
}

export {
  providerSyncSecretEnv,
  providerSyncSecretHeaders,
  type ProviderSyncService,
};
