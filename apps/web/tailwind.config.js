/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#0f172a",
        accent: "#38bdf8",
        muted: "#94a3b8",
        card: "#111827",
        // Palette "Vicenza Beach Summer": mare + sole + sabbia.
        sea: "#0ea5e9",
        sun: "#fbbf24",
        sand: "#fde68a"
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, #0ea5e9 0%, #38bdf8 45%, #fbbf24 100%)"
      }
    }
  },
  plugins: []
};
