import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const qaArtifacts = {
  plan: "qa/test-plans/operational-hardening-test-plan.md",
  regression: "qa/test-plans/operational-hardening-regression.md",
  fallback: "qa/test-plans/operational-hardening-qa-report-fallback.md",
  cases: [
    "qa/test-cases/SMOKE-003.md",
    "qa/test-cases/TC-INT-007.md",
    "qa/test-cases/TC-FUNC-004.md",
    "qa/test-cases/TC-INT-008.md",
    "qa/test-cases/TC-INT-009.md",
    "qa/test-cases/TC-INT-010.md",
    "qa/test-cases/TC-INT-011.md",
    "qa/test-cases/TC-INT-012.md",
  ],
} as const;

function readRepositoryFile(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function normalizeText(value: string) {
  return value.replace(/\r\n/g, "\n");
}

function readQaArtifactSet() {
  return {
    plan: normalizeText(readRepositoryFile(qaArtifacts.plan)),
    regression: normalizeText(readRepositoryFile(qaArtifacts.regression)),
    fallback: normalizeText(readRepositoryFile(qaArtifacts.fallback)),
    cases: qaArtifacts.cases.map((relativePath) => ({
      relativePath,
      content: normalizeText(readRepositoryFile(relativePath)),
    })),
  };
}

function extractAutomationLines(content: string) {
  return content
    .split("\n")
    .filter((line) => line.startsWith("**Automation Command/Spec:**"));
}

function extractReferencedSpecs(content: string) {
  return (
    content.match(
      /\b(?:e2e\/[A-Za-z0-9._/-]+\.spec\.ts|app\/[A-Za-z0-9._/\-[\]]+\.test\.ts|src\/[A-Za-z0-9._/\-[\]]+\.test\.ts)\b/g,
    ) ?? []
  );
}

describe("operational hardening QA artifacts - unit coverage", () => {
  it("includes the mandatory QA plan sections for task 08", () => {
    const { plan } = readQaArtifactSet();

    for (const requiredSection of [
      "## Executive Summary",
      "## Scope",
      "## Operational Hardening Requirement Map",
      "## Test Strategy And Approach",
      "## Automation Strategy",
      "## Environment Requirements",
      "## Entry Criteria",
      "## Exit Criteria",
      "## Risk Assessment",
    ]) {
      expect(plan).toContain(requiredSection);
    }

    for (const requirementId of [
      "OH-P0-01",
      "OH-P0-02",
      "OH-P0-03",
      "OH-P0-04",
      "OH-P0-05",
      "OH-P1-01",
      "OH-P1-02",
      "OH-P1-03",
    ]) {
      expect(plan).toContain(requirementId);
    }
  });

  it("gives every generated test case expected results, automation metadata, and operational hardening traceability", () => {
    const { cases } = readQaArtifactSet();

    for (const artifact of cases) {
      expect(artifact.content).toContain("**Automation Target:**");
      expect(artifact.content).toContain("**Automation Status:**");
      expect(artifact.content).toContain("**Automation Command/Spec:**");
      expect(artifact.content).toContain("### Test Steps");
      expect(artifact.content).toContain("**Expected:**");
      expect(artifact.content).toContain("### Traceability");
      expect(artifact.content).toMatch(/OH-P[01]-0[1-9]/);
    }
  });

  it("classifies smoke, targeted, and full-run coverage for access control, protected reads or writes, and catalog deferral", () => {
    const { regression } = readQaArtifactSet();

    for (const section of [
      "## Smoke Coverage",
      "## Targeted Coverage",
      "## Full-Run Coverage",
      "## Automation Classification",
      "## Pass / Fail Rules",
    ]) {
      expect(regression).toContain(section);
    }

    for (const caseId of [
      "SMOKE-003",
      "TC-INT-007",
      "TC-FUNC-004",
      "TC-INT-008",
      "TC-INT-009",
      "TC-INT-010",
      "TC-INT-011",
      "TC-INT-012",
    ]) {
      expect(regression).toContain(caseId);
    }

    expect(regression.toLowerCase()).toContain("access-control");
    expect(regression.toLowerCase()).toContain("protected reads");
    expect(regression.toLowerCase()).toContain("protected writes");
    expect(regression.toLowerCase()).toContain("catalog");
  });
});

describe("operational hardening QA artifacts - integration coverage", () => {
  it("references only the repository's existing Playwright and Vitest harnesses", () => {
    const artifacts = readQaArtifactSet();
    const combinedArtifacts = [
      artifacts.plan,
      artifacts.regression,
      artifacts.fallback,
      ...artifacts.cases.map((artifact) => artifact.content),
    ].join("\n");
    const referencedSpecs = extractReferencedSpecs(combinedArtifacts);
    const commandLikeLines = combinedArtifacts
      .split("\n")
      .filter(
        (line) =>
          line.includes("`npm run") ||
          line.includes("`npx") ||
          line.startsWith("**Automation Command/Spec:**"),
      );

    expect(referencedSpecs.length).toBeGreaterThan(0);

    for (const line of commandLikeLines) {
      expect(line.toLowerCase()).not.toContain("cypress");
      expect(line.toLowerCase()).not.toContain("postman");
      expect(line.toLowerCase()).not.toContain("selenium");
    }

    for (const automationLine of [
      ...extractAutomationLines(artifacts.regression),
      ...artifacts.cases.flatMap((artifact) =>
        extractAutomationLines(artifact.content),
      ),
    ]) {
      expect(
        automationLine.includes("npm run test:e2e") ||
          automationLine.includes("npm run test:run --"),
      ).toBe(true);
    }

    for (const relativePath of referencedSpecs) {
      expect(fs.existsSync(path.join(process.cwd(), relativePath))).toBe(true);
    }
  });

  it("records the qa-report manual path and the canonical execution handoff for task 09", () => {
    const { plan, regression, fallback } = readQaArtifactSet();
    const combinedArtifacts = [plan, regression, fallback].join("\n").toLowerCase();

    expect(combinedArtifacts).toContain("manual");
    expect(combinedArtifacts).toContain("qa-report");
    expect(combinedArtifacts).toContain("non-interactive generator");
    expect(combinedArtifacts).toContain("qa/verification-report.md");
    expect(combinedArtifacts).toContain("task 09");
  });
});
