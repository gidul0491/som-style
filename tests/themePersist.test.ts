/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, beforeEach } from "vitest";
import { defineThemeColors, getTheme, setTheme } from "../src/theme.js";

describe("defineThemeColors theme persistence", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    sessionStorage.clear();
  });

  it("applies defaultTheme when nothing is set", () => {
    defineThemeColors({
      defaultTheme: "light",
      light: { primary: "oklch(0.7 0.1 40)" },
    });
    expect(getTheme()).toBe("light");
  });

  it("does not reset an existing data-theme on re-define (HMR)", () => {
    setTheme("dark");
    defineThemeColors({
      defaultTheme: "light",
      light: { primary: "oklch(0.7 0.1 40)" },
      dark: { primary: "oklch(0.7 0.1 220)" },
    });
    expect(getTheme()).toBe("dark");
  });

  it("restores theme from sessionStorage after attribute is cleared", () => {
    setTheme("dark");
    document.documentElement.removeAttribute("data-theme");
    defineThemeColors({
      defaultTheme: "light",
      light: { primary: "oklch(0.7 0.1 40)" },
    });
    expect(getTheme()).toBe("dark");
  });
});
