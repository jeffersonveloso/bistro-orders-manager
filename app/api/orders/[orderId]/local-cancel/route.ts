import {
  forbiddenAreaResponse,
  type AreaAccessRouteDependencies,
  withAreaSession,
} from "@/app/api/_lib/area-access-route";
import {
  jsonNoStore,
  readJsonObject,
} from "@/app/api/_lib/provider-sync-route";
import { AreaAuthorizationError } from "@/src/application/area-access-service";
import type { ProductionRepository } from "@/src/application/ports";
import { cancelOrderLocally } from "@/src/application/production-service";
import { getProductionRepository } from "@/src/infrastructure/sqlite";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LocalCancelOrderRouteDependencies extends AreaAccessRouteDependencies {
  repository?: ProductionRepository;
}

function parseReason(body: Record<string, unknown>) {
  const value = body.reason;

  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

export async function handlePostLocalCancelOrderRoute(
  request: Request,
  {
    orderId,
  }: {
    orderId: string;
  },
  dependencies: LocalCancelOrderRouteDependencies = {},
) {
  return withAreaSession(
    request,
    async ({ areaAccessService, session }) => {
      let elevatedRole: "manager" | "admin";

      try {
        elevatedRole = areaAccessService.requireElevatedAccess(session);
      } catch (error) {
        if (error instanceof AreaAuthorizationError) {
          return forbiddenAreaResponse();
        }

        throw error;
      }

      const bodyResult = await readJsonObject(request);

      if (!bodyResult.ok) {
        return bodyResult.response;
      }

      const reason = parseReason(bodyResult.value);

      if (!reason) {
        return jsonNoStore("Invalid reason", { status: 400 });
      }

      const repository = dependencies.repository ?? getProductionRepository();
      const aggregate = repository.getOrderAggregate(orderId);

      if (!aggregate) {
        return jsonNoStore("Order not found", { status: 404 });
      }

      cancelOrderLocally(repository, orderId, {
        canceledByAreaId: session.areaId,
        canceledByRole: elevatedRole,
        reason,
      });

      return jsonNoStore({ ok: true });
    },
    dependencies,
  );
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ orderId: string }>;
  },
) {
  const { orderId } = await params;

  return handlePostLocalCancelOrderRoute(request, { orderId });
}
