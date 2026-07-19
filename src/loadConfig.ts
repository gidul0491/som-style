import { pathToFileURL, fileURLToPath } from "node:url";
import { access, constants, readFile, writeFile, unlink } from "node:fs/promises";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { configure, getStyleConfig } from "./createResponsiveStyle.js";
import type { EmitStyleContext } from "./emitStyle.js";

export type LoadedStyleConfig = EmitStyleContext;

/** Project folder that holds consumer config + token overrides. */
export const SOM_STYLE_DIR = "som-style";

const CONFIG_CANDIDATES = [
  `${SOM_STYLE_DIR}/config.js`,
  `${SOM_STYLE_DIR}/config.mjs`,
  `${SOM_STYLE_DIR}/config.ts`,
  `${SOM_STYLE_DIR}/config.mts`,
  `${SOM_STYLE_DIR}/config.cts`,
  // Legacy (project root) - still resolved if folder config is missing
  "som-style.config.js",
  "som-style.config.mjs",
  "som-style.config.ts",
  "som-style.config.cts",
  "som-style.config.mts",
];

const fileExists = async (filePath: string) => {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
};

/** Resolve which config file to load (folder first, then legacy root). */
export const resolveSomStyleConfigPath = async (
  root: string,
  configFile?: string
): Promise<string | null> => {
  if (configFile) {
    const resolved = join(root, configFile);
    return (await fileExists(resolved)) ? resolved : null;
  }
  for (const name of CONFIG_CANDIDATES) {
    const candidate = join(root, name);
    if (await fileExists(candidate)) return candidate;
  }
  return null;
};

const packageDir = dirname(fileURLToPath(import.meta.url));

const packageEntryUrl = (subpath: string) =>
  pathToFileURL(join(packageDir, subpath)).href;

/** Rewrite imports so a temp copy still resolves som-style + relative files. */
export const rewriteConfigSourceForLoad = (
  source: string,
  configDir: string
): string => {
  const toAbs = (rel: string) => pathToFileURL(join(configDir, rel)).href;

  return source
    .replace(
      /from\s+["']som-style\/solid["']/g,
      `from ${JSON.stringify(packageEntryUrl("solid.js"))}`
    )
    .replace(
      /from\s+["']som-style["']/g,
      `from ${JSON.stringify(packageEntryUrl("index.js"))}`
    )
    .replace(
      /import\s+["'](\.[^"']+)["']/g,
      (_m, rel: string) => `import ${JSON.stringify(toAbs(rel))}`
    )
    .replace(
      /from\s+["'](\.[^"']+)["']/g,
      (_m, rel: string) => `from ${JSON.stringify(toAbs(rel))}`
    );
};

/** Loads consumer config so configure() side effects apply, then reads snapshot. */
export const loadSomStyleConfig = async (
  root: string,
  configFile?: string
): Promise<LoadedStyleConfig> => {
  configure({ breakpoints: { pc: "1024px" }, breakpoint: "1024px" });

  const resolved = await resolveSomStyleConfigPath(root, configFile);
  if (resolved) {
    const source = await readFile(resolved, "utf8");
    const rewritten = rewriteConfigSourceForLoad(source, dirname(resolved));
    const tmp = join(
      tmpdir(),
      `som-style-config-${Date.now()}-${Math.random().toString(16).slice(2)}.mjs`
    );
    await writeFile(tmp, rewritten, "utf8");
    try {
      await import(pathToFileURL(tmp).href);
    } finally {
      try {
        await unlink(tmp);
      } catch {
        /* ignore */
      }
    }
  }

  return getStyleConfig();
};
