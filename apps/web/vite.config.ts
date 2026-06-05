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
      // SW personalizzato (injectManifest) per gestire le notifiche push,
      // mantenendo il precache di Workbox per l'uso offline.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"]
      },
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Vicenza Beach Summer — Prenotazione Campi",
        short_name: "Beach Summer",
        description: "Vicenza Beach Summer — prenota i campi da beach volley dell'associazione.",
        lang: "it",
        id: base,
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#0f172a",
        theme_color: "#0f172a",
        icons: [
          { src: "pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml" }
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
