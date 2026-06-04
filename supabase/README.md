# Backend Supabase — VBS Beach Volley

Il backend dell'app è **Supabase** (PostgreSQL gestito + Auth + RLS). Le regole di
business vivono in vincoli DB e funzioni SQL (`migrations/`), non in un server Node.
Vedi `PRD.md §9` per l'architettura.

## Struttura
- `migrations/20260604000001_init.sql` — schema, enum, indici, trigger auth→profilo socio.
- `migrations/20260604000002_functions.sql` — logica di business (booking atomico,
  disdetta con penale, no-show, validazione socio, edizione multipla prezzi, scadenza tessere).
- `migrations/20260604000003_rls.sql` — Row Level Security.
- `seed.sql` — 3 campi, orari 09–23, prezzi per fascia (ordinaria/prime-time).

## Sviluppo locale (Supabase CLI)
```bash
# 1. Installa la CLI: https://supabase.com/docs/guides/cli
# 2. Avvia lo stack locale (Postgres + Auth + Studio)
supabase start
# 3. Applica migrazioni + seed
supabase db reset
```
`supabase start` stampa `API URL` e `anon key`: copiali in `apps/web/.env`
(`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).

## Deploy su progetto cloud (free tier)
```bash
supabase link --project-ref <project-ref>
supabase db push          # applica le migrazioni al progetto remoto
```
Poi imposta su Cloudflare Pages le variabili `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.

## Funzioni RPC principali (chiamate dal web via `supabase.rpc`)
| Funzione | Chi | Cosa |
|----------|-----|------|
| `create_booking(p_court_id, p_start_at, p_member_id?)` | socio/staff | Prenotazione atomica con check tessera |
| `cancel_booking(p_booking_id)`   | socio/staff | Disdetta; genera charge se tardiva |
| `mark_no_show(p_booking_id)`     | staff | Segna no-show + charge |
| `validate_member(p_member_id, p_aics, p_start, p_end)` | staff | Valida socio → `VALID` |
| `bulk_update_price(p_ids[], p_price)` | staff | Edizione multipla prezzi |
| `expire_memberships()` | job | Scade le tessere (cron giornaliero) |

## Note operative
- **Keep-alive**: il free tier mette in pausa il progetto dopo 7 giorni di inattività DB.
  Pianifica un ping giornaliero (es. GitHub Action) o un cron `select expire_memberships();`.
- **Scadenza tessere**: schedula `expire_memberships()` ogni notte (pg_cron o Action).
