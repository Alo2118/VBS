import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": resolve(fileURLToPath(new URL(".", import.meta.url)), "src")
    }
  },
  server: {
    port: 5173
  }
});
