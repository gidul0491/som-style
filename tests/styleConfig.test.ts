import { describe, it, expect } from "vitest";
import { configure, getStyleConfig } from "../src/createResponsiveStyle.js";

describe("getStyleConfig", () => {
  it("returns breakpoints snapshot", () => {
    configure({ breakpoints: { pc: "1280px", tablet: "768px" } });
    const cfg = getStyleConfig();
    expect(cfg.breakpoints.pc).toBe("1280px");
    expect(cfg.breakpoints.tablet).toBe("768px");
    expect(cfg.classPrefix).toBe("som");
  });
});
