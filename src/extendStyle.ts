import type { ResponsiveStyleOptions, StyleObject } from "./types.js";

export type StyleExtendPatch = {
  base?: StyleObject;
  [breakpoint: string]: StyleObject | undefined;
};

const isPlainObject = (value: unknown): value is StyleObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Deep-merge two style objects; patch wins on leaf keys. */
export const mergeStyleObject = (
  base: StyleObject,
  patch: StyleObject
): StyleObject => {
  const out: Record<string, unknown> = { ...base };

  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null) continue;
    const prev = out[key];
    if (isPlainObject(value) && isPlainObject(prev)) {
      out[key] = mergeStyleObject(prev, value);
    } else {
      out[key] = value;
    }
  }

  return out as StyleObject;
};

/** Merge responsive style options; patch wins per breakpoint and nested keys. */
export const mergeResponsiveOptions = (
  base: ResponsiveStyleOptions,
  patch: StyleExtendPatch
): ResponsiveStyleOptions => {
  const keys = new Set([...Object.keys(base), ...Object.keys(patch)]);
  const result: Record<string, StyleObject> = {};

  for (const key of keys) {
    const baseLayer = base[key];
    const patchLayer = patch[key];
    if (baseLayer && patchLayer) {
      result[key] = mergeStyleObject(baseLayer, patchLayer);
    } else if (patchLayer) {
      result[key] = { ...patchLayer };
    } else if (baseLayer) {
      result[key] = { ...baseLayer };
    }
  }

  if (!result.base) result.base = {};
  return result as ResponsiveStyleOptions;
};

export const cloneResponsiveOptions = (
  options: ResponsiveStyleOptions
): ResponsiveStyleOptions =>
  JSON.parse(JSON.stringify(options)) as ResponsiveStyleOptions;
