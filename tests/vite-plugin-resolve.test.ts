import { describe, it, expect, afterEach } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { somStyle } from "../src/vite-plugin.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("somStyle resolveId", () => {
  let server: ViteDevServer | undefined;

  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it("maps som-style to the real runtime file, not a bare-specifier virtual", async () => {
    server = await createServer({
      root,
      logLevel: "silent",
      server: { middlewareMode: true },
      plugins: [somStyle()],
    });

    const resolved = await server.pluginContainer.resolveId("som-style");
    expect(resolved).toBeTruthy();
    expect(resolved!.id).toMatch(/runtime\.(js|ts|mjs)$/);
    expect(resolved!.id).not.toContain("\0");
    expect(resolved!.id).not.toContain("virtual:");

    const loaded = await server.pluginContainer.load(resolved!.id);
    const code =
      typeof loaded === "string"
        ? loaded
        : loaded && typeof loaded === "object" && "code" in loaded
          ? String((loaded as { code: string }).code)
          : null;
    if (code != null) {
      expect(code).not.toMatch(/export \* from ["']som-style\//);
    }
  });
});
