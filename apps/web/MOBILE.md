# App per cellulare (Android)

L'app è una **PWA** (installabile dal browser) ed è anche impacchettabile come
**APK Android** tramite [Capacitor](https://capacitorjs.com/). La web app gira
dentro un'app nativa; i dati arrivano comunque da Supabase via rete.

## Opzione 1 — Installare la PWA (nessun file, più semplice)

Apri il sito dell'app dal telefono e:

- **Android (Chrome):** menù ⋮ → _Aggiungi a schermata Home_ / _Installa app_.
- **iPhone (Safari):** _Condividi_ → _Aggiungi alla schermata Home_.

Parte a tutto schermo come un'app normale. Su iPhone questa è l'unica via
(Apple non consente APK).

## Opzione 2 — Generare l'APK in automatico (consigliata)

Un workflow GitHub Actions compila l'APK nel cloud e te lo consegna pronto.

1. Imposta i secret del repo (una volta sola):
   **Settings → Secrets and variables → Actions**
   - `VITE_SUPABASE_URL` — URL del progetto Supabase
   - `VITE_SUPABASE_ANON_KEY` — chiave anon (pubblica) di Supabase
2. Vai su **Actions → Build APK Android → Run workflow** (oppure crea un tag `v*`).
3. A fine build scarica l'artifact **`vbs-android-debug`**: dentro c'è
   `app-debug.apk`.
4. Copia l'APK sul telefono e installalo (Android: consenti _origini sconosciute_).

> È un APK di **debug**, perfetto per uso interno/test. Per la distribuzione
> ampia o il Play Store serve un APK/AAB **firmato** con un keystore dedicato.

## Opzione 3 — Compilare l'APK in locale

Serve la toolchain Android (Android Studio o command-line tools, JDK 21).

```bash
cd apps/web
# build web + sync + APK di debug
npm run android:apk
# APK: apps/web/android/app/build/outputs/apk/debug/app-debug.apk
```

Per aprire il progetto in Android Studio: `npm run android:open`.

## Personalizzazioni utili

- **Nome/ID app:** `apps/web/capacitor.config.ts`
  (`appName`, `appId` = `it.vicenzabeachsummer.app`).
- **Versione:** `apps/web/android/app/build.gradle` (`versionCode`, `versionName`).
- **Icona/splash:** generabili da un'immagine 1024×1024 con
  `npx @capacitor/assets generate --android`.
