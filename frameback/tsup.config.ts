import { defineConfig } from "tsup";

export default defineConfig({
  entry: { "cli/index": "src/cli/index.ts" },
  format: ["esm"],
  target: "node20",
  platform: "node",
  outDir: "dist",
  clean: false,
  sourcemap: false,
  splitting: false,
  banner: { js: "#!/usr/bin/env node" },
});
