import {
  type AreaAccessRouteDependencies,
  withSalonArea,
} from "@/app/api/_lib/area-access-route";
import {
  createRuntimeAcknowledgeSyncService,
  jsonNoStore,
  normalizeOptionalString,
  readJsonObject,
  type ProviderSyncRouteDependencies,
} from "@/app/api/_lib/provider-sync-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AcknowledgeSyncExceptionRouteDependencies
  extends ProviderSyncRouteDependencies,
    AreaAccessRouteDependencies {}

export async function handlePostAcknowledgeSyncException(
  request: Request,
  {
    exceptionId,
    orderId,
  }: {
    exceptionId: string;
    orderId: string;
  },
  dependencies: AcknowledgeSyncExceptionRouteDependencies = {},
) {
  return withSalonArea(
    request,
    async () => {
      const body = await readJsonObject(request, { allowEmpty: true });

      if (!body.ok) {
        return body.response;
      }

      const resolutionNote = normalizeOptionalString(body.value.resolutionNote);

      if ("resolutionNote" in body.value && typeof resolutionNote === "undefined") {
        return jsonNoStore("Invalid resolutionNote", { status: 400 });
      }

      const service = dependencies.service ?? createRuntimeAcknowledgeSyncService();

      try {
        await service.acknowledgeException({
          acknowledgedVia: "salon_ui",
          exceptionId,
          orderId,
          resolutionNote,
        });
      } catch (error) {
        if (isMissingExceptionError(error)) {
          return jsonNoStore("Sync exception not found", { status: 404 });
        }

        throw error;
      }

      return jsonNoStore({
        exceptionId,
        orderId,
        status: "acknowledged",
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

  return handlePostAcknowledgeSyncException(request, {
    exceptionId,
    orderId,
  });
}

function isMissingExceptionError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.startsWith("Sync exception")
  );
}
