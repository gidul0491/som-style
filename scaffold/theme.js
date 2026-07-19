import { defineTheme } from "som-style";

/**
 * All theme tokens live in light/dark -> --som-theme-* and theme.* handles.
 * (hue, colors, soft border, shadow - one place per mode)
 */
export const theme = defineTheme({
  defaultTheme: "light",
  light: {
    hue: "44.63",
    edgeShine: "oklch(1 0 0 / 0.78)",
    edgeShade: "oklch(0.42 0.02 var(--som-theme-hue) / 0.18)",
    softBorder:
      "color-mix(in oklch, var(--som-theme-border-strong) 42%, transparent)",
    softBorderOnFill:
      "color-mix(in oklch, var(--som-theme-on-primary) 32%, transparent)",
    shadow: "oklch(0.2 0.02 var(--som-theme-hue) / 0.14)",
    shadowStrong: "oklch(0.15 0.02 var(--som-theme-hue) / 0.2)",
    primary: "oklch(0.6868 0.1843 var(--som-theme-hue))",
    primaryHover: "oklch(0.6 0.19 var(--som-theme-hue))",
    primaryFocus: "oklch(0.6868 0.1843 var(--som-theme-hue) / 0.5)",
    onPrimary: "oklch(1 0 0)",
    text: "oklch(0.35 0.02 var(--som-theme-hue))",
    textHeading: "oklch(0.25 0.03 var(--som-theme-hue))",
    textMuted: "oklch(0.55 0.02 var(--som-theme-hue))",
    bg: "oklch(1 0 0)",
    surface: "oklch(1 0 0)",
    surfaceMuted: "oklch(0.98 0.005 var(--som-theme-hue))",
    border: "oklch(0.92 0.01 var(--som-theme-hue))",
    borderStrong: "oklch(0.8 0.01 var(--som-theme-hue))",
    success: "oklch(0.62 0.15 150)",
    danger: "oklch(0.63 0.19 35)",
    warning: "oklch(0.78 0.14 75)",
    mark: "oklch(0.96 0.05 var(--som-theme-hue))",
  },
  dark: {
    hue: "90.63",
    softBorder:
      "color-mix(in oklch, var(--som-theme-border-strong) 42%, transparent)",
    softBorderOnFill:
      "color-mix(in oklch, var(--som-theme-on-primary) 22%, transparent)",
    primary: "oklch(0.6868 0.1843 calc(var(--som-theme-hue) + 180))",
    primaryHover: "oklch(0.6 0.19 calc(var(--som-theme-hue) + 180))",
    primaryFocus:
      "oklch(0.6868 0.1843 calc(var(--som-theme-hue) + 180) / 0.5)",
    text: "oklch(0.98 0 0)",
    textHeading: "oklch(0.98 0 0)",
    textMuted: "oklch(0.75 0.002 var(--som-theme-hue))",
    bg: "oklch(0.2 0.000001 var(--som-theme-hue))",
    surface: "oklch(0.25 0.001 var(--som-theme-hue))",
    surfaceMuted: "oklch(0.23 0.001 var(--som-theme-hue))",
    border: "oklch(0.35 0.001 var(--som-theme-hue))",
    borderStrong: "oklch(0.35 0.001 var(--som-theme-hue))",
    mark: "oklch(0.3 0.05 var(--som-theme-hue))",
    success: "oklch(0.62 0.15 calc(var(--som-theme-hue)))",
    danger: "oklch(0.63 0.19 calc(var(--som-theme-hue) + 290))",
    warning: "oklch(0.78 0.14 calc(var(--som-theme-hue) + 250))",
  },
});
