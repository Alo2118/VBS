# Deploy della PWA su GitHub Pages + Supabase (gratis)

Obiettivo: ottenere un **link** all'app, installabile come PWA, con backend Supabase.
La PWA viene pubblicata da GitHub Pages tramite GitHub Actions; il backend è un
progetto Supabase gratuito.

## 1) Crea il progetto Supabase (backend)
1. Vai su https://supabase.com → **New project** (piano Free).
2. Apri **SQL Editor** → **New query** → incolla il contenuto di
   [`supabase/setup_all.sql`](supabase/setup_all.sql) → **Run**.
   (crea tabelle, funzioni, RLS, trigger e i dati iniziali: 3 campi, orari, prezzi)
   - In alternativa con la CLI: `supabase link --project-ref <ref>` poi `supabase db push`.
3. Recupera le credenziali (la dashboard Supabase è cambiata di recente):
   - **Modo rapido**: pulsante verde **Connect** in alto → scheda **App Frameworks** →
     copia **Project URL** (`VITE_SUPABASE_URL`) e **anon/publishable key**
     (`VITE_SUPABASE_ANON_KEY`).
   - **Dal menu**: ingranaggio **Settings** → **Data API** (Project URL) e **API Keys**
     (usa la **Publishable key** `sb_publishable_...`, oppure la **anon public** legacy
     `eyJ...`). Sono chiavi pubbliche: stanno nel browser, protette dalla RLS.
   - Per il secret opzionale `SUPABASE_SERVICE_ROLE_KEY` usa la **service_role**
     (legacy) o una **Secret key** nuova: solo nei secret di GitHub, mai nel frontend.
4. In **Authentication → Providers → Email**: tieni attivo l'accesso con email/password.
   Per i test, disattiva la conferma email (**Confirm email** = off).

## 2) Configura GitHub Pages
1. Nel repo: **Settings → Secrets and variables → Actions → New repository secret**:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public key
   - (facoltativo) `SUPABASE_SERVICE_ROLE_KEY` = *service_role key* (per la
     manutenzione giornaliera: scadenza tessere + keep-alive del progetto free).
2. **Settings → Pages → Build and deployment → Source** = **GitHub Actions**.
3. Il workflow [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
   parte a ogni push (o avvialo a mano da **Actions → Deploy PWA su GitHub Pages → Run workflow**).
4. A fine run, il link è in **Settings → Pages** (di norma
   `https://<utente>.github.io/<repo>/`).

> Nota: GitHub Pages gratuito richiede repo **pubblico** (oppure GitHub Pro per repo privati).
> In alternativa, Cloudflare Pages funziona gratis anche con repo privati (imposta gli stessi
> due secret e `VITE_BASE=/`).

## 3) Primo accesso e primo amministratore
1. Apri il link, **Registrati** (l'account nasce in stato `PENDING`).
2. In Supabase **SQL Editor**, promuovi te stesso ad admin con tessera valida:
   ```sql
   update members set role = 'ADMIN', membership_status = 'VALID'
   where email = 'tua@email.it';
   ```
3. Ricarica l'app: ora vedi le sezioni staff (Soci, Orari, Tariffe, Presenze, Addebiti)
   e puoi prenotare. Gli altri soci che si registrano li validi tu dalla sezione **Soci**.

## Aggiornare un database già configurato
Se hai già eseguito `setup_all.sql` in passato, per le nuove funzionalità
(telefono in registrazione, vista settimanale, riepilogo staff) ti basta
eseguire **solo l'ultima migrazione** nello SQL Editor:
[`supabase/migrations/20260604000007_enhancements.sql`](supabase/migrations/20260604000007_enhancements.sql).
È sicura da rieseguire (idempotente). In alternativa puoi reincollare tutto
`setup_all.sql`: ricrea funzioni e policy senza perdere i dati esistenti.

## Verifica delle regole (facoltativa, richiede Postgres 16 locale)
```bash
npm run db:test    # applica migrazioni su un Postgres temporaneo ed esegue gli scenari
```
