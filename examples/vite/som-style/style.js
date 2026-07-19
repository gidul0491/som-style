import { style } from "som-style";
import { theme } from "./theme.js";
import { space, custom } from "./constant.js";

/** Demo page styles for examples/vite — not a required som-style layout. */

export const app = style({
  base: {
    "min-height": "100vh",
    display: "flex",
    "flex-direction": "column",
    color: theme.text,
    "font-family": "'Source Sans 3', 'Segoe UI', sans-serif",
    background: `
      radial-gradient(
        1200px 600px at 12% -10%,
        color-mix(in oklch, ${theme.primary} 18%, transparent),
        transparent 60%
      ),
      radial-gradient(
        900px 500px at 90% 0%,
        color-mix(in oklch, ${theme.mark} 45%, transparent),
        transparent 55%
      ),
      ${theme.bg}
    `,
  },
});

export const hero = style({
  base: {
    "padding-top": "3.5rem",
    "padding-bottom": "2rem",
  },
  pc: {
    "padding-top": "5.5rem",
    "padding-bottom": "3rem",
  },
});

export const brand = style({
  base: {
    margin: "0 0 1.25rem",
    "font-family": "Fraunces, Georgia, serif",
    "font-size": "3.2rem",
    "line-height": "0.95",
    "letter-spacing": "-0.04em",
    "font-weight": "650",
    color: theme.textHeading,
  },
  pc: {
    "font-size": "5rem",
  },
});

export const sectionTitle = style({
  base: {
    margin: "0",
    "font-family": "Fraunces, Georgia, serif",
    "font-size": "1.55rem",
    "line-height": "1.15",
    "font-weight": "600",
    "letter-spacing": "-0.03em",
    color: theme.textHeading,
  },
});

export const grid = style({
  base: {
    display: "grid",
    gap: "1rem",
    "min-width": "0",
  },
  pc: {
    "grid-template-columns": "1.2fr 0.8fr",
    gap: "1.25rem",
    "align-items": "start",
  },
});

export const field = style({
  base: {
    display: "flex",
    "flex-direction": "column",
    "min-width": "0",
    width: "100%",
  },
});

export const footer = style({
  base: {
    "margin-top": "auto",
    padding: "2rem 0 2.5rem",
  },
});

export const inset = style({
  base: {
    position: "relative",
    width: "86%",
    margin: "0 auto",
    padding: "0.9rem 1rem",
    "box-sizing": "border-box",
  },
});

export const frostCompare = style({
  base: {
    position: "relative",
    "min-width": "0",
    padding: "1.75rem 0",
    background: theme.bg,
  },
});

export const frostTint = style({
  base: {
    position: "absolute",
    top: "0",
    bottom: "0",
    left: "0",
    width: "50%",
    "box-sizing": "border-box",
  },
});

export const flush = style({
  base: {
    margin: "0",
  },
});

export const customDemo = style({
  base: {
    display: "flex",
    "flex-direction": "column",
    gap: space.s9,
    padding: custom.customSize,
    "border-radius": "0.65rem",
    border: `1px solid ${theme.border}`,
    "box-shadow":
      "0 1px 0 var(--som-theme-edge-shine) inset, 0 -1px 0 var(--som-theme-edge-shade) inset",
    background: `color-mix(in oklch, ${theme.warning} 28%, ${theme.surface})`,
    color: theme.text,
  },
});

export const customChip = style({
  base: {
    display: "inline-flex",
    "align-items": "center",
    padding: "0.35rem 0.8rem",
    "border-radius": "9999px",
    background: custom.customColor,
    color: theme.onPrimary,
    "font-size": "0.85rem",
    "font-weight": "600",
    width: "fit-content",
  },
});
