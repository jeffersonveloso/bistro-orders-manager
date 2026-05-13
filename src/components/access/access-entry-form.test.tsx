import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { AccessEntryForm } from "@/src/components/access/access-entry-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("AccessEntryForm", () => {
  it("renders visible hero shortcuts and the primary access controls", () => {
    const markup = renderToStaticMarkup(
      createElement(AccessEntryForm, {
        initialNext: "/salon",
      }),
    );

    expect(markup).toContain('data-testid="access-hero-area-kitchen-1"');
    expect(markup).toContain('data-testid="access-hero-area-kitchen-2"');
    expect(markup).toContain('data-testid="access-hero-area-salon"');
    expect(markup).toContain('data-testid="access-area-salon"');
    expect(markup).toContain('data-testid="access-pin-input"');
    expect(markup).toContain('data-testid="access-submit"');
  });
});
