-- VBS — Setup completo del database (generato da migrations/*.sql + seed.sql).
-- Incolla questo file nello SQL Editor di Supabase (Run) per creare tutto in una volta.
-- Rigenera con: bash supabase/tests/build_setup.sh

-- ============================================================
-- 20260604000001_init.sql
-- ============================================================
-- VBS — Schema iniziale prenotazioni campi beach volley.
-- Backend = unica fonte di verità (DEV_BEST_PRACTICE §1). Le regole di business
-- vivono in vincoli DB + funzioni (vedi 20260604000003_functions.sql).

-- Estensioni -----------------------------------------------------------------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- Enum -----------------------------------------------------------------------
create type membership_status as enum ('PENDING', 'VALID', 'EXPIRED', 'SUSPENDED');
create type booking_status   as enum ('CONFIRMED', 'CANCELLED', 'NO_SHOW', 'COMPLETED');
create type charge_type      as enum ('LATE_CANCELLATION', 'NO_SHOW');
create type charge_status    as enum ('DUE', 'PAID', 'WAIVED');
create type app_role         as enum ('ADMIN', 'MANAGER', 'FRONT_DESK', 'BAR_STAFF', 'COACH', 'MEMBER');
create type cancellation_model as enum ('CALENDAR_DAY_BEFORE', 'ROLLING_HOURS');

-- Soci / utenti --------------------------------------------------------------
-- members.id coincide con auth.users.id: ogni account ha un profilo socio.
create table members (
  id                    uuid primary key references auth.users (id) on delete cascade,
  full_name             text not null default '',
  email                 text,
  phone                 text,
  role                  app_role not null default 'MEMBER',
  aics_number           text,
  membership_start_date date,
  membership_end_date   date,
  membership_status     membership_status not null default 'PENDING',
  validated_by          uuid references members (id),
  validated_at          timestamptz,
  created_at            timestamptz not null default now()
);

-- Campi ----------------------------------------------------------------------
create table courts (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Regole di apertura (generano gli slot prenotabili) -------------------------
-- court_id null = vale per tutti i campi. weekday: 0=domenica … 6=sabato.
create table opening_rules (
  id                     uuid primary key default gen_random_uuid(),
  court_id               uuid references courts (id) on delete cascade,
  weekday                smallint not null check (weekday between 0 and 6),
  open_time              time not null,
  close_time             time not null,
  slot_duration_minutes  smallint not null default 60 check (slot_duration_minutes > 0),
  active                 boolean not null default true,
  check (close_time > open_time)
);

-- Prezzi per fascia oraria (RF-CFG-6) ----------------------------------------
-- Il prezzo dello slot è sia costo prenotazione sia importo penale (§6).
create table price_rules (
  id         uuid primary key default gen_random_uuid(),
  court_id   uuid references courts (id) on delete cascade,
  weekday    smallint check (weekday between 0 and 6),
  start_time time not null,
  end_time   time not null,
  price      numeric(10, 2) not null check (price >= 0),
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

-- Chiusure / eccezioni (manutenzione, festività, maltempo) -------------------
create table closures (
  id         uuid primary key default gen_random_uuid(),
  court_id   uuid references courts (id) on delete cascade,
  start_at   timestamptz not null,
  end_at     timestamptz not null,
  reason     text,
  created_at timestamptz not null default now(),
  check (end_at > start_at)
);

-- Prenotazioni ---------------------------------------------------------------
create table bookings (
  id                         uuid primary key default gen_random_uuid(),
  court_id                   uuid not null references courts (id),
  member_id                  uuid not null references members (id),
  start_at                   timestamptz not null,
  end_at                     timestamptz not null,
  status                     booking_status not null default 'CONFIRMED',
  price                      numeric(10, 2) not null default 0,
  free_cancellation_deadline timestamptz not null,
  created_by                 uuid references members (id),
  created_at                 timestamptz not null default now(),
  cancelled_at               timestamptz,
  cancelled_by               uuid references members (id),
  check (end_at > start_at)
);

-- Anti-overbooking: uno slot attivo per campo (DEV_BEST_PRACTICE §5).
create unique index bookings_active_slot_uidx
  on bookings (court_id, start_at)
  where status = 'CONFIRMED';

create index bookings_member_idx on bookings (member_id);
create index bookings_start_idx  on bookings (start_at);

-- Addebiti (penale = prezzo del campo, §6) -----------------------------------
create table charges (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings (id),
  member_id  uuid not null references members (id),
  type       charge_type not null,
  amount     numeric(10, 2) not null check (amount >= 0),
  status     charge_status not null default 'DUE',
  reason     text,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  settled_by uuid references members (id)
);

create index charges_member_idx on charges (member_id);

-- Policy di prenotazione (singleton) -----------------------------------------
create table booking_policy (
  id                            smallint primary key default 1 check (id = 1),
  cancellation_model            cancellation_model not null default 'CALENDAR_DAY_BEFORE',
  cancellation_hours            smallint not null default 24,
  max_advance_days              smallint not null default 14,
  slot_duration_minutes         smallint not null default 60,
  max_active_bookings_per_member smallint not null default 0, -- 0 = illimitato
  timezone                      text not null default 'Europe/Rome'
);

insert into booking_policy (id) values (1);

-- Audit log -------------------------------------------------------------------
create table audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);

-- Trigger: ogni nuovo utente auth crea un profilo socio PENDING ---------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.members (id, email, full_name, membership_status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'PENDING'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- 20260604000002_functions.sql
-- ============================================================
-- VBS — Logica di business lato database (unica fonte di verità).
-- Tutte SECURITY DEFINER: applicano le regole e bypassano RLS in modo
-- controllato. Il frontend invoca queste funzioni via supabase.rpc().

-- Helper: ruolo del chiamante ------------------------------------------------
create or replace function current_role_name()
returns app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from members where id = auth.uid();
$$;

create or replace function is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_role_name() in ('ADMIN', 'MANAGER', 'FRONT_DESK'), false);
$$;

-- Prezzo del campo per uno slot, in base alle fasce orarie (RF-CFG-6) --------
-- Specificità: regola per campo+giorno > campo > giorno > generale.
create or replace function price_for_slot(p_court_id uuid, p_start_at timestamptz)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz    text;
  v_local timestamp;
  v_price numeric;
begin
  select timezone into v_tz from booking_policy where id = 1;
  v_local := p_start_at at time zone v_tz;

  select price into v_price
  from price_rules
  where (court_id = p_court_id or court_id is null)
    and (weekday = extract(dow from v_local)::int or weekday is null)
    and start_time <= v_local::time
    and end_time > v_local::time
  order by (court_id is not null) desc, (weekday is not null) desc
  limit 1;

  return coalesce(v_price, 0);
end;
$$;

-- Scadenza disdetta gratuita in base alla policy (§6) ------------------------
create or replace function compute_cancellation_deadline(p_start_at timestamptz)
returns timestamptz
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_model cancellation_model;
  v_hours int;
  v_tz    text;
  v_local timestamp;
begin
  select cancellation_model, cancellation_hours, timezone
    into v_model, v_hours, v_tz
  from booking_policy where id = 1;

  if v_model = 'ROLLING_HOURS' then
    return p_start_at - make_interval(hours => v_hours);
  end if;

  -- CALENDAR_DAY_BEFORE: 23:59:59 del giorno precedente, ora locale impianto.
  v_local := p_start_at at time zone v_tz;
  return (date_trunc('day', v_local) - interval '1 second') at time zone v_tz;
end;
$$;

-- Crea prenotazione (atomica, anti-overbooking, check tessera) ---------------
create or replace function create_booking(
  p_court_id  uuid,
  p_start_at  timestamptz,
  p_member_id uuid default null
)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_member  uuid;
  v_status  membership_status;
  v_policy  booking_policy%rowtype;
  v_slot    smallint;
  v_end     timestamptz;
  v_price   numeric;
  v_dl      timestamptz;
  v_active  int;
  v_row     bookings%rowtype;
begin
  -- Lo staff può prenotare per conto di un socio; il socio solo per sé.
  if p_member_id is not null and p_member_id <> v_actor then
    if not is_staff() then
      raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
    end if;
    v_member := p_member_id;
  else
    v_member := v_actor;
  end if;

  select * into v_policy from booking_policy where id = 1;

  -- Tessera valida (RF-BOOK-3): PENDING/EXPIRED/SUSPENDED non possono prenotare.
  select membership_status into v_status from members where id = v_member;
  if v_status is distinct from 'VALID' then
    raise exception 'MEMBERSHIP_NOT_VALID' using errcode = 'P0001';
  end if;

  -- Finestra di prenotazione: non nel passato, entro max_advance_days.
  if p_start_at <= now()
     or p_start_at > now() + make_interval(days => v_policy.max_advance_days) then
    raise exception 'OUTSIDE_BOOKING_WINDOW' using errcode = 'P0001';
  end if;

  -- Limite prenotazioni attive (0 = illimitato).
  if v_policy.max_active_bookings_per_member > 0 then
    select count(*) into v_active
    from bookings
    where member_id = v_member and status = 'CONFIRMED' and start_at > now();
    if v_active >= v_policy.max_active_bookings_per_member then
      raise exception 'OUTSIDE_BOOKING_WINDOW' using errcode = 'P0001';
    end if;
  end if;

  v_slot  := v_policy.slot_duration_minutes;
  v_end   := p_start_at + make_interval(mins => v_slot);
  v_price := price_for_slot(p_court_id, p_start_at);
  v_dl    := compute_cancellation_deadline(p_start_at);

  begin
    insert into bookings (court_id, member_id, start_at, end_at, price,
                          free_cancellation_deadline, created_by)
    values (p_court_id, v_member, p_start_at, v_end, v_price, v_dl, v_actor)
    returning * into v_row;
  exception when unique_violation then
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_actor, 'BOOKING_CREATE', 'booking', v_row.id, to_jsonb(v_row));

  return v_row;
end;
$$;

-- Disdetta: gratuita entro deadline, altrimenti charge = prezzo del campo ----
create or replace function cancel_booking(p_booking_id uuid)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_b     bookings%rowtype;
  v_before jsonb;
begin
  select * into v_b from bookings where id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_b.member_id <> v_actor and not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  if v_b.status <> 'CONFIRMED' or v_b.start_at <= now() then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_before := to_jsonb(v_b);

  update bookings
     set status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_actor
   where id = p_booking_id
   returning * into v_b;

  -- Disdetta tardiva → addebito pari al prezzo del campo (§6).
  if now() > v_b.free_cancellation_deadline and v_b.price > 0 then
    insert into charges (booking_id, member_id, type, amount)
    values (v_b.id, v_b.member_id, 'LATE_CANCELLATION', v_b.price);
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (v_actor, 'BOOKING_CANCEL', 'booking', v_b.id, v_before, to_jsonb(v_b));

  return v_b;
end;
$$;

-- No-show (solo staff): charge = prezzo del campo ----------------------------
create or replace function mark_no_show(p_booking_id uuid)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_b     bookings%rowtype;
begin
  if not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_b from bookings where id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  update bookings set status = 'NO_SHOW' where id = p_booking_id returning * into v_b;

  if v_b.price > 0 then
    insert into charges (booking_id, member_id, type, amount)
    values (v_b.id, v_b.member_id, 'NO_SHOW', v_b.price);
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_actor, 'BOOKING_NO_SHOW', 'booking', v_b.id, to_jsonb(v_b));

  return v_b;
end;
$$;

-- Validazione socio da parte dello staff (RF-MEMBER-1) -----------------------
create or replace function validate_member(
  p_member_id uuid,
  p_aics      text,
  p_start     date,
  p_end       date
)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_m     members%rowtype;
begin
  if not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  update members
     set aics_number = p_aics,
         membership_start_date = p_start,
         membership_end_date = p_end,
         membership_status = (case when p_end >= current_date then 'VALID' else 'EXPIRED' end)::membership_status,
         validated_by = v_actor,
         validated_at = now()
   where id = p_member_id
   returning * into v_m;

  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_actor, 'MEMBER_VALIDATE', 'member', v_m.id, to_jsonb(v_m));

  return v_m;
end;
$$;

-- Edizione multipla degli slot/regole prezzo (RF-CFG-7) ----------------------
-- Aggiorna in blocco il prezzo per più price_rules in un'unica operazione.
create or replace function bulk_update_price(p_ids uuid[], p_price numeric)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_count int;
begin
  if not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  update price_rules set price = p_price where id = any(p_ids);
  get diagnostics v_count = row_count;

  insert into audit_log (actor_id, action, entity, after)
  values (v_actor, 'PRICE_BULK_UPDATE', 'price_rule',
          jsonb_build_object('ids', p_ids, 'price', p_price, 'count', v_count));

  return v_count;
end;
$$;

-- Job giornaliero: scade le tessere (RF-MEMBER-4) ----------------------------
create or replace function expire_memberships()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update members
     set membership_status = 'EXPIRED'
   where membership_status = 'VALID'
     and membership_end_date is not null
     and membership_end_date < current_date;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================
-- 20260604000003_rls.sql
-- ============================================================
-- VBS — Row Level Security. Le scritture sui dati sensibili passano dalle
-- funzioni SECURITY DEFINER (20260604000002): qui apriamo solo le letture
-- necessarie e chiudiamo le scritture dirette. (DEV_BEST_PRACTICE §1/§5).

alter table members        enable row level security;
alter table courts         enable row level security;
alter table opening_rules  enable row level security;
alter table price_rules    enable row level security;
alter table closures       enable row level security;
alter table bookings       enable row level security;
alter table charges        enable row level security;
alter table booking_policy enable row level security;
alter table audit_log      enable row level security;

-- Members: ognuno vede sé stesso; lo staff vede e gestisce tutti -------------
create policy members_select_self_or_staff on members
  for select using (id = auth.uid() or is_staff());

create policy members_update_staff on members
  for update using (is_staff()) with check (is_staff());

-- Configurazione (campi, orari, prezzi, chiusure): lettura a tutti gli
-- autenticati (serve per la griglia disponibilità); scrittura solo staff -----
create policy courts_select on courts
  for select using (auth.role() = 'authenticated');
create policy courts_write on courts
  for all using (is_staff()) with check (is_staff());

create policy opening_rules_select on opening_rules
  for select using (auth.role() = 'authenticated');
create policy opening_rules_write on opening_rules
  for all using (is_staff()) with check (is_staff());

create policy price_rules_select on price_rules
  for select using (auth.role() = 'authenticated');
create policy price_rules_write on price_rules
  for all using (is_staff()) with check (is_staff());

create policy closures_select on closures
  for select using (auth.role() = 'authenticated');
create policy closures_write on closures
  for all using (is_staff()) with check (is_staff());

-- Policy di prenotazione: lettura a tutti, modifica solo admin ---------------
create policy booking_policy_select on booking_policy
  for select using (auth.role() = 'authenticated');
create policy booking_policy_update on booking_policy
  for update using (current_role_name() = 'ADMIN')
  with check (current_role_name() = 'ADMIN');

-- Prenotazioni: il socio vede le proprie, lo staff tutte. Le scritture
-- avvengono solo via funzioni (create/cancel/no_show), nessuna policy diretta.
create policy bookings_select_own_or_staff on bookings
  for select using (member_id = auth.uid() or is_staff());

-- Addebiti: il socio vede i propri, lo staff tutti ---------------------------
create policy charges_select_own_or_staff on charges
  for select using (member_id = auth.uid() or is_staff());

-- Audit log: solo staff in lettura ------------------------------------------
create policy audit_select_staff on audit_log
  for select using (is_staff());

-- ============================================================
-- 20260604000004_availability.sql
-- ============================================================
-- VBS — Disponibilità slot (giorno × campo × orario).
-- SECURITY DEFINER: calcola gli slot da opening_rules/price_rules/closures e li
-- marca FREE/TAKEN/UNAVAILABLE SENZA esporre le prenotazioni altrui (privacy +
-- RLS): il socio vede l'occupazione, non chi ha prenotato.

create or replace function get_availability(p_date date)
returns table (
  court_id   uuid,
  court_name text,
  start_at   timestamptz,
  end_at     timestamptz,
  price      numeric,
  status     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text;
begin
  select timezone into v_tz from booking_policy where id = 1;

  return query
  with slots as (
    select distinct
      c.id   as court_id,
      c.name as court_name,
      gs     as start_local,
      gs + make_interval(mins => orr.slot_duration_minutes) as end_local
    from courts c
    join opening_rules orr
      on (orr.court_id = c.id or orr.court_id is null)
     and orr.active
     and orr.weekday = extract(dow from p_date)::int
    cross join lateral generate_series(
      p_date + orr.open_time,
      p_date + orr.close_time - make_interval(mins => orr.slot_duration_minutes),
      make_interval(mins => orr.slot_duration_minutes)
    ) as gs
    where c.active
  )
  select
    s.court_id,
    s.court_name,
    (s.start_local at time zone v_tz) as start_at,
    (s.end_local   at time zone v_tz) as end_at,
    price_for_slot(s.court_id, s.start_local at time zone v_tz) as price,
    case
      when (s.start_local at time zone v_tz) <= now() then 'UNAVAILABLE'
      when exists (
        select 1 from closures cl
        where (cl.court_id = s.court_id or cl.court_id is null)
          and tstzrange(cl.start_at, cl.end_at)
              && tstzrange(s.start_local at time zone v_tz, s.end_local at time zone v_tz)
      ) then 'UNAVAILABLE'
      when exists (
        select 1 from bookings b
        where b.court_id = s.court_id
          and b.status = 'CONFIRMED'
          and b.start_at = (s.start_local at time zone v_tz)
      ) then 'TAKEN'
      else 'FREE'
    end as status
  from slots s
  order by s.start_local, s.court_name;
end;
$$;

grant execute on function get_availability(date) to authenticated;

-- ============================================================
-- 20260604000005_charges.sql
-- ============================================================
-- VBS — Gestione addebiti da parte dello staff: incasso ed esonero.

-- Incasso di un addebito (registrazione manuale: contante/Satispay/wallet) ----
create or replace function settle_charge(p_charge_id uuid)
returns charges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_c     charges%rowtype;
begin
  if not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  update charges
     set status = 'PAID', settled_at = now(), settled_by = v_actor
   where id = p_charge_id and status = 'DUE'
   returning * into v_c;

  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_actor, 'CHARGE_SETTLE', 'charge', v_c.id, to_jsonb(v_c));

  return v_c;
end;
$$;

-- Esonero di un addebito (solo Manager/Admin, motivazione obbligatoria) -------
create or replace function waive_charge(p_charge_id uuid, p_reason text)
returns charges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_c     charges%rowtype;
begin
  if current_role_name() not in ('ADMIN', 'MANAGER') then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  update charges
     set status = 'WAIVED', reason = p_reason, settled_at = now(), settled_by = v_actor
   where id = p_charge_id and status = 'DUE'
   returning * into v_c;

  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_actor, 'CHARGE_WAIVE', 'charge', v_c.id, to_jsonb(v_c));

  return v_c;
end;
$$;

-- ============================================================
-- 20260604000006_audit_config.sql
-- ============================================================
-- VBS — Audit automatico delle modifiche di configurazione (RF-CFG-8).
-- Le tabelle orari/chiusure sono scrivibili direttamente dallo staff (RLS):
-- un trigger registra ogni inserimento/modifica/cancellazione in audit_log.

create or replace function audit_config_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger audit_opening_rules
  after insert or update or delete on opening_rules
  for each row execute function audit_config_change();

create trigger audit_closures
  after insert or update or delete on closures
  for each row execute function audit_config_change();

-- ============================================================
-- 20260604000007_enhancements.sql
-- ============================================================
-- VBS — Migliorie: contatto obbligatorio (telefono raccolto in registrazione),
-- disponibilità settimanale e riepilogo per lo staff (dashboard).
-- Da applicare nello SQL Editor di Supabase dopo le migrazioni precedenti.

-- 1) Registrazione: cattura anche il telefono dai metadati dell'utente --------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.members (id, email, full_name, phone, membership_status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    'PENDING'
  );
  return new;
end;
$$;

-- 2) Almeno un contatto (email o telefono) per ogni socio ---------------------
-- NOT VALID: non blocca eventuali righe storiche; vale per insert/update nuovi.
alter table members drop constraint if exists members_contact_required;
alter table members
  add constraint members_contact_required
  check (coalesce(nullif(email, ''), nullif(phone, '')) is not null) not valid;

-- 3) Disponibilità su 7 giorni in un'unica chiamata (vista calendario) --------
-- Riusa get_availability per ogni giorno; aggiunge la colonna "day".
create or replace function get_week_availability(p_start date)
returns table (
  day        date,
  court_id   uuid,
  court_name text,
  start_at   timestamptz,
  end_at     timestamptz,
  price      numeric,
  status     text
)
language sql
stable
security definer
set search_path = public
as $$
  select (p_start + d)::date as day,
         g.court_id, g.court_name, g.start_at, g.end_at, g.price, g.status
  from generate_series(0, 6) as d
  cross join lateral get_availability((p_start + d)::date) as g;
$$;

grant execute on function get_week_availability(date) to authenticated;

-- 4) Riepilogo per lo staff (dashboard) --------------------------------------
create or replace function get_admin_summary()
returns table (
  bookings_today     int,
  bookings_upcoming  int,
  pending_members    int,
  charges_due_count  int,
  charges_due_amount numeric,
  expiring_soon      int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz    text;
  v_today date;
begin
  if not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select timezone into v_tz from booking_policy where id = 1;
  v_today := (now() at time zone v_tz)::date;

  return query select
    (select count(*) from bookings b
       where b.status = 'CONFIRMED'
         and (b.start_at at time zone v_tz)::date = v_today)::int,
    (select count(*) from bookings b
       where b.status = 'CONFIRMED' and b.start_at > now())::int,
    (select count(*) from members m
       where m.membership_status = 'PENDING')::int,
    (select count(*) from charges c
       where c.status = 'DUE')::int,
    (select coalesce(sum(c.amount), 0) from charges c
       where c.status = 'DUE'),
    (select count(*) from members m
       where m.membership_status = 'VALID'
         and m.membership_end_date is not null
         and m.membership_end_date between v_today and (v_today + 30))::int;
end;
$$;

grant execute on function get_admin_summary() to authenticated;

-- ============================================================
-- 20260604000008_roster_recurring.sql
-- ============================================================
-- VBS — Rosa giocatori, costo diviso, prenotazioni fisse e rinomina campi.
-- Modello: una prenotazione = uno slot riservato dal "capogruppo" + una rosa di
-- soci con tessera valida, sui quali si divide il costo del campo.
-- Da applicare nello SQL Editor di Supabase dopo le migrazioni precedenti.

-- 0) Rinomina campi (Giallo, Bianco, Verde) su installazioni esistenti --------
update courts set name = 'Giallo' where name = 'Campo Beach 1';
update courts set name = 'Bianco' where name = 'Campo Beach 2';
update courts set name = 'Verde'  where name = 'Campo Beach 3';

-- 1) Configurazione: quota a testa per fascia, soglia e minimo giocatori ------
alter table price_rules
  add column if not exists per_head_price numeric(10, 2) not null default 0
  check (per_head_price >= 0);

alter table booking_policy
  add column if not exists min_players smallint not null default 4 check (min_players >= 1);
alter table booking_policy
  add column if not exists per_head_threshold smallint not null default 8 check (per_head_threshold >= 1);

-- 2) Prenotazioni: serie (fisse) + snapshot della quota a testa ---------------
alter table bookings
  add column if not exists series_id uuid;
alter table bookings
  add column if not exists per_head_price numeric(10, 2) not null default 0;

create index if not exists bookings_series_idx on bookings (series_id);

-- 3) Rosa giocatori dello slot -----------------------------------------------
create table if not exists booking_players (
  booking_id uuid not null references bookings (id) on delete cascade,
  member_id  uuid not null references members (id),
  added_by   uuid references members (id),
  created_at timestamptz not null default now(),
  primary key (booking_id, member_id)
);
create index if not exists booking_players_member_idx on booking_players (member_id);

alter table booking_players enable row level security;
drop policy if exists booking_players_select on booking_players;
create policy booking_players_select on booking_players
  for select using (
    is_staff()
    or member_id = auth.uid()
    or exists (select 1 from bookings b where b.id = booking_id and b.member_id = auth.uid())
  );
-- Le scritture passano dalle funzioni SECURITY DEFINER (nessuna policy diretta).

-- 4) Quota a testa per uno slot (stessa logica di specificità di price_for_slot)
create or replace function per_head_for_slot(p_court_id uuid, p_start_at timestamptz)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz    text;
  v_local timestamp;
  v_price numeric;
begin
  select timezone into v_tz from booking_policy where id = 1;
  v_local := p_start_at at time zone v_tz;

  select per_head_price into v_price
  from price_rules
  where (court_id = p_court_id or court_id is null)
    and (weekday = extract(dow from v_local)::int or weekday is null)
    and start_time <= v_local::time
    and end_time > v_local::time
  order by (court_id is not null) desc, (weekday is not null) desc
  limit 1;

  return coalesce(v_price, 0);
end;
$$;

-- 5) create_booking: salva la quota a testa e aggiunge il capogruppo in rosa --
create or replace function create_booking(
  p_court_id  uuid,
  p_start_at  timestamptz,
  p_member_id uuid default null
)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_member  uuid;
  v_status  membership_status;
  v_policy  booking_policy%rowtype;
  v_slot    smallint;
  v_end     timestamptz;
  v_price   numeric;
  v_ph      numeric;
  v_dl      timestamptz;
  v_active  int;
  v_row     bookings%rowtype;
begin
  if p_member_id is not null and p_member_id <> v_actor then
    if not is_staff() then
      raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
    end if;
    v_member := p_member_id;
  else
    v_member := v_actor;
  end if;

  select * into v_policy from booking_policy where id = 1;

  select membership_status into v_status from members where id = v_member;
  if v_status is distinct from 'VALID' then
    raise exception 'MEMBERSHIP_NOT_VALID' using errcode = 'P0001';
  end if;

  if p_start_at <= now()
     or p_start_at > now() + make_interval(days => v_policy.max_advance_days) then
    raise exception 'OUTSIDE_BOOKING_WINDOW' using errcode = 'P0001';
  end if;

  if v_policy.max_active_bookings_per_member > 0 then
    select count(*) into v_active
    from bookings
    where member_id = v_member and status = 'CONFIRMED' and start_at > now();
    if v_active >= v_policy.max_active_bookings_per_member then
      raise exception 'OUTSIDE_BOOKING_WINDOW' using errcode = 'P0001';
    end if;
  end if;

  v_slot  := v_policy.slot_duration_minutes;
  v_end   := p_start_at + make_interval(mins => v_slot);
  v_price := price_for_slot(p_court_id, p_start_at);
  v_ph    := per_head_for_slot(p_court_id, p_start_at);
  v_dl    := compute_cancellation_deadline(p_start_at);

  begin
    insert into bookings (court_id, member_id, start_at, end_at, price,
                          per_head_price, free_cancellation_deadline, created_by)
    values (p_court_id, v_member, p_start_at, v_end, v_price,
            v_ph, v_dl, v_actor)
    returning * into v_row;
  exception when unique_violation then
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end;

  -- Il capogruppo entra automaticamente nella rosa.
  insert into booking_players (booking_id, member_id, added_by)
  values (v_row.id, v_member, v_actor)
  on conflict do nothing;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_actor, 'BOOKING_CREATE', 'booking', v_row.id, to_jsonb(v_row));

  return v_row;
end;
$$;

-- 6) Gestione rosa: aggiungi / rimuovi giocatori (soci con tessera valida) ----
create or replace function add_player(p_booking_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_b      bookings%rowtype;
  v_status membership_status;
begin
  select * into v_b from bookings where id = p_booking_id;
  if not found or v_b.status <> 'CONFIRMED' or v_b.start_at <= now() then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Capogruppo o staff possono modificare la rosa.
  if v_b.member_id <> v_actor and not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  -- Solo soci con tessera valida possono giocare.
  select membership_status into v_status from members where id = p_member_id;
  if v_status is distinct from 'VALID' then
    raise exception 'MEMBERSHIP_NOT_VALID' using errcode = 'P0001';
  end if;

  insert into booking_players (booking_id, member_id, added_by)
  values (p_booking_id, p_member_id, v_actor)
  on conflict do nothing;
end;
$$;

create or replace function remove_player(p_booking_id uuid, p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_b     bookings%rowtype;
begin
  select * into v_b from bookings where id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_b.member_id <> v_actor and not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  -- Il capogruppo non può uscire dalla rosa: per toglierlo si disdice lo slot.
  if p_member_id = v_b.member_id then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  delete from booking_players
  where booking_id = p_booking_id and member_id = p_member_id;
end;
$$;

-- Ricerca soci con tessera valida (per comporre la rosa) senza esporre members.
create or replace function search_valid_members(p_query text)
returns table (id uuid, full_name text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.full_name
  from members m
  where m.membership_status = 'VALID'
    and (p_query is null or p_query = '' or m.full_name ilike '%' || p_query || '%')
  order by m.full_name
  limit 20;
$$;

-- 7) Prenotazioni fisse: genera le occorrenze settimanali fino alla data ------
-- Solo staff. Salta gli slot già occupati e li riporta nell'esito.
create or replace function create_recurring_booking(
  p_court_id    uuid,
  p_first_start timestamptz,
  p_until       date,
  p_member_id   uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_member  uuid;
  v_status  membership_status;
  v_policy  booking_policy%rowtype;
  v_tz      text;
  v_local0  timestamp;
  v_local   timestamp;
  v_start   timestamptz;
  v_end     timestamptz;
  v_price   numeric;
  v_ph      numeric;
  v_dl      timestamptz;
  v_series  uuid := gen_random_uuid();
  v_created int := 0;
  v_skipped date[] := '{}';
  v_bid     uuid;
  v_i       int;
begin
  if not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  v_member := coalesce(p_member_id, v_actor);
  select membership_status into v_status from members where id = v_member;
  if v_status is distinct from 'VALID' then
    raise exception 'MEMBERSHIP_NOT_VALID' using errcode = 'P0001';
  end if;

  select * into v_policy from booking_policy where id = 1;
  select timezone into v_tz from booking_policy where id = 1;
  v_local0 := p_first_start at time zone v_tz;

  for v_i in 0..520 loop  -- limite di sicurezza (~10 anni)
    v_local := v_local0 + make_interval(days => 7 * v_i);
    exit when v_local::date > p_until;
    v_start := v_local at time zone v_tz;  -- riconverte (corretto rispetto all'ora legale)
    if v_start <= now() then
      continue;
    end if;

    v_end   := v_start + make_interval(mins => v_policy.slot_duration_minutes);
    v_price := price_for_slot(p_court_id, v_start);
    v_ph    := per_head_for_slot(p_court_id, v_start);
    v_dl    := compute_cancellation_deadline(v_start);

    begin
      insert into bookings (court_id, member_id, start_at, end_at, price,
                            per_head_price, free_cancellation_deadline, created_by, series_id)
      values (p_court_id, v_member, v_start, v_end, v_price,
              v_ph, v_dl, v_actor, v_series)
      returning id into v_bid;

      insert into booking_players (booking_id, member_id, added_by)
      values (v_bid, v_member, v_actor) on conflict do nothing;

      v_created := v_created + 1;
    exception when unique_violation then
      v_skipped := array_append(v_skipped, v_local::date);
    end;
  end loop;

  insert into audit_log (actor_id, action, entity, after)
  values (v_actor, 'BOOKING_RECURRING', 'booking',
          jsonb_build_object('series_id', v_series, 'created', v_created,
                             'skipped', to_jsonb(v_skipped)));

  return jsonb_build_object('created', v_created,
                            'skipped', to_jsonb(v_skipped),
                            'series_id', v_series);
end;
$$;

-- 8) Aggiornamento in blocco della quota a testa (come bulk_update_price) -----
create or replace function bulk_update_per_head(p_ids uuid[], p_price numeric)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_count int;
begin
  if not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  update price_rules set per_head_price = p_price where id = any(p_ids);
  get diagnostics v_count = row_count;

  insert into audit_log (actor_id, action, entity, after)
  values (v_actor, 'PER_HEAD_BULK_UPDATE', 'price_rule',
          jsonb_build_object('ids', p_ids, 'per_head', p_price, 'count', v_count));

  return v_count;
end;
$$;

grant execute on function per_head_for_slot(uuid, timestamptz) to authenticated;
grant execute on function add_player(uuid, uuid) to authenticated;
grant execute on function remove_player(uuid, uuid) to authenticated;
grant execute on function search_valid_members(text) to authenticated;
grant execute on function create_recurring_booking(uuid, timestamptz, date, uuid) to authenticated;
grant execute on function bulk_update_per_head(uuid[], numeric) to authenticated;

-- 9) Riepilogo staff: aggiunge gli slot in arrivo sotto il minimo giocatori ---
-- (cambia il tipo di ritorno: va eliminata e ricreata)
drop function if exists get_admin_summary();
create or replace function get_admin_summary()
returns table (
  bookings_today     int,
  bookings_upcoming  int,
  pending_members    int,
  charges_due_count  int,
  charges_due_amount numeric,
  expiring_soon      int,
  underfilled        int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz      text;
  v_today   date;
  v_min     smallint;
begin
  if not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select timezone, min_players into v_tz, v_min from booking_policy where id = 1;
  v_today := (now() at time zone v_tz)::date;

  return query select
    (select count(*) from bookings b
       where b.status = 'CONFIRMED'
         and (b.start_at at time zone v_tz)::date = v_today)::int,
    (select count(*) from bookings b
       where b.status = 'CONFIRMED' and b.start_at > now())::int,
    (select count(*) from members m
       where m.membership_status = 'PENDING')::int,
    (select count(*) from charges c
       where c.status = 'DUE')::int,
    (select coalesce(sum(c.amount), 0) from charges c
       where c.status = 'DUE'),
    (select count(*) from members m
       where m.membership_status = 'VALID'
         and m.membership_end_date is not null
         and m.membership_end_date between v_today and (v_today + 30))::int,
    (select count(*) from bookings b
       where b.status = 'CONFIRMED' and b.start_at > now()
         and (select count(*) from booking_players p where p.booking_id = b.id) < v_min)::int;
end;
$$;

grant execute on function get_admin_summary() to authenticated;

-- ============================================================
-- 20260604000009_branding_nickname.sql
-- ============================================================
-- VBS — Soprannome socio (disambiguazione in caso di omonimia) e branding.
-- In caso di nomi uguali non mostriamo dati in chiaro (telefono/email/tessera):
-- per identificare il socio si usa il soprannome scelto in registrazione.
-- Da applicare nello SQL Editor di Supabase dopo le migrazioni precedenti.

-- 1) Campo soprannome ---------------------------------------------------------
alter table members add column if not exists nickname text;

-- 2) Il trigger copia anche il soprannome dai metadati di registrazione -------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.members (id, email, full_name, phone, nickname, membership_status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'nickname', ''),
    'PENDING'
  );
  return new;
end;
$$;

-- 3) Ricerca soci validi: restituisce anche il soprannome ---------------------
-- (cambia il tipo di ritorno: va eliminata e ricreata)
drop function if exists search_valid_members(text);
create or replace function search_valid_members(p_query text)
returns table (id uuid, full_name text, nickname text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.full_name, m.nickname
  from members m
  where m.membership_status = 'VALID'
    and (
      p_query is null or p_query = ''
      or m.full_name ilike '%' || p_query || '%'
      or m.nickname ilike '%' || p_query || '%'
    )
  order by m.full_name, m.nickname
  limit 20;
$$;

grant execute on function search_valid_members(text) to authenticated;

-- ============================================================
-- 20260604000010_staff_corrections.sql
-- ============================================================
-- VBS — Correzioni staff: annullare un no-show e liberare un campo (disdetta
-- gestita dallo staff, con o senza penale) per le disdette dopo il termine.
-- Da applicare nello SQL Editor di Supabase dopo le migrazioni precedenti.

-- 1) Annulla una mancata presentazione segnata per errore --------------------
-- Riporta la prenotazione a CONFERMATA e rimuove l'addebito di no-show ancora
-- dovuto. Fallisce se nel frattempo lo slot è stato riassegnato.
create or replace function undo_no_show(p_booking_id uuid)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_b      bookings%rowtype;
  v_before jsonb;
begin
  if not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_b from bookings where id = p_booking_id;
  if not found or v_b.status <> 'NO_SHOW' then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_before := to_jsonb(v_b);

  -- Toglie l'addebito di no-show ancora da saldare (era un errore).
  delete from charges
   where booking_id = p_booking_id and type = 'NO_SHOW' and status = 'DUE';

  begin
    update bookings set status = 'CONFIRMED' where id = p_booking_id
    returning * into v_b;
  exception when unique_violation then
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end;

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (v_actor, 'BOOKING_UNDO_NO_SHOW', 'booking', v_b.id, v_before, to_jsonb(v_b));

  return v_b;
end;
$$;

-- 2) Libera un campo: disdetta gestita dallo staff (con o senza penale) -------
-- Usata per le disdette comunicate dopo il termine (es. per telefono): libera
-- lo slot e, a scelta dello staff, addebita o meno il prezzo del campo.
create or replace function staff_cancel_booking(
  p_booking_id uuid,
  p_charge     boolean default false
)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_b      bookings%rowtype;
  v_before jsonb;
begin
  if not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_b from bookings where id = p_booking_id;
  if not found or v_b.status <> 'CONFIRMED' then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_before := to_jsonb(v_b);

  update bookings
     set status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_actor
   where id = p_booking_id
   returning * into v_b;

  -- Penale a discrezione dello staff (disdetta tardiva = prezzo del campo).
  if p_charge and v_b.price > 0 then
    insert into charges (booking_id, member_id, type, amount)
    values (v_b.id, v_b.member_id, 'LATE_CANCELLATION', v_b.price);
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (v_actor, 'BOOKING_STAFF_CANCEL', 'booking', v_b.id, v_before, to_jsonb(v_b));

  return v_b;
end;
$$;

grant execute on function undo_no_show(uuid) to authenticated;
grant execute on function staff_cancel_booking(uuid, boolean) to authenticated;

-- ============================================================
-- 20260604000011_same_day_free_cancel.sql
-- ============================================================
-- VBS — Disdetta gratuita in giornata.
-- Se la prenotazione viene disdetta nello STESSO giorno in cui è stata creata,
-- non si applica la penale, anche se il termine di disdetta gratuita è già
-- passato (caso tipico: prenotazione fatta in giornata). Per gli altri giorni
-- resta la regola del termine (penale = prezzo del campo).
-- Da applicare nello SQL Editor di Supabase dopo le migrazioni precedenti.

create or replace function cancel_booking(p_booking_id uuid)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_b      bookings%rowtype;
  v_before jsonb;
  v_tz     text;
  v_late   boolean;
begin
  select * into v_b from bookings where id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_b.member_id <> v_actor and not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  if v_b.status <> 'CONFIRMED' or v_b.start_at <= now() then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_before := to_jsonb(v_b);

  update bookings
     set status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_actor
   where id = p_booking_id
   returning * into v_b;

  -- Disdetta tardiva → addebito pari al prezzo del campo (§6), MA gratuita se
  -- avviene nello stesso giorno (ora locale impianto) della prenotazione.
  select timezone into v_tz from booking_policy where id = 1;
  v_late := now() > v_b.free_cancellation_deadline
            and (now() at time zone v_tz)::date
                <> (v_b.created_at at time zone v_tz)::date;

  if v_late and v_b.price > 0 then
    insert into charges (booking_id, member_id, type, amount)
    values (v_b.id, v_b.member_id, 'LATE_CANCELLATION', v_b.price);
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (v_actor, 'BOOKING_CANCEL', 'booking', v_b.id, v_before, to_jsonb(v_b));

  return v_b;
end;
$$;

-- ============================================================
-- 20260604000012_cancellation_grace.sql
-- ============================================================
-- VBS — Finestra di tolleranza (cooling-off) per la disdetta.
-- Sostituisce la regola "stesso giorno": la disdetta è gratuita se avviene
-- ENTRO il termine normale OPPURE entro N minuti dalla creazione della
-- prenotazione. Così chi prenota e disdice subito (es. riempie uno slot appena
-- liberato) non paga, ma chi prenota in anticipo e molla lo slot all'ultimo
-- (oltre la finestra) paga la penale. La durata è configurabile dall'admin.
-- Da applicare nello SQL Editor di Supabase dopo le migrazioni precedenti.

alter table booking_policy
  add column if not exists cancellation_grace_minutes smallint not null default 120
  check (cancellation_grace_minutes >= 0);

create or replace function cancel_booking(p_booking_id uuid)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_b      bookings%rowtype;
  v_before jsonb;
  v_grace  int;
  v_late   boolean;
begin
  select * into v_b from bookings where id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_b.member_id <> v_actor and not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  if v_b.status <> 'CONFIRMED' or v_b.start_at <= now() then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_before := to_jsonb(v_b);

  update bookings
     set status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_actor
   where id = p_booking_id
   returning * into v_b;

  -- Disdetta tardiva → addebito pari al prezzo del campo (§6), MA gratuita se
  -- entro il termine normale o entro la finestra di tolleranza dalla creazione.
  select cancellation_grace_minutes into v_grace from booking_policy where id = 1;
  v_late := now() > v_b.free_cancellation_deadline
            and now() > v_b.created_at + make_interval(mins => v_grace);

  if v_late and v_b.price > 0 then
    insert into charges (booking_id, member_id, type, amount)
    values (v_b.id, v_b.member_id, 'LATE_CANCELLATION', v_b.price);
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (v_actor, 'BOOKING_CANCEL', 'booking', v_b.id, v_before, to_jsonb(v_b));

  return v_b;
end;
$$;

-- ============================================================
-- 20260604000013_cancellation_notifications.sql
-- ============================================================
-- VBS — Notifiche di annullamento campo (coda "outbox") + Web Push.
-- Quando lo staff annulla una prenotazione (singola o in blocco per una
-- chiusura: pioggia, maltempo, manutenzione…) viene scritta una notifica per
-- ogni giocatore coinvolto (intestatario + rosa). Una Edge Function legge la
-- coda e invia la push; l'app mostra le stesse notifiche in una campanella.
-- Da applicare nello SQL Editor di Supabase dopo le migrazioni precedenti.

-- 0) Motivo dell'annullamento sulla prenotazione (mostrato al socio) ----------
alter table bookings
  add column if not exists cancellation_reason text;

-- 1) Iscrizioni Web Push del socio (una per dispositivo/browser) --------------
create table if not exists push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references members (id) on delete cascade,
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists push_subscriptions_member_idx
  on push_subscriptions (member_id);

alter table push_subscriptions enable row level security;
drop policy if exists push_subscriptions_select on push_subscriptions;
create policy push_subscriptions_select on push_subscriptions
  for select using (member_id = auth.uid() or is_staff());
drop policy if exists push_subscriptions_insert on push_subscriptions;
create policy push_subscriptions_insert on push_subscriptions
  for insert with check (member_id = auth.uid());
drop policy if exists push_subscriptions_update on push_subscriptions;
create policy push_subscriptions_update on push_subscriptions
  for update using (member_id = auth.uid()) with check (member_id = auth.uid());
drop policy if exists push_subscriptions_delete on push_subscriptions;
create policy push_subscriptions_delete on push_subscriptions
  for delete using (member_id = auth.uid());

-- 2) Coda notifiche (outbox): drenata dalla Edge Function + letta dall'app ----
create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references members (id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text not null,
  data       jsonb not null default '{}'::jsonb,
  booking_id uuid references bookings (id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at    timestamptz,   -- valorizzato dalla Edge Function dopo l'invio push
  read_at    timestamptz    -- valorizzato dall'app quando il socio la legge
);
create index if not exists notifications_member_idx
  on notifications (member_id, created_at desc);
create index if not exists notifications_unsent_idx
  on notifications (created_at) where sent_at is null;

alter table notifications enable row level security;
-- Il socio legge solo le proprie; lo staff può vederle tutte.
drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications
  for select using (member_id = auth.uid() or is_staff());
-- Il socio può solo marcarle come lette (le scritture nascono da funzioni).
drop policy if exists notifications_update on notifications;
create policy notifications_update on notifications
  for update using (member_id = auth.uid()) with check (member_id = auth.uid());

-- 3) Helper: accoda l'avviso a tutti i giocatori dello slot -------------------
create or replace function enqueue_cancellation_notice(p_booking_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz   text;
  v_when text;
  v_b    record;
begin
  select timezone into v_tz from booking_policy where id = 1;

  select b.start_at, b.member_id, c.name as court_name
    into v_b
  from bookings b
  join courts c on c.id = b.court_id
  where b.id = p_booking_id;
  if not found then
    return;
  end if;

  v_when := to_char(v_b.start_at at time zone v_tz, 'DD/MM HH24:MI');

  insert into notifications (member_id, type, title, body, data, booking_id)
  select distinct p.mid,
         'BOOKING_CANCELLED',
         'Campo annullato',
         v_b.court_name || ' · ' || v_when || coalesce(' — ' || p_reason, ''),
         jsonb_build_object(
           'court', v_b.court_name,
           'startAt', v_b.start_at,
           'reason', p_reason
         ),
         p_booking_id
  from (
    select v_b.member_id as mid
    union
    select bp.member_id from booking_players bp where bp.booking_id = p_booking_id
  ) p;
end;
$$;

-- 4) Annullamento singolo (staff): ora accetta un motivo e avvisa i giocatori -
drop function if exists staff_cancel_booking(uuid, boolean);
create or replace function staff_cancel_booking(
  p_booking_id uuid,
  p_charge     boolean default false,
  p_reason     text default null
)
returns bookings
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_b      bookings%rowtype;
  v_before jsonb;
begin
  if not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_b from bookings where id = p_booking_id;
  if not found or v_b.status <> 'CONFIRMED' then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_before := to_jsonb(v_b);

  update bookings
     set status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_actor,
         cancellation_reason = p_reason
   where id = p_booking_id
   returning * into v_b;

  -- Penale a discrezione dello staff (disdetta tardiva = prezzo del campo).
  if p_charge and v_b.price > 0 then
    insert into charges (booking_id, member_id, type, amount)
    values (v_b.id, v_b.member_id, 'LATE_CANCELLATION', v_b.price);
  end if;

  perform enqueue_cancellation_notice(v_b.id, p_reason);

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (v_actor, 'BOOKING_STAFF_CANCEL', 'booking', v_b.id, v_before, to_jsonb(v_b));

  return v_b;
end;
$$;

-- 5) Annullamento in blocco per una chiusura (pioggia/maltempo…), senza penale-
create or replace function cancel_bookings_for_closure(p_closure_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_closure closures%rowtype;
  v_b       bookings%rowtype;
  v_before  jsonb;
  v_count   integer := 0;
begin
  if not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_closure from closures where id = p_closure_id;
  if not found then
    raise exception 'CLOSURE_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Prenotazioni confermate e future che cadono nella finestra di chiusura,
  -- sul campo indicato (o su tutti i campi se court_id è nullo).
  for v_b in
    select b.* from bookings b
    where b.status = 'CONFIRMED'
      and b.start_at > now()
      and b.start_at < v_closure.end_at
      and b.end_at   > v_closure.start_at
      and (v_closure.court_id is null or b.court_id = v_closure.court_id)
    for update
  loop
    v_before := to_jsonb(v_b);
    update bookings
       set status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_actor,
           cancellation_reason = v_closure.reason
     where id = v_b.id
     returning * into v_b;

    perform enqueue_cancellation_notice(v_b.id, v_closure.reason);

    insert into audit_log (actor_id, action, entity, entity_id, before, after)
    values (v_actor, 'BOOKING_CLOSURE_CANCEL', 'booking', v_b.id, v_before, to_jsonb(v_b));

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

grant execute on function staff_cancel_booking(uuid, boolean, text) to authenticated;
grant execute on function cancel_bookings_for_closure(uuid) to authenticated;

-- ============================================================
-- seed.sql
-- ============================================================
-- VBS — Dati iniziali per sviluppo locale.

-- 3 campi da beach volley
insert into courts (name) values
  ('Giallo'),
  ('Bianco'),
  ('Verde');

-- Orari di apertura: tutti i campi, ogni giorno 09:00–23:00, slot da 60 min.
-- weekday 0=domenica … 6=sabato.
insert into opening_rules (court_id, weekday, open_time, close_time, slot_duration_minutes)
select null, gs, '09:00', '23:00', 60
from generate_series(0, 6) as gs;

-- Prezzi per fascia oraria (validi per tutti i campi e giorni):
--   09:00–18:00 = 10€ (fascia ordinaria), 18:00–23:00 = 16€ (prime-time).
-- per_head_price = quota fissa a testa quando si superano gli 8 giocatori.
insert into price_rules (court_id, weekday, start_time, end_time, price, per_head_price) values
  (null, null, '09:00', '18:00', 10.00, 3.00),
  (null, null, '18:00', '23:00', 16.00, 3.00);
