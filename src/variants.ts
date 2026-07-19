import { style, type StyleHandle } from "./createResponsiveStyle.js";
import type { ResponsiveStyleOptions } from "./types.js";
import {
  expandRecipeConfig,
  recipeLookup,
  type RecipeConfig,
} from "./recipeExpand.js";

export { recipeLookup } from "./recipeExpand.js";
export type { RecipeConfig } from "./recipeExpand.js";

export type VariantMap<T extends Record<string, ResponsiveStyleOptions>> = {
  [K in keyof T]: StyleHandle;
};

/**
 * Build a fixed set of styles and pick one at runtime (status, fetch result key, …).
 * Keys and option objects must be static; only the chosen key may be dynamic.
 */
export const variants = <T extends Record<string, ResponsiveStyleOptions>>(
  map: T
): VariantMap<T> => {
  const out = {} as VariantMap<T>;
  for (const key of Object.keys(map) as (keyof T)[]) {
    out[key] = style(map[key]);
  }
  return out;
};

/**
 * Variant axes helper (size/tone/…): like a thin Panda recipe.
 * Without Vite: prebuilds all combinations via style() once at module init.
 * With Vite: replaced by recipeLookup(classMap) — no style engine in the bundle.
 */
export const recipe = (config: RecipeConfig) => {
  const { defaults, entries } = expandRecipeConfig(config);
  const classMap: Record<string, string> = {};
  for (const entry of entries) {
    classMap[entry.key] = String(style(entry.options));
  }
  return recipeLookup(classMap, defaults);
};

/** Join class names / style handles (skips falsy). */
export const cx = (
  ...parts: Array<string | StyleHandle | false | null | undefined>
): string =>
  parts
    .filter((p): p is string | StyleHandle => Boolean(p))
    .map((p) => String(p))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
