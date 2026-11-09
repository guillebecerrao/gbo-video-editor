import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const api = process.env.FRAMEBACK_API ?? "http://127.0.0.1:4747";

export default defineConfig({
  root: here,
  plugins: [react()],
  resolve: { alias: { "@core": path.resolve(here, "../src/core") } },
  build: { outDir: path.resolve(here, "../dist/web"), emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/api": api, "/media": api },
  },
});
