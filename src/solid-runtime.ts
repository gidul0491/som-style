import { isServer } from "solid-js/web";
import { configure } from "./createResponsiveStyle.js";

configure({ isServer: () => isServer });

export {
  configure,
  style,
  extend,
  getCollectedStyles,
  clearCollectedStyles,
} from "./createResponsiveStyle.js";

export { variants, recipe, cx } from "./variants.js";
export type { VariantMap, RecipeConfig } from "./variants.js";

export { setTheme, getTheme, defineTheme, defineThemeColors } from "./theme.js";

export type {
  CSSValue,
  StyleObject,
  ResponsiveStyleOptions,
  RxStyleConfig,
} from "./types.js";
export type {
  StyleHandle,
  StyleExtendPatch,
} from "./createResponsiveStyle.js";
export type { Theme, ThemeColors, ThemeDefinition } from "./theme.js";
