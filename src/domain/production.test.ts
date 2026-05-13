import { describe, expect, it } from "vitest";

import { deriveOrderStatus, deriveTicketStatus } from "@/src/domain/production";

describe("deriveTicketStatus", () => {
  it("returns new when all items are new", () => {
    expect(
      deriveTicketStatus([{ status: "new" }, { status: "new" }]),
    ).toBe("new");
  });

  it("returns in_preparation when the kitchen ticket was started even if all items are still new", () => {
    expect(
      deriveTicketStatus([{ status: "new" }, { status: "new" }], {
        hasStarted: true,
      }),
    ).toBe("in_preparation");
  });

  it("returns in_preparation when work started and not all items are ready", () => {
    expect(
      deriveTicketStatus([{ status: "new" }, { status: "in_preparation" }]),
    ).toBe("in_preparation");
  });

  it("returns ready when all items are ready", () => {
    expect(
      deriveTicketStatus([{ status: "ready" }, { status: "ready" }]),
    ).toBe("ready");
  });
});

describe("deriveOrderStatus", () => {
  it("returns new when all tickets are new", () => {
    expect(
      deriveOrderStatus([
        { id: "a", status: "new" },
        { id: "b", status: "new" },
      ]),
    ).toBe("new");
  });

  it("returns in_progress when work started but no ticket is ready", () => {
    expect(
      deriveOrderStatus([
        { id: "a", status: "in_preparation" },
        { id: "b", status: "new" },
      ]),
    ).toBe("in_progress");
  });

  it("returns partially_ready when one ticket is ready and another is not", () => {
    expect(
      deriveOrderStatus([
        { id: "a", status: "ready" },
        { id: "b", status: "in_preparation" },
      ]),
    ).toBe("partially_ready");
  });

  it("returns ready_to_serve when all tickets are ready", () => {
    expect(
      deriveOrderStatus([
        { id: "a", status: "ready" },
        { id: "b", status: "ready" },
      ]),
    ).toBe("ready_to_serve");
  });

  it("returns canceled when all tickets are canceled", () => {
    expect(
      deriveOrderStatus([
        { id: "a", status: "canceled" },
        { id: "b", status: "canceled" },
      ]),
    ).toBe("canceled");
  });
});
