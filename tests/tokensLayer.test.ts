import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { emitThemeCss } from "../src/theme.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("no package CSS token black box", () => {
  it("does not ship src/base.css", () => {
    expect(existsSync(join(root, "src", "base.css"))).toBe(false);
  });

  it("scaffold theme.js puts all tokens in light/dark", () => {
    const src = readFileSync(join(root, "scaffold", "theme.js"), "utf8");
    expect(src).not.toContain("chrome:");
    expect(src).toContain("softBorderOnFill");
    expect(src).toContain("hue:");
    expect(src).toContain("--som-theme-hue");
  });

  it("emitThemeCss writes --som-theme-* for every token", () => {
    const css = emitThemeCss({
      light: {
        primary: "oklch(0.7 0.18 40)",
        hue: "44",
        softBorderOnFill: "oklch(1 0 0 / 0.3)",
      },
      dark: { softBorderOnFill: "oklch(1 0 0 / 0.06)" },
    });
    expect(css).toContain("--som-theme-primary:");
    expect(css).toContain("--som-theme-hue:44");
    expect(css).toContain("--som-theme-soft-border-on-fill:oklch(1 0 0 / 0.3)");
    expect(css).toMatch(
      /data-theme="dark"[^}]*--som-theme-soft-border-on-fill:oklch\(1 0 0 \/ 0\.06\)/
    );
    expect(css).not.toContain("--som-color-");
  });
});
