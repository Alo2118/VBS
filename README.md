# Vicenza Beach Summer — Prenotazione Campi Beach Volley

App per la gestione delle prenotazioni dei campi da beach volley dell'associazione
**Vicenza Beach Summer**. Vedi `PRD.md` (documento di sviluppo) e
`DEV_BEST_PRACTICE.md` (regole di codifica).

> **Proprietà e licenza** — App sviluppata ed è proprietà di **Alo**.
> Tutti i diritti riservati. © Vicenza Beach Summer.

## Architettura (vedi PRD §9)
- **Frontend**: PWA React + Vite + Tailwind (`apps/web`) — webapp con link **e** app installabile.
- **Backend/Dati**: **Supabase** (PostgreSQL + Auth + RLS) — regole di business in DB + funzioni
  SQL (`supabase/`). Anti-overbooking via vincolo di unicità.
- **Shared**: tipi/DTO condivisi (`packages/shared`).
- **Hosting**: Cloudflare Pages (frontend) + Supabase free tier. Costo 0.

> Lo skeleton in `apps/api` (Fastify) resta come storia ma non è il target dell'MVP.

## Requisiti
- Node.js 18+, npm 9+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (per il backend locale)

## Avvio locale
```bash
# 1. Dipendenze
npm install

# 2. Backend Supabase (Postgres + Auth + Studio) — vedi supabase/README.md
supabase start
supabase db reset           # applica migrazioni + seed (3 campi, orari, prezzi)

# 3. Configura il web: copia le chiavi stampate da `supabase start`
cp apps/web/.env.example apps/web/.env
#   -> imposta VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY

# 4. Avvia il web (PWA)
npm run dev:web
```

## Script utili
- `npm run dev:web` — avvia il frontend (Vite, porta 5173)
- `npm run build` — build di tutti i workspace
- `npm run typecheck` — type-check di tutti i workspace

## Struttura
```
apps/web            Frontend PWA (React/Vite/Tailwind)
  src/shared/api    Client Supabase + moduli di dominio (bookings, auth)
  src/shared/ui     Componenti UI centralizzati
packages/shared     Tipi/DTO condivisi
supabase            Migrazioni, funzioni di business, RLS, seed
```
