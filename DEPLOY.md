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
esegui nello SQL Editor le **migrazioni più recenti** che non hai ancora applicato:
- [`supabase/migrations/20260604000007_enhancements.sql`](supabase/migrations/20260604000007_enhancements.sql)
  (telefono in registrazione, vista settimanale, riepilogo staff)
- [`supabase/migrations/20260604000008_roster_recurring.sql`](supabase/migrations/20260604000008_roster_recurring.sql)
  (campi Giallo/Bianco/Verde, rosa giocatori, costo diviso, prenotazioni fisse)
- [`supabase/migrations/20260604000009_branding_nickname.sql`](supabase/migrations/20260604000009_branding_nickname.sql)
  (soprannome socio per distinguere gli omonimi)
- [`supabase/migrations/20260604000010_staff_corrections.sql`](supabase/migrations/20260604000010_staff_corrections.sql)
  (annulla no-show, libera campo con/senza penale)
- [`supabase/migrations/20260604000011_same_day_free_cancel.sql`](supabase/migrations/20260604000011_same_day_free_cancel.sql)
  (disdetta gratuita in giornata — sostituita dalla 012)
- [`supabase/migrations/20260604000012_cancellation_grace.sql`](supabase/migrations/20260604000012_cancellation_grace.sql)
  (finestra di tolleranza disdetta dalla prenotazione, configurabile)
- [`supabase/migrations/20260604000013_cancellation_notifications.sql`](supabase/migrations/20260604000013_cancellation_notifications.sql)
  (annullamento campi in blocco per chiusura + notifiche/avvisi ai giocatori)
- [`supabase/migrations/20260604000014_new_member_notification.sql`](supabase/migrations/20260604000014_new_member_notification.sql)
  (avviso allo staff all'arrivo di una nuova richiesta di registrazione)
- [`supabase/migrations/20260604000015_self_cancel_notice.sql`](supabase/migrations/20260604000015_self_cancel_notice.sql)
  (la disdetta del socio avvisa gli altri giocatori della rosa)
- [`supabase/migrations/20260604000016_more_notifications.sql`](supabase/migrations/20260604000016_more_notifications.sql)
  (avvisi: socio approvato, aggiunto alla rosa, nuovo addebito + funzione promemoria)
- …migrazioni 017–022 (conto/ledger, quota campo, prodotti, vendita bar)…
- [`supabase/migrations/20260604000023_fix_members_update_policy.sql`](supabase/migrations/20260604000023_fix_members_update_policy.sql)
  (sicurezza: blocca la modifica diretta dei soci — niente auto-promozione di ruolo)
- [`supabase/migrations/20260604000024_booking_overlap_and_locks.sql`](supabase/migrations/20260604000024_booking_overlap_and_locks.sql)
  (anti-overbooking sugli intervalli orari + lock di riga su disdette/no-show/quota campo)
  ⚠️ Se nel DB esistono già prenotazioni **confermate sovrapposte**, la creazione
  del vincolo fallisce: risolvi prima le sovrapposizioni, poi riesegui.

Sono sicure da rieseguire (idempotenti). In alternativa puoi reincollare tutto
`setup_all.sql`: ricrea funzioni e policy senza perdere i dati esistenti.

## Notifiche push sul telefono (annullamento campi)
Quando lo staff annulla un campo (singolo dalla pagina **Presenze**, o in blocco
da una **chiusura** in Orari → "Annulla prenotazioni e avvisa") l'app scrive un
avviso per ogni giocatore. Gli avvisi compaiono subito nella **campanella 🔔**;
per riceverli anche come **notifica sul telefono ad app chiusa** serve attivare
il Web Push una volta sola:

1. **Genera le chiavi VAPID** (una tantum):
   ```bash
   npx web-push generate-vapid-keys
   ```
   Ottieni una *Public Key* e una *Private Key*.
2. **Frontend**: imposta `VITE_VAPID_PUBLIC_KEY=<public key>` tra le variabili di
   build (GitHub Actions / hosting) e ricompila. Senza questa, la campanella
   funziona ma l'opzione "Attiva avvisi sul telefono" resta nascosta.
3. **Edge Function**: imposta i segreti e fai il deploy della funzione
   [`supabase/functions/send-push`](supabase/functions/send-push/index.ts).
   La funzione usa la *service role* (bypassa RLS), quindi è protetta da un
   **secret condiviso obbligatorio** `PUSH_WEBHOOK_SECRET`: senza header valido
   ogni chiamata è rifiutata (401). Genera un valore casuale lungo (es.
   `openssl rand -hex 32`).
   ```bash
   supabase secrets set \
     VAPID_PUBLIC_KEY=<public> VAPID_PRIVATE_KEY=<private> \
     VAPID_SUBJECT=mailto:info@tuodominio.it \
     PUSH_WEBHOOK_SECRET=<valore-casuale-lungo>
   supabase functions deploy send-push --no-verify-jwt
   ```
   (`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` sono già forniti al runtime.
   `--no-verify-jwt` è voluto: l'autorizzazione passa dal secret, non da un JWT
   utente, perché il chiamante è il webhook/cron, non un socio.)
4. **Collega la coda alla funzione** — scegli un metodo. In entrambi i casi
   aggiungi l'header HTTP `x-webhook-secret: <PUSH_WEBHOOK_SECRET>`:
   - **Database Webhook** (consigliato, invio istantaneo): in Supabase →
     Database → Webhooks, crea un webhook su `INSERT` della tabella
     `public.notifications` che chiama la Edge Function `send-push`; nella
     sezione *HTTP Headers* aggiungi `x-webhook-secret` con il valore del secret.
   - **Oppure pg_cron** (polling): pianifica una chiamata periodica a
     `send-push` senza body (passando lo stesso header); drena tutte le
     notifiche con `sent_at IS NULL`.
### Promemoria partita (pg_cron)
Per il promemoria automatico qualche ora prima dello slot, abilita pg_cron e
pianifica la funzione `enqueue_match_reminders` (idempotente, niente duplicati):
```sql
create extension if not exists pg_cron;
select cron.schedule('vbs-match-reminders', '*/15 * * * *',
                     'select enqueue_match_reminders(3)');  -- finestra 3 ore
```
Gli altri avvisi (registrazione, approvazione, rosa, addebiti, disdette) sono
trigger/funzioni: non richiedono scheduler.

5. **Sul telefono**: il socio apre l'app, tocca la 🔔 e "Attiva avvisi sul
   telefono". Su iPhone serve prima "Aggiungi a Home" (PWA installata, iOS 16.4+);
   su Android funziona anche dal browser.

## Verifica delle regole (facoltativa, richiede Postgres 16 locale)
```bash
npm run db:test    # applica migrazioni su un Postgres temporaneo ed esegue gli scenari
```
