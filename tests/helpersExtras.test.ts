import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { recipe, cx } from "../src/variants.js";
import {
  style,
  __resetStyleWarningsForTests,
} from "../src/createResponsiveStyle.js";

describe("recipe", () => {
  it("merges base, variants, and compoundVariants into a lookup", () => {
    const btn = recipe({
      base: { base: { display: "inline-flex", padding: "0.5rem" } },
      variants: {
        size: {
          sm: { base: { padding: "0.25rem" } },
          md: { base: { padding: "0.75rem" } },
        },
        tone: {
          primary: { base: { color: "blue" } },
          danger: { base: { color: "red" } },
        },
      },
      compoundVariants: [
        {
          size: "sm",
          tone: "danger",
          css: { base: { "font-weight": "700" } },
        },
      ],
      defaultVariants: { size: "md", tone: "primary" },
    });

    const def = btn();
    expect(def).toContain("som-");

    const dangerSm = btn({ size: "sm", tone: "danger" });
    expect(dangerSm).not.toBe(def);
  });
});

describe("cx", () => {
  it("joins handles and skips falsy", () => {
    const a = style({ base: { color: "red" } });
    const b = style({ base: { display: "flex" } });
    expect(cx(a, false, null, b, undefined)).toBe(`${a} ${b}`);
  });
});

describe("render warning", () => {
  beforeEach(() => {
    __resetStyleWarningsForTests();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetStyleWarningsForTests();
  });

  it("warns when stack looks like React render", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const RealError = globalThis.Error;
    vi.spyOn(globalThis, "Error").mockImplementation(function (
      this: Error,
      message?: string
    ) {
      const err = new RealError(message);
      err.stack =
        "Error\n    at warnIfLikelyInRender\n    at renderWithHooks (react-dom.js:1:1)";
      return err;
    } as unknown as ErrorConstructor);

    style({ base: { color: "navy" } });
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("during React render")
    );
  });
});
