import {
  forbiddenAreaResponse,
  type AreaAccessRouteDependencies,
  withAreaSession,
} from "@/app/api/_lib/area-access-route";
import {
  createRuntimeProviderSyncService,
  jsonNoStore,
  normalizeOptionalString,
  readJsonObject,
  type ProviderSyncRouteDependencies,
} from "@/app/api/_lib/provider-sync-route";
import { AreaAuthorizationError } from "@/src/application/area-access-service";
import { ApplyChangedExceptionError } from "@/src/application/provider-sync-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ApplyChangedSyncExceptionRouteDependencies
  extends ProviderSyncRouteDependencies,
    AreaAccessRouteDependencies {}

export async function handlePostApplyChangedSyncException(
  request: Request,
  {
    exceptionId,
    orderId,
  }: {
    exceptionId: string;
    orderId: string;
  },
  dependencies: ApplyChangedSyncExceptionRouteDependencies = {},
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

      const body = await readJsonObject(request, { allowEmpty: true });

      if (!body.ok) {
        return body.response;
      }

      const resolutionNote = normalizeOptionalString(body.value.resolutionNote);

      if ("resolutionNote" in body.value && typeof resolutionNote === "undefined") {
        return jsonNoStore("Invalid resolutionNote", { status: 400 });
      }

      const service = dependencies.service ?? createRuntimeProviderSyncService();

      try {
        await service.applyChangedException({
          appliedVia: elevatedRole === "admin" ? "admin_apply" : "manager_apply",
          exceptionId,
          orderId,
          resolutionNote,
        });
      } catch (error) {
        if (!(error instanceof ApplyChangedExceptionError)) {
          throw error;
        }

        if (error.code === "invalid_exception") {
          return jsonNoStore("Sync exception not found", { status: 404 });
        }

        return jsonNoStore(error.message, { status: 409 });
      }

      return jsonNoStore({
        exceptionId,
        orderId,
        status: "applied",
      });
    },
    dependencies,
  );
}

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ orderId: string; exceptionId: string }>;
  },
) {
  const { exceptionId, orderId } = await params;

  return handlePostApplyChangedSyncException(request, {
    exceptionId,
    orderId,
  });
}
