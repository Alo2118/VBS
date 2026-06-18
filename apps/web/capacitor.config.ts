import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Configurazione Capacitor: impacchetta la web app (cartella `dist`) in un'app
 * Android nativa. Gli asset sono inclusi nell'APK; i dati arrivano comunque da
 * Supabase via rete, come nella PWA. L'APK si compila in CI (vedi
 * .github/workflows/build-android.yml) dove l'Android SDK è disponibile.
 */
const config: CapacitorConfig = {
  appId: "it.vicenzabeachsummer.app",
  appName: "Vicenza Beach Summer",
  webDir: "dist",
  backgroundColor: "#fbf6ec"
};

export default config;
