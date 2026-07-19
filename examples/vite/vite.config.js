import { defineConfig } from "vite";
import { somStyle } from "som-style/vite";

export default defineConfig({
  plugins: [somStyle()],
});
