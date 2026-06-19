import React from "react";
import ReactDOM from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "@/app/App";
import "@/app/styles.css";

// Registra il service worker: abilita le notifiche push (push.ts attende
// `navigator.serviceWorker.ready`) e, con registerType "autoUpdate", aggiorna
// la app all'ultima versione senza dover chiudere e riaprire manualmente.
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
