# DEV_BEST_PRACTICE.md
Regole operative (vincolanti) per ChatGPT durante lo sviluppo dell’app Gestione Impianti Sportivi

Versione: 1.1 (ChatGPT Dev Spec)  
Ultimo aggiornamento: 2026-01-24  
Scopo: questo documento guida la generazione di codice. Ogni output deve rispettarlo.

---

## 0) Regola base di esecuzione (obbligatoria)
Quando ChatGPT scrive codice per questa app deve:
- mantenere coerenza architetturale (niente “soluzioni una tantum”)
- evitare duplicazioni (UI e logica)
- centralizzare configurazioni, componenti e funzioni condivise
- rispettare le regole di business nel backend
- produrre codice leggibile, testabile, estendibile

Se una richiesta utente confligge con queste regole, ChatGPT deve scegliere la soluzione conforme e motivare brevemente.

---

## 1) Architettura: separazione chiara dei livelli

### 1.1 Backend: unica fonte di verità
Tutte le regole di business vivono nel backend:
- tesseramento AICS (VALID/EXPIRED/SUSPENDED)
- blocco prenotazioni per tessera scaduta
- booking atomico (anti-overbooking)
- wallet con ledger (movimenti immutabili)
- vendite bar e chiusura cassa

Il frontend può prevenire e spiegare, ma NON decidere.

### 1.2 Frontend: UI consistente e minima logica
Il frontend:
- presenta dati e stati
- gestisce navigazione e form
- chiama API tramite un client centralizzato
- non contiene regole di business “vere” (solo validazioni UX)

---

## 2) Centralizzazione grafica con Tailwind (obbligatoria)

### 2.1 Tailwind come design system
- Tailwind è lo standard di stile.
- Nessun CSS “random” per pagina.
- Evitare classi ripetute ovunque: usare componenti e utility centralizzate.

### 2.2 Un solo punto di verità per tema e tokens
Centralizzare:
- `tailwind.config.*` (colors, spacing, breakpoints, typography)
- eventuale file `theme.ts` o `tokens.ts` (se serve per JS)
- definire semantic tokens (es. `bg-surface`, `text-muted`) tramite Tailwind config o classi condivise

Obiettivo: cambiare look & feel senza “cercare e sostituire” 400 classi.

### 2.3 Componenti UI riutilizzabili
Creare una libreria interna (minima) di componenti:
- Button (varianti: primary/secondary/danger/ghost, sizes)
- Input, Select, DatePicker wrapper
- Modal/Drawer
- Badge/StatusPill (VALID/EXPIRED, CONFIRMED/CANCELLED…)
- Card, Table, EmptyState
- Toast/Notification

Nessuna pagina deve “inventarsi” uno stile diverso per:
- bottoni
- form
- tabella
- alert

### 2.4 Class composition standard
Usare un helper per gestire classi Tailwind:
- `clsx` + `tailwind-merge` (o equivalente)
- Pattern: `cn()` in `src/shared/ui/cn.ts`

Niente concatenazioni manuali infinite.

---

## 3) Template e stile coerenti tra le pagine (obbligatorio)

### 3.1 Layout unico
Tutte le pagine usano lo stesso layout (a seconda del ruolo):
- `AppShell` (sidebar/header)
- `Page` wrapper con:
  - title
  - breadcrumbs (opzionale)
  - actions slot (pulsanti in alto a destra)
  - content container coerente (max width/padding)

### 3.2 Page template standard
Ogni pagina segue questo schema:
- Header (titolo + azioni)
- Filtri/toolbar (se presente)
- Contenuto principale (table/calendar/form)
- Footer informativo (se serve)
- Stati gestiti in modo coerente:
  - Loading
  - Empty
  - Error

No layout “speciali” senza motivo.

### 3.3 Navigazione coerente
- naming e routing coerenti (`/bookings`, `/members`, `/bar`, `/cash-shifts`, `/settings`)
- guardie di accesso per ruolo
- fallback di errore e 404 coerenti

---

## 4) Centralizzazione funzioni (obbligatoria)

### 4.1 API client unico
Tutte le chiamate API passano da un client centralizzato:
- gestione base URL
- auth headers
- refresh/retry (se previsto)
- mapping errori standard (es. 401, 403, 422, 500)

Mai fare `fetch()` direttamente nelle pagine.

### 4.2 Funzioni di dominio in moduli dedicati
Creare moduli per dominio:
- `bookings/` (API + types + hooks + utils)
- `members/`
- `bar/`
- `wallet/`
- `auth/`

Regola: logiche ripetute vanno in `utils` del dominio o in `shared/`.

### 4.3 Validazioni centralizzate
- Validazioni form: schema (es. Zod/Yup) centralizzato per feature
- Messaggi errore coerenti
- Data parsing e formatting centralizzati (`date.ts`, `money.ts`)

### 4.4 Error handling uniforme
- Un solo sistema per mostrare errori (toast + inline)
- Un solo formato per errori backend (es. `code`, `message`, `details`)
- Mappatura errori business: es. `MEMBERSHIP_EXPIRED`, `SLOT_TAKEN`

---

## 5) Booking: affidabilità prima di tutto

- Prenotazione = transazione atomica lato backend
- Lock dello slot durante la creazione
- Stati chiari: CONFIRMED/CANCELLED/NO_SHOW/COMPLETED
- Audit log per tutte le modifiche (chi/cosa/quando/prima-dopo)

Mai:
- fidarsi della UI per la disponibilità
- fare update “alla cieca” senza re-check

---

## 6) Tesseramento AICS: hard constraint (non negoziabile)

Campi obbligatori per iscritto:
- `aics_number`
- `membership_start_date`
- `membership_end_date`
- `membership_status` (VALID/EXPIRED/SUSPENDED)

Regola: `EXPIRED` => non può prenotare campi.
- controllo frontend: UX
- controllo backend: verità

Automazione:
- job giornaliero che scade le tessere
- reminder scadenza (post-MVP se serve)

---

## 7) Wallet: ledger immutabile (soldi veri, niente magia)

- Il saldo non si salva: si calcola dalla somma movimenti
- Movimenti immutabili: TOP_UP/PURCHASE/REFUND/ADJUSTMENT
- Niente saldo negativo (a meno di requisito esplicito futuro)

Ogni movimento deve avere:
- riferimento (sale/booking/manual)
- operatore
- timestamp
- motivo per adjustment/refund

---

## 8) Pagamenti: contante, Satispay, wallet

MVP:
- Contante: registrazione manuale
- Satispay: registrazione manuale (no API iniziale)
- Wallet: decremento via ledger

Regola:
- ogni `Sale` ha almeno un `Payment` tracciato
- storni con motivazione obbligatoria
- audit log su operazioni critiche

---

## 9) Cassa bar: turni e riconciliazione

- Apertura turno: fondo iniziale + operatore
- Chiusura turno: conteggio + differenze
- Report turni (CSV/PDF post-MVP)

Mai:
- cancellare vendite senza trace
- modificare importi storici

---

## 10) Convenzioni di codice (per ChatGPT)

### 10.1 Stile
- Nomi espliciti, niente abbreviazioni ambigue
- Funzioni piccole, testabili
- Nessuna duplicazione: DRY “con giudizio”
- Commenti solo dove serve spiegare il “perché”, non il “cosa”

### 10.2 Tipi e contratti
- Types/DTO condivisi e versionati per API
- Non “any”
- Date e money sempre gestiti con utility centralizzate

### 10.3 Test minimi raccomandati
- Backend: unit test su regole tesseramento + booking anti-overlap + wallet ledger
- Frontend: test componenti chiave e flussi critici (almeno smoke)

---

## 11) Output standard quando ChatGPT genera codice
Ogni risposta di ChatGPT che contiene implementazione deve includere:
- dove mettere i file (path)
- cosa aggiungere/modificare (lista)
- eventuali migrazioni DB (se backend)
- note su edge cases coperti
- nessun codice duplicato tra pagine

---

## 12) Regola finale anti-disastro
Se una soluzione sembra “più veloce” ma introduce:
- duplicazione
- stile incoerente
- regole business nel frontend
- soldi non tracciabili

Allora è scartata. Anche se “funziona”.

Fine documento.
