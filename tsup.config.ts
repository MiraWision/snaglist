import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  // Keep runtime deps external so html-to-image stays a lazily-imported chunk
  // and jszip is not bundled into consumers that never use DownloadConnector.
  external: ["html-to-image", "jszip"],
  target: "es2022",
});
