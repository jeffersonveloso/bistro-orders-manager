import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ReadyStatusRevertDialog,
  shouldConfirmReadyStatusRevert,
} from "@/src/components/kds/ready-status-revert-dialog";

describe("ReadyStatusRevertDialog", () => {
  it("requires confirmation only when leaving ready", () => {
    expect(shouldConfirmReadyStatusRevert("ready", "in_preparation")).toBe(true);
    expect(shouldConfirmReadyStatusRevert("ready", "new")).toBe(true);
    expect(shouldConfirmReadyStatusRevert("ready", "ready")).toBe(false);
    expect(shouldConfirmReadyStatusRevert("in_preparation", "new")).toBe(false);
  });

  it("renders operational confirmation details", () => {
    const markup = renderToStaticMarkup(
      createElement(ReadyStatusRevertDialog, {
        isOpen: true,
        itemName: "Croissant",
        nextStatus: "in_preparation",
        onCancel: () => undefined,
        onConfirm: () => undefined,
      }),
    );

    expect(markup).toContain('data-testid="ready-status-revert-dialog"');
    expect(markup).toContain("Reverter item pronto");
    expect(markup).toContain("Croissant");
    expect(markup).toContain("Pronto");
    expect(markup).toContain("Em preparo");
    expect(markup).toContain('data-testid="ready-status-revert-confirm"');
    expect(markup).toContain('data-testid="ready-status-revert-cancel"');
  });
});
