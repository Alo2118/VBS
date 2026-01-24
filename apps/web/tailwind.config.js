/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: "#0f172a",
        accent: "#38bdf8",
        muted: "#94a3b8",
        card: "#111827"
      }
    }
  },
  plugins: []
};
