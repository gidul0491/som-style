import { describe, it, expect } from "vitest";
import { variants } from "../src/variants.js";

describe("variants", () => {
  it("builds a map of style handles", () => {
    const tone = variants({
      ok: { base: { color: "green" } },
      bad: { base: { color: "red" } },
    });
    expect(tone.ok.className.length).toBeGreaterThan(0);
    expect(tone.bad.className.length).toBeGreaterThan(0);
    expect(tone.ok.className).not.toBe(tone.bad.className);
  });
});
