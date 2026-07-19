# Agent notes (som-style)

- Use `style({ base, pc })` or app `som-style/preset`.
- Page styles: put them anywhere you like; `style.js` in scaffold is only an example.
- To change a few properties, use `handle.extend({ base: { ... } })`.
- Call `style` / `.extend` only at module top level, not inside render.
- All theme tokens: app `som-style/theme.js` (`defineTheme` light/dark → `--som-theme-*`, `theme.*`).
- Spacing: `constant.js` rem. No package CSS/token black box — `src/` is logic only.
- Prefer OKLCH string literals over hex for palette colors.
