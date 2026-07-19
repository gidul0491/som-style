import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { resolveSomStyleConfigPath, loadSomStyleConfig } from "../src/loadConfig.js";

describe("som-style project folder", () => {
  let dir: string;

  const setup = () => {
    dir = mkdtempSync(join(tmpdir(), "som-style-"));
  };

  const cleanup = () => {
    rmSync(dir, { recursive: true, force: true });
  };

  it("resolves som-style/config.js before legacy root config", async () => {
    setup();
    try {
      mkdirSync(join(dir, "som-style"));
      writeFileSync(join(dir, "som-style", "config.js"), "export {};\n");
      writeFileSync(join(dir, "som-style.config.js"), "export {};\n");
      const resolved = await resolveSomStyleConfigPath(dir);
      expect(resolved?.replace(/\\/g, "/")).toMatch(/som-style\/config\.js$/);
    } finally {
      cleanup();
    }
  });

  it("falls back to legacy som-style.config.js", async () => {
    setup();
    try {
      writeFileSync(join(dir, "som-style.config.js"), "export {};\n");
      const resolved = await resolveSomStyleConfigPath(dir);
      expect(resolved?.replace(/\\/g, "/")).toMatch(/som-style\.config\.js$/);
    } finally {
      cleanup();
    }
  });

  it("reloads breakpoints when config file changes in the same process", async () => {
    setup();
    try {
      mkdirSync(join(dir, "som-style"));
      const configPath = join(dir, "som-style", "config.js");
      const { loadSomStyleConfig: loadFromDist } = await import(
        pathToFileURL(join(process.cwd(), "dist", "loadConfig.js")).href
      );

      writeFileSync(
        configPath,
        `import { configure } from "som-style";\nconfigure({ breakpoints: { pc: "900px" } });\n`
      );
      const first = await loadFromDist(dir);
      expect(first.breakpoints.pc).toBe("900px");

      writeFileSync(
        configPath,
        `import { configure } from "som-style";\nconfigure({ breakpoints: { pc: "1440px" } });\n`
      );
      const second = await loadFromDist(dir);
      expect(second.breakpoints.pc).toBe("1440px");
    } finally {
      cleanup();
    }
  });
});
