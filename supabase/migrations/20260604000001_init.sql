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
