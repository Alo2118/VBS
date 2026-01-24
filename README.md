# VBS Gestione Impianti Sportivi

Monorepo con API Fastify + Web React/Vite per la gestione di campi beach, membri, bar e wallet.

## Requisiti
- Node.js 18+
- npm 9+

## Avvio locale

### 1. Installa dipendenze
```bash
npm install
```

### 2. Avvia API
```bash
npm run dev:api
```

### 3. Avvia Web
```bash
npm run dev:web
```

## Configurazioni principali
Copia i file `.env.example` nei rispettivi workspace:

```
apps/api/.env.example -> apps/api/.env
apps/web/.env.example -> apps/web/.env
```

### Variabili API
- `BOOKING_CANCELLATION_HOURS`: ore minime per cancellare (default 24)
- `BOOKING_MAX_ADVANCE_DAYS`: giorni massimi di anticipo (default 14)
- `BOOKING_SLOT_DURATION_MINUTES`: durata slot (default 60)
- `NOTIFICATIONS_EMAIL_ENABLED`: abilita email (default true)
- `NOTIFICATIONS_SMS_ENABLED`: abilita SMS (default true)
- `WEB_ORIGIN`: origin consentito per CORS

### Variabili Web
- `VITE_API_URL`: base URL API (default http://localhost:3001)

## Script utili
- `npm run dev:api`: avvia API Fastify
- `npm run dev:web`: avvia UI React/Vite

