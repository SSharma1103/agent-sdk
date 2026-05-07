import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "examples/dev-ui/web",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
