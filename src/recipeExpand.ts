import {
  cloneResponsiveOptions,
  mergeResponsiveOptions,
  type StyleExtendPatch,
} from "./extendStyle.js";
import type { ResponsiveStyleOptions } from "./types.js";

export type RecipeConfig = {
  base: ResponsiveStyleOptions;
  variants?: Record<string, Record<string, StyleExtendPatch>>;
  compoundVariants?: Array<{
    css: StyleExtendPatch;
    [axis: string]: string | StyleExtendPatch;
  }>;
  defaultVariants?: Record<string, string>;
};

export const recipeSelectionKey = (
  selected: Record<string, string | undefined>
): string =>
  Object.keys(selected)
    .filter((k) => selected[k] != null && selected[k] !== "")
    .sort()
    .map((k) => `${k}=${selected[k]}`)
    .join("|");

/** Tiny lookup used after Vite extracts a recipe() call (no style engine). */
export const recipeLookup = (
  classMap: Record<string, string>,
  defaults: Record<string, string> = {}
) => {
  return (props: Record<string, string | undefined> = {}): string => {
    const selected = { ...defaults, ...props };
    const key = recipeSelectionKey(selected);
    if (classMap[key]) return classMap[key];
    const fallback = recipeSelectionKey(defaults);
    return classMap[fallback] ?? Object.values(classMap)[0] ?? "";
  };
};

export type ExpandedRecipeEntry = {
  key: string;
  selection: Record<string, string>;
  options: ResponsiveStyleOptions;
};

const cartesian = (
  variants: Record<string, Record<string, StyleExtendPatch>>
): Record<string, string>[] => {
  const axes = Object.keys(variants);
  if (axes.length === 0) return [{}];

  let combos: Record<string, string>[] = [{}];
  for (const axis of axes) {
    const values = Object.keys(variants[axis] ?? {});
    if (values.length === 0) continue;
    const next: Record<string, string>[] = [];
    for (const combo of combos) {
      for (const value of values) {
        next.push({ ...combo, [axis]: value });
      }
    }
    combos = next;
  }
  return combos;
};

const applySelection = (
  config: RecipeConfig,
  selection: Record<string, string>
): ResponsiveStyleOptions => {
  let opts = cloneResponsiveOptions(config.base);

  for (const [axis, value] of Object.entries(selection)) {
    const patch = config.variants?.[axis]?.[value];
    if (patch) opts = mergeResponsiveOptions(opts, patch);
  }

  for (const compound of config.compoundVariants ?? []) {
    const { css, ...conds } = compound;
    const match = Object.entries(conds).every(
      ([k, v]) => typeof v === "string" && selection[k] === v
    );
    if (match && css && typeof css === "object" && !Array.isArray(css)) {
      opts = mergeResponsiveOptions(opts, css as StyleExtendPatch);
    }
  }

  return opts;
};

const MAX_RECIPE_COMBOS = 64;

/** Expand a recipe config into every variant combination (for Vite extract). */
export const expandRecipeConfig = (
  config: RecipeConfig
): { defaults: Record<string, string>; entries: ExpandedRecipeEntry[] } => {
  const defaults = { ...(config.defaultVariants ?? {}) };
  const combos = cartesian(config.variants ?? {});

  if (combos.length > MAX_RECIPE_COMBOS) {
    throw new Error(
      `[som-style] recipe() has ${combos.length} combinations (max ${MAX_RECIPE_COMBOS}). Reduce variant axes.`
    );
  }

  const entries = combos.map((selection) => {
    const merged = { ...defaults, ...selection };
    return {
      key: recipeSelectionKey(merged),
      selection: merged,
      options: applySelection(config, merged),
    };
  });

  if (entries.length === 0) {
    entries.push({
      key: recipeSelectionKey(defaults),
      selection: defaults,
      options: applySelection(config, defaults),
    });
  }

  return { defaults, entries };
};
