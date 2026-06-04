import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

// Config dedicata ai test (senza i plugin di build come PWA).
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@vbs/shared": fileURLToPath(
        new URL("../../packages/shared/src/index.ts", import.meta.url)
      )
    }
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"]
  }
});
