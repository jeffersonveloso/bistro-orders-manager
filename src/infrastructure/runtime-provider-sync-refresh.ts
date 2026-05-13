import { createRuntimeProviderSyncService } from "@/app/api/_lib/provider-sync-route";
import {
  orderSyncProviderEnv,
  parseOrderSyncProviderMode,
} from "@/src/infrastructure/order-provider-factory";

const DEFAULT_REFRESH_INTERVAL_MS = 30_000;
const DEFAULT_REFRESH_OVERLAP_MS = 120_000;

interface RuntimeProviderSyncRefreshState {
  inFlight: Promise<void> | null;
  lastCompletedAt: string | null;
  lastStartedAtMs: number;
}

export async function maybeRefreshRuntimeProviderSync(
  env: NodeJS.ProcessEnv = process.env,
) {
  if (parseOrderSyncProviderMode(env[orderSyncProviderEnv.mode]) !== "anota_ai") {
    return;
  }

  const state = getRuntimeRefreshState();
  const refreshIntervalMs =
    readPositiveInteger(env.BISTRO_PROVIDER_SYNC_READ_REFRESH_INTERVAL_MS) ??
    DEFAULT_REFRESH_INTERVAL_MS;
  const refreshOverlapMs =
    readPositiveInteger(env.BISTRO_PROVIDER_SYNC_READ_REFRESH_OVERLAP_MS) ??
    DEFAULT_REFRESH_OVERLAP_MS;
  const nowMs = Date.now();

  if (state.inFlight) {
    await state.inFlight;
    return;
  }

  if (
    state.lastStartedAtMs > 0 &&
    nowMs - state.lastStartedAtMs < refreshIntervalMs
  ) {
    return;
  }

  const updatedSince = buildUpdatedSinceCursor(
    state.lastCompletedAt,
    refreshOverlapMs,
  );

  state.lastStartedAtMs = nowMs;
  state.inFlight = (async () => {
    try {
      await createRuntimeProviderSyncService(env).reconcileConfirmedOrders({
        provider: "anota_ai",
        updatedSince,
      });
      state.lastCompletedAt = new Date().toISOString();
    } catch (error) {
      console.error(
        "[provider-sync-refresh] failed to reconcile provider orders before read",
        error,
      );
    } finally {
      state.inFlight = null;
    }
  })();

  await state.inFlight;
}

function buildUpdatedSinceCursor(
  lastCompletedAt: string | null,
  refreshOverlapMs: number,
) {
  if (!lastCompletedAt) {
    return undefined;
  }

  const parsedCompletedAtMs = Date.parse(lastCompletedAt);

  if (Number.isNaN(parsedCompletedAtMs)) {
    return undefined;
  }

  return new Date(
    Math.max(parsedCompletedAtMs - refreshOverlapMs, 0),
  ).toISOString();
}

function getRuntimeRefreshState() {
  const globalState = globalThis as typeof globalThis & {
    __bistroRuntimeProviderSyncRefreshState?: RuntimeProviderSyncRefreshState;
  };

  if (!globalState.__bistroRuntimeProviderSyncRefreshState) {
    globalState.__bistroRuntimeProviderSyncRefreshState = {
      inFlight: null,
      lastCompletedAt: null,
      lastStartedAtMs: 0,
    };
  }

  return globalState.__bistroRuntimeProviderSyncRefreshState;
}

function readPositiveInteger(value: string | undefined) {
  if (typeof value !== "string") {
    return undefined;
  }

  const parsedValue = Number.parseInt(value.trim(), 10);

  return Number.isInteger(parsedValue) && parsedValue > 0
    ? parsedValue
    : undefined;
}
