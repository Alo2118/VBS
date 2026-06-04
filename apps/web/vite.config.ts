import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Base path configurabile (per GitHub Pages "project page" serve "/<repo>/").
// Default "/" per dev e hosting su dominio dedicato (es. Cloudflare Pages).
const base = process.env.VITE_BASE ?? "/";

// Alias allineati ai path TS (@/* e @vbs/shared) così Vite risolve come tsc.
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "VBS — Prenotazione Campi Beach Volley",
        short_name: "VBS Beach",
        description: "Prenota i campi da beach volley del tuo circolo.",
        lang: "it",
        id: base,
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#0f172a",
        theme_color: "#0f172a",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable"
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@vbs/shared": fileURLToPath(
        new URL("../../packages/shared/src/index.ts", import.meta.url)
      )
    }
  },
  server: {
    port: 5173
  }
});
