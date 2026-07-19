import { configure } from "som-style";

// Loads defineTheme (palette CSS + theme handles).
import "./theme.js";

configure({
  breakpoints: {
    pc: "1024px",
  },
});
