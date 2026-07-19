import type { Plugin, ViteDevServer, ModuleNode } from "vite";
import { readFileSync } from "node:fs";
import { dirname, normalize, resolve as pathResolve } from "node:path";
import { emitStyle, type EmitAtom, type EmitStyleContext } from "./emitStyle.js";
import { analyzeStyleCalls } from "./staticAnalyze.js";
import {
  loadSomStyleConfig,
  resolveSomStyleConfigPath,
  type LoadedStyleConfig,
} from "./loadConfig.js";
import {
  collectStyleImportRefs,
  evalAllExportedStringMaps,
  evalExportedStyleOptions,
} from "./resolveImports.js";
import { expandRecipeConfig, recipeSelectionKey } from "./recipeExpand.js";
import { transformThemeForBuild } from "./themeStatic.js";
import type { ResponsiveStyleOptions } from "./types.js";

const VIRTUAL_PREFIX = "virtual:som-style-css:";
const RESOLVED_PREFIX = "\0" + VIRTUAL_PREFIX;

export type TransformStaticResult = {
  code: string;
  /** Full CSS for this file's styles (tests / fallback). */
  css: string;
  /** Deduped atoms for tests / sheet composition. */
  atoms: EmitAtom[];
};

type ResolveFn = (
  id: string,
  importer?: string
) => Promise<string | { id: string } | null | undefined>;

const loadExternalOptions = async (
  code: string,
  importerId: string,
  resolve: ResolveFn
): Promise<Map<string, ResponsiveStyleOptions>> => {
  const map = new Map<string, ResponsiveStyleOptions>();
  const refs = collectStyleImportRefs(code);
  if (refs.length === 0) return map;

  for (const ref of refs) {
    const resolved = await resolve(ref.source, importerId);
    const resolvedId =
      typeof resolved === "string" ? resolved : resolved?.id ?? null;
    if (!resolvedId) continue;
    const filePath = normalize(resolvedId.split("?")[0] ?? resolvedId);
    if (filePath.includes("node_modules")) continue;

    let source: string;
    try {
      source = readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    const options = evalExportedStyleOptions(source, ref.imported);
    if (options) map.set(ref.local, options);
  }

  return map;
};

/** Load string token maps from relative imports (project constant.js — any export name). */
const loadTokenMaps = async (
  code: string,
  importerId: string,
  resolve: ResolveFn,
  watchFile?: (id: string) => void
): Promise<Map<string, Record<string, string>>> => {
  const map = new Map<string, Record<string, string>>();
  const refs = collectStyleImportRefs(code);
  if (refs.length === 0) return map;

  const readLocal = (filePath: string): string | null => {
    try {
      return readFileSync(filePath, "utf8");
    } catch {
      return null;
    }
  };

  for (const ref of refs) {
    let filePath: string | null = null;
    let source: string | null = null;

    // Prefer path resolve — Vite this.resolve often fails for sibling ./ files here.
    if (ref.source.startsWith(".")) {
      filePath = normalize(pathResolve(dirname(importerId), ref.source));
      source = readLocal(filePath);
    }

    if (source == null) {
      const resolved = await resolve(ref.source, importerId);
      const resolvedId =
        typeof resolved === "string" ? resolved : resolved?.id ?? null;
      if (!resolvedId) continue;
      filePath = normalize(resolvedId.split("?")[0] ?? resolvedId);
      if (filePath.includes("node_modules")) continue;
      source = readLocal(filePath);
    }

    if (source == null || filePath == null) continue;
    if (filePath.includes("node_modules")) continue;

    watchFile?.(filePath);
    const exported = evalAllExportedStringMaps(source);
    const table = exported.get(ref.imported);
    if (table) map.set(ref.local, table);
  }

  return map;
};

const emitRecipeLookupExpr = (
  classMap: Record<string, string>,
  defaults: Record<string, string>
): string => {
  const fallbackKey = recipeSelectionKey(defaults);
  return `((__p={})=>{const __d=${JSON.stringify(defaults)};const __s={...__d,...__p};const __k=Object.keys(__s).filter((k)=>__s[k]!=null&&__s[k]!=="").sort().map((k)=>k+"="+__s[k]).join("|");const __m=${JSON.stringify(classMap)};return __m[__k]||__m[${JSON.stringify(fallbackKey)}]||Object.values(__m)[0]||"";})`;
};

/** Keep `.className` / string coercion after static extract (bare strings break `.className`). */
const emitStaticHandleExpr = (className: string): string =>
  `Object.assign(Object(${JSON.stringify(className)}),{className:${JSON.stringify(className)}})`;

/**
 * Replaces static style(), variants(), recipe(), and same-file .extend() with
 * class-name strings / maps / lookups; emits CSS. Throws on dynamic args.
 */
export const transformForBuild = (
  code: string,
  fileId: string,
  ctx: EmitStyleContext,
  externalOptions?: Map<string, ResponsiveStyleOptions>,
  tokenMaps?: Map<string, Record<string, string>>
): TransformStaticResult => {
  const hits = analyzeStyleCalls(code, { externalOptions, tokenMaps });
  if (hits.length === 0) {
    return { code, css: "", atoms: [] };
  }

  for (const hit of hits) {
    if (hit.kind === "dynamic") {
      throw new Error(
        `[som-style] ${fileId}: static extraction failed. ${hit.error ?? "Use a static style() / variants() / recipe() / .extend({ ... }) literal."}`.trim()
      );
    }
  }

  const cssParts: string[] = [];
  let next = code;
  const atomById = new Map<string, { id: string; css: string }>();

  const collectAtoms = (atoms: { id: string; css: string }[]) => {
    for (const atom of atoms) {
      if (!atomById.has(atom.id)) atomById.set(atom.id, atom);
    }
  };

  const staticHits = [...hits].sort((a, b) => b.start - a.start);
  for (const hit of staticHits) {
    if (hit.kind === "variants" && hit.variantMap) {
      const entries: string[] = [];
      for (const [key, options] of Object.entries(hit.variantMap)) {
        const emitted = emitStyle(options, ctx);
        collectAtoms(emitted.atoms);
        entries.push(
          `${JSON.stringify(key)}:${emitStaticHandleExpr(emitted.className)}`
        );
      }
      next =
        next.slice(0, hit.start) +
        `({${entries.join(",")}})` +
        next.slice(hit.end);
      continue;
    }

    if (hit.kind === "recipe" && hit.recipeConfig) {
      const expanded = expandRecipeConfig(hit.recipeConfig);
      const classMap: Record<string, string> = {};
      for (const entry of expanded.entries) {
        const emitted = emitStyle(entry.options, ctx);
        collectAtoms(emitted.atoms);
        classMap[entry.key] = emitted.className;
      }
      next =
        next.slice(0, hit.start) +
        emitRecipeLookupExpr(classMap, expanded.defaults) +
        next.slice(hit.end);
      continue;
    }

    const emitted = emitStyle(hit.options!, ctx);
    collectAtoms(emitted.atoms);
    next =
      next.slice(0, hit.start) +
      emitStaticHandleExpr(emitted.className) +
      next.slice(hit.end);
  }

  // Base atoms first, then media — prevents later base rules from beating earlier @media.
  const css = composeAtomCss([...atomById.values()]);

  return { code: next, css, atoms: [...atomById.values()] };
};

/** Stable shared-sheet CSS: base rules, then @media (atomic dedupe by id). */
export const composeAtomCss = (atoms: EmitAtom[]): string => {
  const baseAtoms: string[] = [];
  const mediaAtoms: string[] = [];
  const seen = new Set<string>();
  for (const atom of atoms) {
    if (seen.has(atom.id)) continue;
    seen.add(atom.id);
    if (atom.css.startsWith("@media")) mediaAtoms.push(atom.css);
    else baseAtoms.push(atom.css);
  }
  return [...baseAtoms, ...mediaAtoms].join("\n");
};

/** Virtual CSS key for the app-wide atom sheet (one import across modules). */
export const SHARED_CSS_KEY = "__shared__";

export type SharedSheetEntry = {
  atoms: EmitAtom[];
  themeCss?: string;
};

/**
 * Merge per-module atoms/themes into one sheet: themes first, then base atoms,
 * then @media — so shared base atoms cannot beat earlier breakpoint overrides.
 */
export const buildSharedCss = (entries: Iterable<SharedSheetEntry>): string => {
  const atomMap = new Map<string, EmitAtom>();
  const themes: string[] = [];
  for (const entry of entries) {
    if (entry.themeCss) themes.push(entry.themeCss);
    for (const atom of entry.atoms) {
      if (!atomMap.has(atom.id)) atomMap.set(atom.id, atom);
    }
  }
  return [...themes, composeAtomCss([...atomMap.values()])]
    .filter(Boolean)
    .join("\n");
};

export type SomStylePluginOptions = {
  configFile?: string;
};

const toVirtualImport = (key: string) => `${VIRTUAL_PREFIX}${key}.css`;

const toResolvedId = (key: string) => `${RESOLVED_PREFIX}${key}.css`;

const keyFromResolvedId = (resolvedId: string): string | null => {
  if (!resolvedId.startsWith(RESOLVED_PREFIX)) return null;
  let key = resolvedId.slice(RESOLVED_PREFIX.length);
  if (key.endsWith(".css")) key = key.slice(0, -4);
  return key;
};

/** Windows-safe path compare (Vite often uses `/`, Node `normalize` uses `\`). */
const canonPath = (p: string): string =>
  normalize(p.split("?")[0] ?? p)
    .replace(/\\/g, "/")
    .toLowerCase();

const isProjectConstantJs = (file: string): boolean =>
  /\/som-style\/constant\.[cm]?js$/.test(canonPath(file));

const isProjectThemeJs = (file: string): boolean =>
  /\/som-style\/theme\.[cm]?[jt]s$/.test(canonPath(file));

const isProjectConfigJs = (file: string): boolean => {
  const p = canonPath(file);
  return (
    /\/som-style\/config\.[cm]?[jt]s$/.test(p) ||
    /\/som-style\.config\.[cm]?[jt]s$/.test(p)
  );
};

/**
 * Vite plugin: static style extract + one shared virtual CSS sheet.
 * Atoms from every module are merged (deduped) with base rules before @media.
 * Prod path avoids the JS style engine when calls are static.
 *
 * `som-style` resolves to the real `som-style/runtime` file (not a virtual
 * module that re-exports a bare specifier — that can white-screen in the
 * browser when the specifier is left unresolved).
 */
export function somStyle(opts: SomStylePluginOptions = {}): Plugin {
  let styleConfig: LoadedStyleConfig = {
    breakpoints: { pc: "1024px" },
    classPrefix: "som",
    breakpoint: "1024px",
  };
  let root = process.cwd();
  let server: ViteDevServer | undefined;
  const cssByKey = new Map<string, string>();
  /** Per consumer module: atoms + optional theme CSS for the shared sheet. */
  const sheetByConsumer = new Map<string, SharedSheetEntry>();
  /** canon(token file) → canon(consumer module paths) */
  const tokenFileConsumers = new Map<string, Set<string>>();

  const invalidateVirtualCss = (key: string) => {
    if (!server) return;
    const id = toResolvedId(key);
    const mod = server.moduleGraph.getModuleById(id);
    if (!mod) return;
    server.moduleGraph.invalidateModule(mod);
  };

  const rebuildSharedSheet = () => {
    const css = buildSharedCss(sheetByConsumer.values());
    if (css) cssByKey.set(SHARED_CSS_KEY, css);
    else cssByKey.delete(SHARED_CSS_KEY);
    invalidateVirtualCss(SHARED_CSS_KEY);
  };

  const applyExtractedCss = (
    consumerKey: string,
    themeCss: string,
    styleResult: TransformStaticResult
  ): string => {
    const hasAtoms = styleResult.atoms.length > 0;
    const hasTheme = Boolean(themeCss);
    if (hasAtoms || hasTheme) {
      sheetByConsumer.set(consumerKey, {
        atoms: styleResult.atoms,
        themeCss: themeCss || undefined,
      });
    } else {
      sheetByConsumer.delete(consumerKey);
    }
    rebuildSharedSheet();
    if (!hasAtoms && !hasTheme) return styleResult.code;
    return `import "${toVirtualImport(SHARED_CSS_KEY)}";\n${styleResult.code}`;
  };

  const trackTokenConsumer = (tokenFile: string, consumerId: string) => {
    const file = canonPath(tokenFile);
    const consumer = canonPath(consumerId);
    let set = tokenFileConsumers.get(file);
    if (!set) {
      set = new Set();
      tokenFileConsumers.set(file, set);
    }
    set.add(consumer);
  };

  const findGraphModules = (
    devServer: ViteDevServer,
    consumerCanon: string
  ): ModuleNode[] => {
    const out: ModuleNode[] = [];
    for (const mod of devServer.moduleGraph.idToModuleMap.values()) {
      const id = mod.id ? canonPath(mod.id) : "";
      const file = mod.file ? canonPath(mod.file) : "";
      if (id === consumerCanon || file === consumerCanon) out.push(mod);
    }
    return out;
  };

  const collectConsumersForTokenChange = (
    file: string,
    modules: ModuleNode[]
  ): Set<string> => {
    const fileCanon = canonPath(file);
    const consumers = new Set<string>();

    for (const [tokenPath, set] of tokenFileConsumers) {
      if (tokenPath === fileCanon) {
        for (const c of set) consumers.add(c);
      }
    }

    // Path map miss (slash/casing) — still treat project constant.js as hot
    if (consumers.size === 0 && (isProjectConstantJs(file) || isProjectThemeJs(file))) {
      for (const set of tokenFileConsumers.values()) {
        for (const c of set) consumers.add(c);
      }
    }

    for (const mod of modules) {
      for (const importer of mod.importers) {
        if (importer.id) consumers.add(canonPath(importer.id));
        if (importer.file) consumers.add(canonPath(importer.file));
      }
    }

    return consumers;
  };

  /** Re-read tokens + re-extract CSS into cssByKey before full-reload. */
  const reextractConsumer = async (
    consumerCanon: string,
    resolve: ResolveFn
  ): Promise<void> => {
    // Prefer real filesystem path from the module graph
    let filePath: string | null = null;
    if (server) {
      for (const mod of findGraphModules(server, consumerCanon)) {
        if (mod.file) {
          filePath = mod.file;
          break;
        }
      }
    }
    if (!filePath) {
      // consumerCanon is like c:/git/.../main.js
      filePath = consumerCanon;
    }

    let source: string;
    try {
      source = readFileSync(filePath, "utf8");
    } catch {
      return;
    }
    if (!/\bstyle\s*\(/.test(source) && !/\bdefineTheme\s*\(/.test(source)) {
      return;
    }

    const normalizedId = normalize(filePath);
    const themeResult = transformThemeForBuild(source, filePath);
    const tokenMaps = await loadTokenMaps(
      themeResult.code,
      normalizedId,
      resolve,
      (tokenFile) => {
        trackTokenConsumer(tokenFile, normalizedId);
      }
    );
    const styleResult = transformForBuild(
      themeResult.code,
      filePath,
      styleConfig,
      undefined,
      tokenMaps
    );
    const consumerKey = encodeURIComponent(filePath);
    applyExtractedCss(consumerKey, themeResult.css, styleResult);
  };

  return {
    name: "som-style",
    enforce: "pre",
    configResolved(config) {
      root = config.root;
    },
    configureServer(devServer) {
      server = devServer;
    },
    async buildStart() {
      const configPath = await resolveSomStyleConfigPath(root, opts.configFile);
      if (configPath) this.addWatchFile(configPath);
      styleConfig = await loadSomStyleConfig(root, opts.configFile);
      cssByKey.clear();
      sheetByConsumer.clear();
      tokenFileConsumers.clear();
    },
    async handleHotUpdate({ file, modules, server: devServer }) {
      if (isProjectConfigJs(file)) {
        styleConfig = await loadSomStyleConfig(root, opts.configFile);
        cssByKey.clear();
        sheetByConsumer.clear();
        const rootCanon = canonPath(root);
        for (const mod of [...devServer.moduleGraph.idToModuleMap.values()]) {
          const id = mod.id ?? "";
          const modFile = mod.file ?? "";
          const underRoot =
            modFile &&
            canonPath(modFile).startsWith(rootCanon) &&
            !modFile.includes("node_modules");
          if (
            id.includes(VIRTUAL_PREFIX) ||
            id.startsWith(RESOLVED_PREFIX) ||
            underRoot
          ) {
            devServer.moduleGraph.invalidateModule(mod);
          }
        }
        for (const mod of modules) {
          devServer.moduleGraph.invalidateModule(mod);
        }
        devServer.ws.send({ type: "full-reload" });
        return [];
      }

      const fileCanon = canonPath(file);
      const tracked =
        tokenFileConsumers.has(fileCanon) ||
        isProjectConstantJs(file) ||
        isProjectThemeJs(file) ||
        modules.some(
          (m) =>
            (m.file &&
              (isProjectConstantJs(m.file) || isProjectThemeJs(m.file))) ||
            (m.id && (isProjectConstantJs(m.id) || isProjectThemeJs(m.id)))
        );

      if (!tracked) return;

      const consumers = collectConsumersForTokenChange(file, modules);
      const resolve: ResolveFn = async (source, importer) => {
        const result = await devServer.pluginContainer.resolveId(
          source,
          importer
        );
        return result;
      };

      for (const consumer of consumers) {
        await reextractConsumer(consumer, resolve);
        for (const mod of findGraphModules(devServer, consumer)) {
          devServer.moduleGraph.invalidateModule(mod);
        }
      }

      for (const mod of modules) {
        devServer.moduleGraph.invalidateModule(mod);
      }

      // Hashed class names in JS must refresh with CSS.
      devServer.ws.send({ type: "full-reload" });
      return [];
    },
    async resolveId(id, importer, options) {
      if (id === "som-style") {
        return this.resolve("som-style/runtime", importer, {
          skipSelf: true,
          ...options,
        });
      }
      if (id === "som-style/solid") {
        return this.resolve("som-style/solid-runtime", importer, {
          skipSelf: true,
          ...options,
        });
      }
      if (id.startsWith(VIRTUAL_PREFIX) && id.endsWith(".css")) {
        return RESOLVED_PREFIX + id.slice(VIRTUAL_PREFIX.length);
      }
      return null;
    },
    load(id) {
      const key = keyFromResolvedId(id);
      if (key === null) return null;
      return cssByKey.get(key) ?? "";
    },
    async transform(code, id) {
      const normalizedId = normalize(id.split("?")[0] ?? id);
      const normalizedRoot = normalize(root);
      if (!normalizedId.startsWith(normalizedRoot)) return null;
      if (
        !/\.[cm]?[jt]sx?$/.test(normalizedId) ||
        normalizedId.includes("node_modules")
      ) {
        return null;
      }
      if (
        !/\bstyle\s*\(/.test(code) &&
        !/\.extend\s*\(/.test(code) &&
        !/\bvariants\s*\(/.test(code) &&
        !/\brecipe\s*\(/.test(code) &&
        !/\bdefineTheme\s*\(/.test(code)
      ) {
        return null;
      }

      try {
        const resolve: ResolveFn = async (source, importer) => {
          const result = await this.resolve(source, importer, {
            skipSelf: true,
          });
          return result;
        };
        const themeResult = transformThemeForBuild(code, id);
        const externalOptions = await loadExternalOptions(
          themeResult.code,
          normalizedId,
          resolve
        );
        const tokenMaps = await loadTokenMaps(
          themeResult.code,
          normalizedId,
          resolve,
          (filePath) => {
            this.addWatchFile(filePath);
            trackTokenConsumer(filePath, normalizedId);
          }
        );
        const styleResult = transformForBuild(
          themeResult.code,
          id,
          styleConfig,
          externalOptions,
          tokenMaps
        );
        const consumerKey = encodeURIComponent(id);
        const out = applyExtractedCss(
          consumerKey,
          themeResult.css,
          styleResult
        );
        if (
          out === styleResult.code &&
          !themeResult.css &&
          styleResult.atoms.length === 0
        ) {
          return { code: styleResult.code, map: null };
        }
        return { code: out, map: null };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.error(message);
        return null;
      }
    },
  };
}

export default somStyle;
