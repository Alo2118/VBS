/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Tema chiaro "balneare" (coerente col logo navy).
        surface: "#fbf6ec", // sfondo app (sabbia chiarissima)
        card: "#ffffff", // contenitori
        ink: "#13213c", // testo principale (navy profondo)
        muted: "#6b7689", // testo secondario
        line: "#ece4d3", // bordi morbidi
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
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif"
        ]
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #0ea5e9 0%, #38bdf8 45%, #f59e0b 115%)",
        "brand-gradient-strong": "linear-gradient(135deg, #0284c7 0%, #0ea5e9 50%, #f59e0b 130%)",
        "sand-fade": "linear-gradient(180deg, #fffaf0 0%, #fbf6ec 100%)",
        "sun-gradient": "linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)",
        "card-sheen": "linear-gradient(160deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0.55) 100%)"
      },
      boxShadow: {
        soft: "0 6px 18px rgba(21, 35, 63, 0.06)",
        card: "0 1px 2px rgba(21, 35, 63, 0.04), 0 10px 30px -12px rgba(21, 35, 63, 0.18)",
        lift: "0 10px 20px rgba(21, 35, 63, 0.08), 0 24px 48px -20px rgba(14, 165, 233, 0.35)",
        hero: "0 12px 32px -8px rgba(14, 165, 233, 0.45)",
        glow: "0 0 0 1px rgba(255,255,255,0.5) inset, 0 8px 24px -8px rgba(14,165,233,0.5)"
      },
      borderRadius: {
        "2.5xl": "1.25rem",
        "3xl": "1.5rem"
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" }
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "translateY(12px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" }
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-14px)" }
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" }
        }
      },
      animation: {
        "fade-up": "fade-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 0.3s ease-out both",
        "scale-in": "scale-in 0.28s cubic-bezier(0.22, 1, 0.36, 1) both",
        float: "float 9s ease-in-out infinite",
        "float-slow": "float 13s ease-in-out infinite"
      }
    }
  },
  plugins: []
};
