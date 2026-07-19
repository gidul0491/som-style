import { describe, it, expect } from "vitest";
import { style, extend, makeStyleHandle } from "../src/createResponsiveStyle.js";
import { mergeResponsiveOptions } from "../src/extendStyle.js";

describe("extend / StyleHandle", () => {
  it("merges base properties with patch winning", () => {
    const merged = mergeResponsiveOptions(
      { base: { color: "red", padding: "1rem" } },
      { base: { color: "blue" } }
    );
    expect(merged.base).toEqual({ color: "blue", padding: "1rem" });
  });

  it("style() returns a handle that stringifies to className", () => {
    const box = style({ base: { display: "flex" } });
    expect(box.className.length).toBeGreaterThan(0);
    expect(String(box)).toBe(box.className);
    expect(`${box}`).toBe(box.className);
    expect("" + box).toBe(box.className);
    expect(box == box.className).toBe(true);
  });

  it("handle works as a React-style className value (String object)", () => {
    const box = style({ base: { color: "red" } });
    expect(typeof box).toBe("object");
    expect(box instanceof String).toBe(true);
    expect(Object.prototype.toString.call(box)).toBe("[object String]");
  });

  it("handle.extend overrides without keeping conflicting atoms from a stacked string", () => {
    const base = style({
      base: { background: "white", padding: "1rem" },
    });
    const tinted = base.extend({
      base: { background: "oklch(0.7 0.16 44)" },
    });
    expect(tinted.className).not.toBe(base.className);
    expect(tinted.options.base?.background).toBe("oklch(0.7 0.16 44)");
    expect(tinted.options.base?.padding).toBe("1rem");
  });

  it("extend(handle, patch) matches handle.extend", () => {
    const base = style({ base: { gap: "1rem" } });
    const a = base.extend({ base: { gap: "2rem" } });
    const b = style(extend(base, { base: { gap: "2rem" } }));
    expect(a.className).toBe(b.className);
  });

  it("makeStyleHandle preserves extend", () => {
    const h = makeStyleHandle("rx-demo", {
      base: { color: "red" },
    });
    expect(String(h)).toBe("rx-demo");
    const next = h.extend({ base: { color: "blue" } });
    expect(next.options.base?.color).toBe("blue");
    expect(next.className).not.toBe("rx-demo");
  });
});
