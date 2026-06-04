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
