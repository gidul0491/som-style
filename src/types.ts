import type { Properties, PropertiesHyphen } from "csstype";

/**
 * Flat CSS declarations (camelCase preferred; kebab-case also ok),
 * plus `&…` nested selectors. Emit normalizes keys to kebab-case CSS.
 * Unknown property names error on object literals (typo / autocomplete).
 */
export type StyleObject = {
  [K in keyof Properties]?: Properties[K] | null;
} & {
  [K in keyof PropertiesHyphen]?: PropertiesHyphen[K] | null;
} & {
  [K in `&${string}`]?: StyleObject | null | undefined;
};

export type CSSValue = string | number;

export type ResponsiveStyleOptions = {
  /** Styles applied by default (mobile-first) */
  base: StyleObject;
  /** Breakpoint-specific styles (e.g. pc, tablet, or custom px keys) */
  [breakpoint: string]: StyleObject;
};

export type RxStyleConfig = {
  /** Server detection. Default: typeof document === "undefined" */
  isServer?: () => boolean;
  /** Desktop breakpoint for the "pc" key. Default: "1024px" */
  breakpoint?: string;
  /** Map of named breakpoints (e.g. { tablet: "768px", pc: "1024px" }) */
  breakpoints?: Record<string, string>;
  /** Class name prefix. Default: "som" */
  classPrefix?: string;
};
