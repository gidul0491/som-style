import type { ResponsiveStyleOptions, RxStyleConfig } from "./types.js";
import {
  emitStyle,
  type EmitAtom,
  type EmitStyleContext,
} from "./emitStyle.js";
import {
  cloneResponsiveOptions,
  mergeResponsiveOptions,
  type StyleExtendPatch,
} from "./extendStyle.js";

export type { StyleExtendPatch } from "./extendStyle.js";
export {
  mergeResponsiveOptions,
  mergeStyleObject,
  cloneResponsiveOptions,
} from "./extendStyle.js";

type StyleCacheEntry = {
  className: string;
  atoms: EmitAtom[];
};

/**
 * Style result: string-like for React `className={box}` / `class={box}`;
 * call extend() to override properties. `.className` is the same string.
 */
export type StyleHandle = string & {
  readonly className: string;
  readonly options: ResponsiveStyleOptions;
  extend(patch: StyleExtendPatch): StyleHandle;
};

const injectedAtoms = new Set<string>();
const styleCache = new Map<string, StyleCacheEntry>();
const styleRegistry = new Set<string>();
let singleStyleSheet: HTMLStyleElement | null = null;

let config: {
  isServer: () => boolean;
  breakpoint: string;
  breakpoints: Record<string, string>;
  classPrefix: string;
} = {
  isServer: () => typeof document === "undefined",
  breakpoint: "1024px",
  breakpoints: { pc: "1024px" },
  classPrefix: "som",
};

export const configure = (options: RxStyleConfig) => {
  const defaultBp = options.breakpoint ?? config.breakpoint;
  const userBreakpoints = options.breakpoints ?? {};

  config = {
    ...config,
    ...options,
    isServer: options.isServer ?? config.isServer,
    breakpoint: defaultBp,
    breakpoints: {
      pc: defaultBp,
      ...config.breakpoints,
      ...userBreakpoints,
    },
    classPrefix: options.classPrefix ?? config.classPrefix,
  };
};

/** Snapshot used by runtime emit and the Vite plugin. */
export const getStyleConfig = (): EmitStyleContext => ({
  breakpoints: { ...config.breakpoints },
  classPrefix: config.classPrefix,
  breakpoint: config.breakpoint,
});

/** Returns CSS collected during SSR. */
export const getCollectedStyles = () =>
  Array.from(styleRegistry).join("\n");

/** Clears the SSR style registry. */
export const clearCollectedStyles = () => {
  styleRegistry.clear();
};

/** Injects global CSS on the client, or collects it for SSR. */
export const injectGlobalCss = (css: string, id: string) => {
  if (!config.isServer() && typeof document !== "undefined") {
    const elId = `som-global-${id}`;
    const existing = document.getElementById(elId);
    if (existing) {
      existing.textContent = css;
      return;
    }
    const styleEl = document.createElement("style");
    styleEl.id = elId;
    styleEl.textContent = css;
    document.head.appendChild(styleEl);
  } else if (!styleRegistry.has(css)) {
    styleRegistry.add(css);
  }
};

const getSingleStyleSheet = (): HTMLStyleElement | null => {
  if (config.isServer() || typeof document === "undefined") return null;
  if (!singleStyleSheet) {
    const elId = "som-single-sheet";
    const existing = document.getElementById(elId) as HTMLStyleElement | null;
    if (existing) {
      singleStyleSheet = existing;
    } else {
      const styleEl = document.createElement("style");
      styleEl.id = elId;
      document.head.appendChild(styleEl);
      singleStyleSheet = styleEl;
    }
  }
  return singleStyleSheet;
};

const insertCssChunk = (cssContent: string) => {
  const styleEl = getSingleStyleSheet();
  if (styleEl && styleEl.sheet) {
    try {
      const sheet = styleEl.sheet;
      const rules = cssContent
        .split(/(?<=\})\s*(?=@media|\.[a-zA-Z0-9_-]+)/g)
        .map((r) => r.trim())
        .filter(Boolean);

      for (const rule of rules) {
        sheet.insertRule(rule, sheet.cssRules.length);
      }
      return;
    } catch {
      styleEl.appendChild(document.createTextNode(cssContent + "\n"));
      return;
    }
  }
  if (styleEl) {
    styleEl.appendChild(document.createTextNode(cssContent + "\n"));
  }
};

const ensureAtoms = (atoms: EmitAtom[]) => {
  if (!config.isServer() && typeof document !== "undefined") {
    for (const atom of atoms) {
      if (injectedAtoms.has(atom.id)) continue;
      injectedAtoms.add(atom.id);
      insertCssChunk(atom.css);
    }
    return;
  }

  for (const atom of atoms) {
    if (!styleRegistry.has(atom.css)) {
      styleRegistry.add(atom.css);
    }
  }
};

const isStyleHandle = (value: unknown): value is StyleHandle =>
  typeof value === "object" &&
  value !== null &&
  "className" in value &&
  "options" in value &&
  typeof (value as StyleHandle).extend === "function";

/**
 * Merge style declarations (or a StyleHandle's options) then pass to style().
 * Prefer this over stacking class names that set the same CSS property.
 */
export const extend = (
  base: ResponsiveStyleOptions | StyleHandle,
  patch: StyleExtendPatch
): ResponsiveStyleOptions => {
  const baseOptions = isStyleHandle(base) ? base.options : base;
  return mergeResponsiveOptions(baseOptions, patch);
};

/**
 * Bind an already-emitted class list to options (Vite extract + .extend()).
 * Prefer style() in app code; the plugin emits this helper.
 * Returns a String object so React/DOM accept `className={handle}`.
 */
export const makeStyleHandle = (
  className: string,
  options: ResponsiveStyleOptions
): StyleHandle => {
  const stored = cloneResponsiveOptions(options);

  const handle = Object.assign(new String(className), {
    className,
    options: stored,
    extend(patch: StyleExtendPatch) {
      return style(mergeResponsiveOptions(stored, patch));
    },
  });

  return handle as StyleHandle;
};

/**
 * Mobile-first styles from a CSS-like object.
 * Returns a handle: stringifies to class names; use .extend() to override props.
 */
export const style = (options: ResponsiveStyleOptions): StyleHandle => {
  warnIfLikelyInRender();

  let opts = options;
  if (!opts || typeof opts !== "object") {
    console.error(
      "[som-style] Invalid options passed to style(). Expected an object."
    );
    opts = { base: {} };
  }

  if (!opts.base) {
    console.warn(
      '[som-style] Missing "base" property in style({ ... }). Defaulting to empty base styles.'
    );
  }

  const ctx: EmitStyleContext = {
    breakpoints: config.breakpoints,
    classPrefix: config.classPrefix,
    breakpoint: config.breakpoint,
  };

  const emitted = emitStyle(opts, ctx);
  const cached = styleCache.get(emitted.styleKey);
  if (cached) {
    ensureAtoms(cached.atoms);
    return makeStyleHandle(cached.className, opts);
  }

  ensureAtoms(emitted.atoms);
  styleCache.set(emitted.styleKey, {
    className: emitted.className,
    atoms: emitted.atoms,
  });
  return makeStyleHandle(emitted.className, opts);
};

let warnedRenderCall = false;

/** @internal reset render-warning latch (tests). */
export const __resetStyleWarningsForTests = () => {
  warnedRenderCall = false;
};

const isProduction = () =>
  typeof process !== "undefined" && process.env?.NODE_ENV === "production";

/** Dev-only: warn when style() looks like it runs inside a React render. */
const warnIfLikelyInRender = () => {
  if (isProduction() || warnedRenderCall) return;
  const stack = new Error().stack ?? "";
  if (
    /renderWithHooks|finishFunctionComponent|renderNodeDestructive|renderToString/.test(
      stack
    )
  ) {
    warnedRenderCall = true;
    console.warn(
      "[som-style] style() looks like it ran during React render. Call style() / recipe() at module top level, then pick classes in render."
    );
  }
};
