/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Tema chiaro "balneare" (coerente col logo navy).
        surface: "#fdf6ea", // sfondo app (sabbia chiarissima)
        card: "#ffffff", // contenitori
        ink: "#15233f", // testo principale (navy)
        muted: "#64748b", // testo secondario
        line: "#ece5d6", // bordi morbidi
        accent: "#0284c7", // accento (mare, contrasto su bianco)
        "accent-soft": "#e6f4fd",
        navy: "#233258", // colore profondo del brand (logo)
        // Palette "Vicenza Beach Summer": mare + sole + sabbia.
        sea: "#0ea5e9",
        "sea-deep": "#0284c7",
        sun: "#f59e0b",
        "sun-soft": "#fde68a",
        sand: "#fbe9c2"
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #0ea5e9 0%, #38bdf8 45%, #f59e0b 115%)",
        "sand-fade": "linear-gradient(180deg, #fffaf0 0%, #fdf6ea 100%)"
      },
      boxShadow: {
        soft: "0 6px 18px rgba(21, 35, 63, 0.06)",
        hero: "0 8px 24px rgba(14, 165, 233, 0.25)"
      }
    }
  },
  plugins: []
};
