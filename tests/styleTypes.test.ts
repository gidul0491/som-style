import { describe, it, expectTypeOf, assertType } from "vitest";
import type { StyleObject } from "../src/types.js";
import { style } from "../src/createResponsiveStyle.js";

describe("StyleObject typings", () => {
  it("accepts camelCase (preferred) and kebab-case, plus nested & selectors", () => {
    const camel = {
      display: "flex",
      flexDirection: "column",
      minWidth: 0,
      "&:hover": { color: "red" },
    } satisfies StyleObject;

    const kebab = {
      display: "flex",
      "flex-direction": "column",
      "min-width": 0,
    } satisfies StyleObject;

    expectTypeOf(camel.display).toEqualTypeOf<"flex">();
    expectTypeOf(camel.flexDirection).toEqualTypeOf<"column">();
    assertType<StyleObject>(camel);
    assertType<StyleObject>(kebab);
  });

  it("rejects unknown property names (typos)", () => {
    // @ts-expect-error — flex-direcion is not a CSS property
    const badKebab: StyleObject = { "flex-direcion": "row" };
    // @ts-expect-error — alignItemss is not a CSS property
    const badCamel: StyleObject = { alignItemss: "center" };
    void badKebab;
    void badCamel;
  });

  it("rejects invalid enum values for known properties", () => {
    // @ts-expect-error — "flx" is not a valid display value
    const bad: StyleObject = { display: "flx" };
    void bad;
  });

  it("style() argument is checked at the call site", () => {
    const handle = style({
      base: {
        display: "grid",
        gap: "1rem",
        alignItems: "center",
      },
    });
    expectTypeOf(handle.className).toBeString();

    style({
      base: {
        // @ts-expect-error — typo should fail
        "align-item": "center",
      },
    });
  });
});
