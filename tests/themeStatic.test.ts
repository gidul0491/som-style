import { describe, it, expect } from "vitest";
import { emitThemeCss, themeHandles } from "../src/theme.js";
import {
  analyzeDefineThemeCalls,
  evalExportedThemeHandles,
  transformThemeForBuild,
} from "../src/themeStatic.js";

describe("emitThemeCss", () => {
  it("emits light and dark --som-theme-* variables", () => {
    const css = emitThemeCss({
      light: { primary: "oklch(0.7 0.18 40)", text: "oklch(0.2 0 0)" },
      dark: { primary: "oklch(0.8 0.16 40)" },
    });
    expect(css).toContain(":root{");
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain("--som-theme-primary:oklch(0.7 0.18 40)");
    expect(css).toContain("--som-theme-text:oklch(0.2 0 0)");
    expect(css).toContain("--som-theme-primary:oklch(0.8 0.16 40)");
    expect(css).not.toContain("--som-color-");
  });

  it("emits hue and softBorder in the same light map", () => {
    const css = emitThemeCss({
      light: {
        primary: "oklch(0.7 0.18 40)",
        hue: "40",
        softBorder: "oklch(0 0 0 / 0.1)",
      },
    });
    expect(css).toContain("--som-theme-hue:40");
    expect(css).toContain("--som-theme-soft-border:oklch(0 0 0 / 0.1)");
  });
});

describe("analyzeDefineThemeCalls", () => {
  it("extracts a static inline theme", () => {
    const hits = analyzeDefineThemeCalls(`
      import { defineTheme } from "som-style";
      export const theme = defineTheme({
        light: { primary: "oklch(0.7 0.18 40)" },
        dark: { primary: "oklch(0.8 0.16 40)" },
      });
    `);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.kind).toBe("static");
    expect(hits[0]?.theme?.light.primary).toBe("oklch(0.7 0.18 40)");
  });

  it("marks non-literal colors as dynamic", () => {
    const hits = analyzeDefineThemeCalls(`
      defineTheme({ light: { primary: oklch(0.7, 0.18, 40) } });
    `);
    expect(hits[0]?.kind).toBe("dynamic");
  });

  it("rejects chrome key", () => {
    const hits = analyzeDefineThemeCalls(`
      defineTheme({
        light: { primary: "oklch(0.7 0.18 40)" },
        chrome: { light: { hue: "40" } },
      });
    `);
    expect(hits[0]?.kind).toBe("dynamic");
    expect(hits[0]?.error).toMatch(/Unknown defineTheme key "chrome"/);
  });
});

describe("transformThemeForBuild", () => {
  it("rewrites import and emits theme CSS", () => {
    const input = `import { defineTheme, configure } from "som-style";
export const theme = defineTheme({
  light: { primary: "oklch(0.7 0.18 40)", accent: "oklch(0.6 0.1 200)" },
  dark: { primary: "oklch(0.85 0.14 40)" },
});`;
    const out = transformThemeForBuild(input, "src/theme.js");
    expect(out.code).toContain("defineThemeColors as defineTheme");
    expect(out.code).toMatch(/defineTheme\s*\(/);
    expect(out.css).toContain("--som-theme-primary:");
    expect(out.css).toContain("--som-theme-accent:");
    expect(out.css).toContain(':root[data-theme="dark"]');
  });

  it("throws on dynamic defineTheme", () => {
    expect(() =>
      transformThemeForBuild(`defineTheme(x);`, "src/theme.js")
    ).toThrow(/static theme extraction/i);
  });
});

describe("themeHandles", () => {
  it("maps every light/dark key to --som-theme-*", () => {
    const handles = themeHandles({
      light: {
        primary: "oklch(0.7 0.18 40)",
        softBorder: "oklch(0 0 0 / 0.1)",
        hue: "40",
      },
    });
    expect(handles.primary).toBe("var(--som-theme-primary)");
    expect(handles.softBorder).toBe("var(--som-theme-soft-border)");
    expect(handles.hue).toBe("var(--som-theme-hue)");
  });
});

describe("evalExportedThemeHandles", () => {
  it("builds handle map from export const theme = defineTheme", () => {
    const code = `
      import { defineTheme } from "som-style";
      export const theme = defineTheme({
        light: { primary: "oklch(0.7 0.18 40)", softBorder: "red" },
      });
    `;
    const map = evalExportedThemeHandles(code, "theme");
    expect(map?.primary).toBe("var(--som-theme-primary)");
    expect(map?.softBorder).toBe("var(--som-theme-soft-border)");
  });
});
