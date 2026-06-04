# PRD & Documento di Sviluppo — App Prenotazione Campi Beach Volley

Versione: 1.0
Ultimo aggiornamento: 2026-06-04
Stato: Draft per approvazione
Riferimenti: `DEV_BEST_PRACTICE.md` (regole operative vincolanti), `README.md` (avvio locale)

> Questo documento descrive **cosa** costruire e **perché**. Le regole su **come** scrivere il codice
> (architettura, Tailwind, centralizzazione, ledger, ecc.) restano in `DEV_BEST_PRACTICE.md` e sono vincolanti.

---

## 1) Obiettivo e contesto

Realizzare un'app per la gestione delle prenotazioni di **3 campi da beach volley** di un'associazione sportiva.

Vincoli funzionali chiave forniti dal committente:

1. **Slot configurabili dall'amministratore** (orari, durata, giorni di apertura, prezzi).
2. Le prenotazioni possono essere effettuate **solo da soci registrati con tesseramento valido**.
3. La prenotazione deve essere **disdetta entro il giorno prima**; in caso contrario **è dovuto il pagamento**.
4. La **UI deve essere intuitiva anche per utenti over 50** (accessibilità e semplicità prioritarie).

Lo scopo dell'MVP è eliminare la gestione manuale (telefono/WhatsApp/carta), prevenire le doppie
prenotazioni e rendere automatica l'applicazione delle regole di tesseramento e di disdetta.

### Obiettivi misurabili (success metrics)
- 0 doppie prenotazioni (overbooking) in produzione.
- ≥ 80% delle prenotazioni effettuate in autonomia dai soci (senza intervento staff).
- Riduzione no-show grazie a regola di disdetta + reminder.
- Completamento di una prenotazione in ≤ 3 tap/clic da parte di un utente over 50, senza assistenza.

### Fuori scope (per questo MVP)
- Tornei, campionati, gironi.
- Gestione bar/wallet/cassa (già previsti nel monorepo ma trattati in documenti dedicati).
- Pagamenti online automatici con gateway (vedi §6: l'addebito disdetta è registrato, l'incasso è manuale in MVP).

---

## 2) Analisi standard e best practice

Sintesi delle pratiche di settore per app di prenotazione campi sportivi e per l'accessibilità over 50,
con le scelte adottate in questo progetto.

### 2.1 Prenotazione campi sportivi (standard di settore)
- **Prevenzione doppie prenotazioni**: lo slot deve essere bloccato in modo atomico al momento della
  conferma; la disponibilità mostrata in UI non è mai la fonte di verità. → *Adottato: vincolo di unicità
  a DB + transazione atomica (vedi §7 e DEV_BEST_PRACTICE §5).*
- **Controllo concorrenza**: due soci che provano lo stesso slot nello stesso istante → solo uno vince,
  l'altro riceve un errore chiaro (`SLOT_TAKEN`). → *Adottato.*
- **Policy di cancellazione esplicite e configurabili**: finestra di disdetta gratuita definita, regole
  più severe per fasce "prime time" possibili in futuro. → *Adottato come configurazione admin.*
- **Gestione no-show e penali**: addebito di una quota in caso di mancata disdetta/mancata presentazione,
  con possibilità di esonero (es. impianto chiuso per maltempo). → *Adottato.*
- **Check-in opzionale**: rilascio dello slot se non confermato entro N minuti. → *Post-MVP.*
- **Reminder automatici**: email/SMS prima dello slot e prima della scadenza disdetta riducono i no-show.
  → *Adottato (canali già predisposti nel monorepo).*

Fonti: SuperSaaS, Allbooked, Upperhand, Sportsman Cloud (vedi §15).

### 2.2 Tesseramento (vincolo non negoziabile)
Coerente con `DEV_BEST_PRACTICE.md §6`: stato tessera `VALID/EXPIRED/SUSPENDED`, blocco prenotazioni se
non `VALID`, job giornaliero di scadenza. Il controllo è **doppio**: UX nel frontend, verità nel backend.

### 2.3 Accessibilità e usabilità per over 50 (WCAG 2.2, livello AA)
Le linee guida W3C/WAI per utenti anziani e WCAG 2.2 AA sono il riferimento. Principi adottati:

- **Contrasto elevato**: rapporto testo/sfondo ≥ 4.5:1 (WCAG 1.4.3). Evitare grigio chiaro su bianco.
- **Testo grande e ridimensionabile**: base ≥ 16px (consigliato 18px per i contenuti chiave), nessuna
  perdita di funzionalità fino al 200% di zoom.
- **Target tattili ampi**: pulsanti/aree cliccabili ≥ 44×44px (WCAG 2.5.5/2.5.8), con spaziatura
  generosa per ridurre gli errori di tocco.
- **Linguaggio semplice e concreto**: niente gergo tecnico; etichette esplicite ("Prenota", "Disdici"),
  conferme leggibili, messaggi di errore che spiegano cosa fare.
- **Flussi brevi e lineari**: una decisione per schermata, percorso "scegli giorno → scegli campo/orario
  → conferma" senza passaggi nascosti.
- **Feedback chiaro e immediato**: stato della prenotazione sempre visibile (Confermata/Disdetta), toast
  + messaggio inline, conferme prima delle azioni irreversibili.
- **Navigazione da tastiera completa** e compatibilità screen reader; focus visibile.
- **Tolleranza all'errore**: conferma esplicita prima di disdire; spiegazione dell'eventuale addebito
  PRIMA di confermare la disdetta tardiva.
- **Coerenza**: stessi pattern, stesse posizioni dei pulsanti su tutte le pagine (cfr. AppShell/Page).

Fonti: W3C WAI Older Users, WCAG 2.2, IBM/TPGi (vedi §15).

---

## 3) Attori e ruoli

| Ruolo        | Descrizione                                | Capacità principali |
|--------------|--------------------------------------------|---------------------|
| **Socio**    | Utente tesserato                           | Vede disponibilità, prenota, disdice le proprie prenotazioni, vede storico/addebiti |
| **Front desk** | Staff di reception                       | Prenota/disdice per conto dei soci, gestisce check-in, registra incassi disdetta |
| **Manager**  | Responsabile impianto                      | Tutto di Front desk + report, gestione soci, override addebiti |
| **Admin**    | Amministratore                             | Configura slot/orari/prezzi/policy, gestisce ruoli e impostazioni |

Coerente con i ruoli già definiti in `packages/shared` (`ADMIN/MANAGER/FRONT_DESK/BAR_STAFF/COACH`).

---

## 4) Requisiti funzionali

### 4.1 Configurazione slot (Admin) — RF-CFG
- RF-CFG-1: L'admin definisce gli **orari di apertura** per giorno della settimana (es. Lun–Ven 9:00–23:00).
- RF-CFG-2: L'admin definisce la **durata standard dello slot** (default 60 min, configurabile: 60/90/120).
- RF-CFG-3: L'admin definisce **per ciascuno dei 3 campi** quali slot sono disponibili (un campo può avere
  orari/chiusure diverse).
- RF-CFG-4: L'admin può creare **chiusure/eccezioni** (manutenzione, festività, maltempo) che rendono
  indisponibili slot specifici.
- RF-CFG-5: L'admin configura le **policy di prenotazione**: anticipo massimo (default 14 giorni), finestra
  di disdetta, importo penale disdetta tardiva/no-show, eventuali prezzi per fascia.
- RF-CFG-6: Le configurazioni sono versionate/audit: ogni modifica registra chi/quando/prima-dopo.

### 4.2 Disponibilità e prenotazione (Socio/Staff) — RF-BOOK
- RF-BOOK-1: Il socio vede una **griglia di disponibilità** (giorno × campo × orario) con stato chiaro:
  Libero / Occupato / Non disponibile.
- RF-BOOK-2: Il socio seleziona uno slot libero e conferma la prenotazione in un flusso a pochi passi.
- RF-BOOK-3: **Solo i soci con tessera `VALID`** possono confermare. Tessera `EXPIRED/SUSPENDED` →
  prenotazione bloccata con messaggio chiaro e indicazione su come rinnovare.
- RF-BOOK-4: La creazione è **atomica**: nessun overbooking anche con richieste concorrenti.
- RF-BOOK-5: Limiti anti-abuso configurabili (es. max N prenotazioni attive per socio) — *configurabile,
  default generoso in MVP.*
- RF-BOOK-6: Conferma con riepilogo: campo, data, ora, prezzo, **scadenza disdetta gratuita** ben evidenziata.
- RF-BOOK-7: Notifica di conferma (email/SMS secondo configurazione).

### 4.3 Disdetta e penali — RF-CANCEL
- RF-CANCEL-1: Il socio può disdire dalle proprie prenotazioni attive.
- RF-CANCEL-2: **Regola di disdetta** (requisito committente): la disdetta è gratuita se effettuata
  **entro il giorno prima** della prenotazione. Default operativo: **entro le 23:59 del giorno precedente**
  alla data dello slot. La soglia esatta è **configurabile** dall'admin (vedi §6 per il modello preciso).
- RF-CANCEL-3: Disdetta **tardiva** (oltre la soglia) o **no-show** → **è dovuto il pagamento** della quota
  configurata: si genera un **addebito (charge)** a carico del socio.
- RF-CANCEL-4: Prima di confermare una disdetta tardiva, la UI **mostra esplicitamente l'importo dovuto**
  e chiede conferma (tolleranza all'errore per over 50).
- RF-CANCEL-5: Lo staff (Manager) può **esonerare** un addebito con motivazione obbligatoria (audit log).
- RF-CANCEL-6: Notifica di disdetta e, se applicabile, dell'addebito generato.

### 4.4 Storico e addebiti (Socio) — RF-HIST
- RF-HIST-1: Il socio vede lo storico prenotazioni con stato (Confermata/Disdetta/No-show/Completata).
- RF-HIST-2: Il socio vede gli **addebiti** dovuti e il loro stato (Dovuto/Pagato/Esonerato).

### 4.5 Gestione soci (Staff/Admin) — RF-MEMBER
- RF-MEMBER-1: Anagrafica socio con campi tessera obbligatori (`aics_number`, date, stato) — cfr. shared types.
- RF-MEMBER-2: Job giornaliero che porta a `EXPIRED` le tessere scadute.
- RF-MEMBER-3: Reminder scadenza tessera (post-MVP se necessario).

---

## 5) Requisiti non funzionali

- **Affidabilità**: nessun overbooking; operazioni critiche transazionali e con audit log.
- **Accessibilità**: conformità **WCAG 2.2 livello AA** (vedi §2.3) verificata su flussi critici.
- **Sicurezza/Privacy**: dati personali e tessera trattati secondo **GDPR** (minimizzazione, base giuridica,
  diritto di cancellazione, retention definita). Password con hashing robusto, sessioni sicure, controllo
  ruoli (RBAC) su tutte le rotte. Audit log su azioni sensibili.
- **Performance**: griglia disponibilità < 1s su rete media; UI utilizzabile su smartphone datati.
- **Compatibilità**: responsive mobile-first; browser recenti (ultimi 2 anni) + fallback graceful.
- **Localizzazione**: italiano come lingua primaria; formati data/ora/€ centralizzati (`date.ts`, `money.ts`).
- **Osservabilità**: logging strutturato (già presente `logger.ts`), health check (`/health`).

---

## 6) Modello della regola di disdetta (dettaglio)

La frase "disdetta entro il giorno prima" è ambigua e va resa **deterministica**. Si definisce così:

- Ogni prenotazione ha una data/ora di inizio `start` e una **`free_cancellation_deadline`** calcolata
  alla creazione in base alla policy attiva.
- **Modello di default (consigliato, "giorno solare prima")**:
  `free_cancellation_deadline = 23:59:59 del giorno precedente a start` (fuso orario impianto, `Europe/Rome`).
  Esempio: slot di sabato alle 18:00 → disdetta gratuita fino a venerdì 23:59.
- **Modello alternativo (configurabile, "ore di anticipo")**:
  `free_cancellation_deadline = start − cancellationHours` (es. 24h). Già presente come
  `BOOKING_CANCELLATION_HOURS` nel monorepo.
- L'admin sceglie quale modello applicare (`CALENDAR_DAY_BEFORE` | `ROLLING_HOURS`).

Logica di disdetta:
1. `now <= free_cancellation_deadline` → disdetta **gratuita**, slot liberato, stato `CANCELLED`.
2. `now > free_cancellation_deadline` → disdetta **tardiva**: slot liberato, stato `CANCELLED`, viene
   generato un **charge** di importo `lateCancellationFee`.
3. Mancata presentazione senza disdetta → lo staff segna `NO_SHOW` → charge di importo `noShowFee`
   (può coincidere con `lateCancellationFee`).
4. Eccezioni d'impianto (es. maltempo, chiusura) → nessun addebito; eventuale rimborso automatico/esonero.

**Pagamento dell'addebito (MVP)**: l'addebito è registrato e tracciato (stato `DUE`). L'incasso avviene
allo sportello (contante/Satispay) o tramite wallet, con registrazione manuale dello staff. L'integrazione
con gateway di pagamento online è **post-MVP**. Coerente con DEV_BEST_PRACTICE §7–8 (ledger immutabile,
ogni movimento tracciato, storni con motivazione).

---

## 7) Modello dati (concettuale)

> Schema logico; l'implementazione DB seguirà le convenzioni del backend (migrazioni versionate).

- **Member** — `id, fullName, email?, phone?, role, aicsNumber, membershipStartDate, membershipEndDate, membershipStatus`
- **Court** — `id, name (Campo Beach 1..3), active`
- **OpeningRule** — `id, courtId?, weekday, openTime, closeTime, slotDurationMinutes, active`
  (definisce gli slot generabili; `courtId` null = vale per tutti i campi)
- **Closure** — `id, courtId?, startAt, endAt, reason` (eccezioni/manutenzione/maltempo)
- **Booking** — `id, courtId, memberId, startAt, endAt, status (CONFIRMED/CANCELLED/NO_SHOW/COMPLETED),
  price, freeCancellationDeadline, createdBy, createdAt, cancelledAt?, cancelledBy?`
  - **Vincolo di unicità**: `(courtId, startAt)` univoco tra prenotazioni attive → anti-overbooking a DB.
- **Charge** — `id, bookingId, memberId, type (LATE_CANCELLATION/NO_SHOW), amount, status (DUE/PAID/WAIVED),
  reason?, createdAt, settledAt?, settledBy?`
- **BookingPolicy** (config) — `cancellationModel, cancellationHours, maxAdvanceDays, slotDurationMinutes,
  lateCancellationFee, noShowFee, maxActiveBookingsPerMember`
- **AuditLog** — `id, actorId, action, entity, entityId, before, after, createdAt`

Note edge case da coprire:
- Slot a cavallo di mezzanotte / cambio ora legale (gestire con timezone, non con orari "naïve").
- Disdetta di slot già iniziato/passato → non consentita.
- Tessera che scade **tra** la prenotazione e lo slot: policy da decidere (vedi §13 Domande aperte).

---

## 8) API (bozza, REST)

Tutte le rotte passano dal client API centralizzato lato web; RBAC e validazione (schema) lato server.
Formato errori uniforme `{ code, message, details? }` con codici business: `MEMBERSHIP_EXPIRED`,
`SLOT_TAKEN`, `OUTSIDE_BOOKING_WINDOW`, `CANCELLATION_LATE`, `BOOKING_NOT_FOUND`.

| Metodo | Endpoint                         | Ruolo            | Descrizione |
|--------|----------------------------------|------------------|-------------|
| GET    | `/bookings/policy`               | tutti            | Policy attiva (già presente) |
| GET    | `/availability?date=&courtId=`   | Socio+           | Griglia disponibilità calcolata da OpeningRule/Closure/Booking |
| POST   | `/bookings`                      | Socio+           | Crea prenotazione (atomica; valida tessera, finestra, conflitti) |
| GET    | `/bookings/me`                   | Socio            | Prenotazioni del socio loggato |
| POST   | `/bookings/:id/cancel`           | Socio (propria)+ | Disdice; calcola gratuità o genera charge |
| POST   | `/bookings/:id/no-show`          | Front desk+      | Segna no-show e genera charge |
| GET    | `/charges/me`                    | Socio            | Addebiti del socio |
| POST   | `/charges/:id/settle`            | Front desk+      | Registra pagamento addebito |
| POST   | `/charges/:id/waive`             | Manager+         | Esonera con motivazione |
| CRUD   | `/admin/opening-rules`           | Admin            | Configura slot |
| CRUD   | `/admin/closures`                | Admin/Manager    | Chiusure/eccezioni |
| PUT    | `/admin/booking-policy`          | Admin            | Aggiorna policy |
| CRUD   | `/members`                       | Front desk+      | Gestione soci/tessere |

Lo scheletro attuale (`apps/api/src/routes/bookings.ts`) implementa già `GET /bookings/policy` e uno stub
`POST /bookings`: vanno estesi con la logica reale e le rotte sopra.

---

## 9) Architettura e stack

Aderente al monorepo esistente e a `DEV_BEST_PRACTICE.md`:

- **Backend**: Fastify (TS) — unica fonte di verità delle regole. Moduli per dominio
  (`bookings/`, `members/`, `charges/`, `config/`). Validazione schema, RBAC, audit log, transazioni.
- **Frontend**: React + Vite + Tailwind. Componenti UI centralizzati (`shared/ui`), layout unico
  (`AppShell`/`Page`), API client unico (`shared/api/client.ts`), niente regole business nel FE.
- **Shared**: tipi/DTO condivisi in `packages/shared` (estendere con `Court`, `Booking`, `Charge`, ecc.).
- **Persistenza**: introdurre un DB relazionale (es. SQLite in dev → Postgres in prod) con migrazioni.
  *(Da confermare — vedi §13.)*
- **Config**: variabili già previste in `apps/api/.env.example` (`BOOKING_CANCELLATION_HOURS`,
  `BOOKING_MAX_ADVANCE_DAYS`, `BOOKING_SLOT_DURATION_MINUTES`, notifiche, CORS).

---

## 10) UX over 50 — linee guida concrete di implementazione

Traduzione operativa della §2.3 in scelte di design system (Tailwind tokens + componenti `shared/ui`):

- **Tipografia**: base 18px sui contenuti, titoli ben distinti; line-height ≥ 1.5.
- **Colori/contrasto**: palette con contrasto AA garantito; stati colore **sempre accompagnati da testo/icona**
  (non solo colore) — es. badge "Libero/Occupato" con etichetta, non solo verde/rosso.
- **Pulsanti**: alti (≥ 48px), etichette verbali ("Prenota", "Disdici la prenotazione"), azione primaria
  evidente; pulsanti distanziati.
- **Form**: un campo per riga, label sempre visibile (no solo placeholder), messaggi di errore inline e gentili.
- **Calendario/griglia**: vista giornaliera semplice di default; navigazione "Oggi / ‹ giorno › / giorno ›";
  slot grandi e toccabili.
- **Conferme**: dialog di conferma per disdetta con riepilogo e **importo eventuale in grande**.
- **Aiuto**: testo guida breve in pagina, FAQ accessibile, contatto staff visibile.
- **Errori di rete**: stati Loading/Empty/Error coerenti e comprensibili (cfr. Page template).

Definire i token in `tailwind.config.js` (font-size, spacing, target size) così da applicare lo standard
una sola volta a tutta l'app.

---

## 11) Roadmap a fasi

**Fase 0 — Fondamenta (già parzialmente presente)**
- Monorepo, AppShell/Page, design system base, health check, config env. ✅ (skeleton esistente)
- Aggiungere DB + migrazioni + tipi shared estesi.

**Fase 1 — MVP prenotazioni**
- Configurazione slot/orari (Admin) e generazione disponibilità.
- Griglia disponibilità + creazione prenotazione atomica con check tessera.
- Disdetta con regola "giorno prima" + generazione charge tardiva/no-show.
- Storico prenotazioni e addebiti lato socio.
- Notifiche conferma/disdetta (email/SMS già predisposti).
- UI conforme WCAG 2.2 AA sui flussi critici.

**Fase 2 — Operatività staff**
- Registrazione incassi addebiti (contante/Satispay/wallet), esoneri con motivazione, audit.
- Reminder automatici (pre-slot e pre-scadenza disdetta).
- Report base (occupazione campi, no-show, incassi).

**Fase 3 — Estensioni (post-MVP)**
- Pagamento online disdetta (gateway), check-in, liste d'attesa, prenotazioni ricorrenti, prezzi per fascia.

---

## 12) Criteri di accettazione e test

Coerente con DEV_BEST_PRACTICE §10.3 (unit test su regole critiche).

- **Anti-overbooking**: due POST concorrenti sullo stesso slot → 1 successo, 1 `SLOT_TAKEN`. *(unit/integration)*
- **Tessera**: socio `EXPIRED` non può prenotare → `MEMBERSHIP_EXPIRED`. *(unit)*
- **Finestra**: prenotazione oltre `maxAdvanceDays` → `OUTSIDE_BOOKING_WINDOW`. *(unit)*
- **Disdetta gratuita**: `now <= deadline` → nessun charge, stato `CANCELLED`. *(unit, casi limite mezzanotte/DST)*
- **Disdetta tardiva**: `now > deadline` → charge `LATE_CANCELLATION` con importo corretto. *(unit)*
- **No-show**: segnalazione genera charge `NO_SHOW`. *(unit)*
- **Esonero**: richiede motivazione, scrive audit log. *(unit)*
- **Accessibilità**: flussi "prenota" e "disdici" superano audit WCAG 2.2 AA (contrasto, target, tastiera,
  screen reader), verificati con utente reale over 50. *(test manuale + automatizzato es. axe)*

---

## 13) Domande aperte (da confermare col committente)

1. **Soglia disdetta**: confermare modello di default "entro le 23:59 del giorno prima" vs "X ore prima"?
2. **Importo penale**: quanto è la quota di disdetta tardiva/no-show? È uguale al prezzo dello slot?
3. **Prezzo slot**: i campi sono gratuiti per i soci (solo penale in caso di no-show) o c'è un costo per
   prenotazione? Prezzi diversi per fascia oraria?
4. **Pagamento penale**: solo manuale allo sportello (MVP) o serve pagamento online da subito?
5. **Registrazione soci**: self-registration con validazione staff, o solo creazione da parte dello staff?
6. **Tessera che scade tra prenotazione e gioco**: si blocca alla prenotazione o anche se scade prima dello slot?
7. **Limiti**: numero massimo di prenotazioni attive per socio? Prenotazioni ricorrenti necessarie in MVP?
8. **Database**: confermare scelta (SQLite dev / Postgres prod) e hosting.

---

## 14) Coerenza con i documenti esistenti
- Le **regole di codifica** (architettura a livelli, Tailwind design system, centralizzazione API/funzioni,
  ledger immutabile, audit) sono in `DEV_BEST_PRACTICE.md` e restano vincolanti.
- Questo PRD definisce ambito, requisiti, regole di business e roadmap del **dominio prenotazioni**.
- Lo skeleton attuale (`apps/api`, `apps/web`, `packages/shared`) è il punto di partenza implementativo.

---

## 15) Fonti (best practice e accessibilità)
- W3C WAI — *Older Users and Web Accessibility*: https://www.w3.org/WAI/older-users/
- W3C WAI — *Developing Websites for Older People (WCAG)*: https://www.w3.org/WAI/older-users/developing/
- WCAG 2.2 (arc42 Quality Model overview): https://quality.arc42.org/standards/wcag-2-2
- IBM — *Accessible Design for an Aging Population*: https://www.ibm.com/think/insights/accessible-design-aging-population
- TPGi — *Preventing Ageism in Design*: https://www.tpgi.com/preventing-ageism-in-design-digital-accessibility-for-older-adults/
- SuperSaaS — *Sports Courts Booking System*: https://www.supersaas.com/info/sports-courts-booking-system
- Allbooked — *Sports field booking application guide*: https://www.allbooked.com/insights/sports-field-booking-application
- Upperhand — *Sports Court Booking App*: https://upperhand.com/court-booking-app/
- Sportsman Cloud — *Court Booking Software*: https://sportsmancloud.com/court-booking

Fine documento.
