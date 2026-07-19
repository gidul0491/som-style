import { injectGlobalCss } from "./createResponsiveStyle.js";

export type Theme = "light" | "dark";

let currentDefault: Theme = "light";

const THEME_STORAGE_KEY = "som-style-theme";

const readStoredTheme = (): Theme | null => {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const value = sessionStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark") return value;
  } catch {
    /* private mode / blocked storage */
  }
  return null;
};

export const setTheme = (theme: Theme) => {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
  try {
    sessionStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* private mode / blocked storage */
  }
};

/** Current theme (`data-theme`), or the default from `defineTheme`. */
export const getTheme = (): Theme => {
  if (typeof document !== "undefined") {
    const theme = document.documentElement.getAttribute("data-theme");
    if (theme === "light" || theme === "dark") return theme;
  }
  return currentDefault;
};

/** Token name → CSS value (in light/dark). */
export type ThemeColors = Record<string, string>;

export interface ThemeDefinition {
  /** First theme. Default: `"light"`. */
  defaultTheme?: Theme;
  /**
   * All theme tokens for light mode → `--som-theme-*` and `theme.*` handles.
   * Include palette, hue, soft border, shadow, etc. in one object.
   */
  light: ThemeColors;
  /** Dark overrides (merged onto light). */
  dark?: ThemeColors;
}

const camelToKebab = (str: string) =>
  str.replace(/([A-Z])/g, "-$1").toLowerCase();

const themeBlock = (selector: string, tokens: ThemeColors) => {
  const body = Object.entries(tokens)
    .map(([name, value]) => `--som-theme-${camelToKebab(name)}:${value};`)
    .join("");
  return body ? `${selector}{${body}}` : "";
};

/** Build light/dark CSS variable blocks (no DOM / no inject). */
export const emitThemeCss = (theme: ThemeDefinition): string => {
  const light = theme.light || {};
  const dark = { ...light, ...(theme.dark || {}) };

  return (
    themeBlock(":root", light) + themeBlock(':root[data-theme="dark"]', dark)
  );
};

/** JS handles: theme.primary → var(--som-theme-primary). */
export const themeHandles = (def: ThemeDefinition): ThemeColors => {
  const keys = new Set([
    ...Object.keys(def.light || {}),
    ...Object.keys(def.dark || {}),
  ]);
  const out: ThemeColors = {};
  for (const key of keys) {
    out[key] = `var(--som-theme-${camelToKebab(key)})`;
  }
  return out;
};

/**
 * Apply default theme attribute. Returns the same handles as defineTheme
 * (Vite rewrites defineTheme → this so CSS is not injected twice).
 * Preserves an existing data-theme / session choice across HMR reloads.
 */
export const defineThemeColors = (def: ThemeDefinition): ThemeColors => {
  if (!def || typeof def !== "object" || !def.light) {
    console.error(
      '[som-style] Invalid theme definition. Expected defineTheme({ light: { ... }, dark?: { ... } }).'
    );
    return {};
  }

  currentDefault = def.defaultTheme ?? "light";

  if (typeof document !== "undefined") {
    const existing = document.documentElement.getAttribute("data-theme");
    if (existing !== "light" && existing !== "dark") {
      setTheme(readStoredTheme() ?? currentDefault);
    }
  }

  return themeHandles(def);
};

/**
 * Injects light/dark CSS vars and returns flat handles for style().
 * Prefer Vite extract path. Export as `theme` from app theme.js.
 */
export const defineTheme = (def: ThemeDefinition): ThemeColors => {
  if (!def || typeof def !== "object" || !def.light) {
    console.error(
      '[som-style] Invalid theme definition. Expected defineTheme({ light: { ... }, dark?: { ... } }).'
    );
    return {};
  }

  injectGlobalCss(emitThemeCss(def), "theme");
  return defineThemeColors(def);
};
