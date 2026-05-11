import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  providerSyncSecretEnv,
  providerSyncSecretHeaders,
} from "@/app/api/_lib/provider-sync-route";
import { orderSyncProviderEnv } from "@/src/infrastructure/order-provider-factory";

function readRepositoryFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function normalizeText(value: string) {
  return value.replace(/\r\n/g, "\n");
}

function readDocSet() {
  return {
    readme: normalizeText(readRepositoryFile("README.md")),
    livePlaybook: normalizeText(
      readRepositoryFile("docs/live-integration-phase-1.md"),
    ),
    roadmap: normalizeText(readRepositoryFile("docs/roadmap.md")),
    checklist: normalizeText(
      readRepositoryFile("qa/live-integration-post-qa-checklist.md"),
    ),
    verificationReport: normalizeText(
      readRepositoryFile("qa/verification-report.md"),
    ),
    prd: normalizeText(
      readRepositoryFile(".compozy/tasks/real-external-integration/_prd.md"),
    ),
    techspec: normalizeText(
      readRepositoryFile(".compozy/tasks/real-external-integration/_techspec.md"),
    ),
  };
}

describe("live integration documentation", () => {
  it("lists the required Phase 1 env vars, secret surfaces, and scheduler expectations", () => {
    const docs = readDocSet();
    const combinedDocs = [
      docs.readme,
      docs.livePlaybook,
      docs.checklist,
    ].join("\n");

    for (const envVar of [
      orderSyncProviderEnv.mode,
      orderSyncProviderEnv.anotaAiToken,
      orderSyncProviderEnv.anotaAiBaseUrl,
      providerSyncSecretEnv.webhook,
      providerSyncSecretEnv.reconcile,
      "BISTRO_DATABASE_PATH",
    ]) {
      expect(combinedDocs).toContain(envVar);
    }

    expect(docs.livePlaybook).toContain(providerSyncSecretHeaders.webhook);
    expect(docs.livePlaybook).toContain(providerSyncSecretHeaders.reconcile);
    expect(docs.livePlaybook.toLowerCase()).toContain("scheduler");
    expect(docs.livePlaybook.toLowerCase()).toContain("reconciliation");
  });

  it("states the phase 1 boundaries and fail-closed externalID behavior explicitly", () => {
    const docs = readDocSet();
    const combinedDocs = [docs.readme, docs.livePlaybook].join("\n");

    expect(combinedDocs).toContain("confirmed");
    expect(combinedDocs.toLowerCase()).toContain("not rewritten automatically");
    expect(combinedDocs).toContain("externalID");
    expect(combinedDocs.toLowerCase()).toContain("fail-closed");
    expect(combinedDocs.toLowerCase()).toContain("missing_mapping");
    expect(combinedDocs.toLowerCase()).toContain("there is no phase 1 fallback to item names");
    expect(combinedDocs.toLowerCase()).toContain("keep `bistro_order_sync_provider_mode=mock`".toLowerCase());
  });

  it("creates a concrete post-QA checklist for provisional commands, values, and doc reconciliation", () => {
    const docs = readDocSet();
    const checklist = docs.checklist.toLowerCase();

    for (const command of [
      "npm run lint",
      "npm run test:run -- --coverage",
      "npm run build",
      "npm run test:e2e",
    ]) {
      expect(docs.checklist).toContain(command);
    }

    for (const provisionalItem of [
      "BISTRO_ORDER_SYNC_PROVIDER_MODE",
      "BISTRO_ANOTA_AI_BASE_URL",
      "scheduler cadence",
      "README.md",
      "docs/live-integration-phase-1.md",
      "qa/verification-report.md",
      "screenshot",
    ]) {
      expect(checklist).toContain(provisionalItem.toLowerCase());
    }

    expect(docs.verificationReport).toContain(
      "qa/live-integration-post-qa-checklist.md",
    );
  });

  it("keeps the docs aligned with the PRD and TechSpec flow descriptions", () => {
    const docs = readDocSet();
    const combinedDocs = [docs.readme, docs.livePlaybook, docs.roadmap].join(
      "\n",
    );

    expect(docs.prd).toContain("Phase 1 imports only confirmed orders");
    expect(docs.techspec).toContain("webhook-first + scheduled reconciliation");
    expect(docs.techspec).toContain(
      "The adapter must derive internal `menuItemId` from Anota catalog `externalID`.",
    );

    for (const requiredPhrase of [
      "webhook-first plus scheduled reconciliation",
      "atendimento or salão",
      "keep the kitchen board stable",
      "catalog `externalID`",
      "duplicate",
    ]) {
      expect(combinedDocs.toLowerCase()).toContain(requiredPhrase.toLowerCase());
    }
  });

  it("references only routes and ownership surfaces that exist in the current implementation", () => {
    const docs = readDocSet();
    const combinedDocs = [docs.readme, docs.livePlaybook, docs.checklist].join(
      "\n",
    );
    const implementedSurfaces = [
      {
        relativePath: "app/api/integrations/anota-ai/webhook/route.ts",
        route: "/api/integrations/anota-ai/webhook",
      },
      {
        relativePath: "app/api/internal/sync/anota-ai/route.ts",
        route: "/api/internal/sync/anota-ai",
      },
      {
        relativePath:
          "app/api/orders/[orderId]/sync-exceptions/[exceptionId]/acknowledge/route.ts",
        route: "/api/orders/[orderId]/sync-exceptions/[exceptionId]/acknowledge",
      },
      {
        relativePath: "app/page.tsx",
        route: "/",
      },
      {
        relativePath: "app/orders/[orderId]/page.tsx",
        route: "/orders/[orderId]",
      },
      {
        relativePath: "app/salon/page.tsx",
        route: "/salon",
      },
    ];

    for (const surface of implementedSurfaces) {
      expect(
        fs.existsSync(path.join(process.cwd(), surface.relativePath)),
      ).toBe(true);
      expect(combinedDocs).toContain(surface.route);
    }

    expect(combinedDocs.toLowerCase()).toContain("salão");
    expect(combinedDocs.toLowerCase()).toContain("kitchen");
  });
});
