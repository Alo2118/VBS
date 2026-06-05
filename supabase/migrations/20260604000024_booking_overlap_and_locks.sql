-- VBS — Integrità prenotazioni: anti-overbooking su intervalli + lock di riga.
--
-- (A) Anti-overbooking robusto: l'unique index su (court_id, start_at) impediva
--     solo due prenotazioni con lo STESSO orario d'inizio, non quelle che si
--     SOVRAPPONGONO con inizio diverso (possibile se la durata slot cambia).
--     Lo sostituiamo con un EXCLUDE constraint sui range temporali.
-- (B) Lock di riga (`for update`) nelle funzioni che cambiano lo stato di una
--     prenotazione: due operazioni concorrenti (es. due disdette, due no-show,
--     due addebiti quota campo) si serializzano, evitando doppie penali / doppi
--     addebiti. La seconda trova lo stato già aggiornato e si ferma in modo
--     pulito.
--
-- Da applicare nello SQL Editor di Supabase dopo le migrazioni precedenti.
-- NB: se esistono già prenotazioni CONFERMATE sovrapposte, la creazione del
-- constraint fallirà: vanno prima risolte le sovrapposizioni.

create extension if not exists btree_gist; -- consente `court_id WITH =` nel gist

-- (A) Sostituzione indice unico → exclusion constraint -----------------------
drop index if exists bookings_active_slot_uidx;

alter table bookings drop constraint if exists bookings_no_overlap; -- ri-eseguibile
alter table bookings
  add constraint bookings_no_overlap
  exclude using gist (
    court_id with =,
    tstzrange(start_at, end_at) with &&
  ) where (status = 'CONFIRMED');

-- Indice btree per le ricerche di disponibilità (court_id + start_at), prima
-- garantito dall'unique index rimosso.
create index if not exists bookings_court_start_idx
  on bookings (court_id, start_at)
  where status = 'CONFIRMED';

-- (B1) create_booking: ora l'overlap genera exclusion_violation -------------
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
  exception when unique_violation or exclusion_violation then
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

-- (B2) create_recurring_booking: idem nel ciclo ------------------------------
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
    exception when unique_violation or exclusion_violation then
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

-- (B3) mark_no_show: lock di riga sulla prenotazione ------------------------
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

  select * into v_b from bookings where id = p_booking_id for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  update bookings set status = 'NO_SHOW' where id = p_booking_id returning * into v_b;

  if v_b.price > 0 then
    insert into ledger_entries (member_id, kind, amount, description, booking_id, created_by)
    values (v_b.member_id, 'PENALTY', v_b.price, 'Penale mancata presentazione', v_b.id, v_actor);
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_actor, 'BOOKING_NO_SHOW', 'booking', v_b.id, to_jsonb(v_b));

  return v_b;
end;
$$;

-- (B4) undo_no_show: lock di riga + overlap → SLOT_TAKEN --------------------
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

  select * into v_b from bookings where id = p_booking_id for update;
  if not found or v_b.status <> 'NO_SHOW' then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_before := to_jsonb(v_b);

  -- Toglie la penale di no-show dal conto (era un errore).
  delete from ledger_entries where booking_id = p_booking_id and kind = 'PENALTY';

  begin
    update bookings set status = 'CONFIRMED' where id = p_booking_id
    returning * into v_b;
  exception when unique_violation or exclusion_violation then
    raise exception 'SLOT_TAKEN' using errcode = 'P0001';
  end;

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (v_actor, 'BOOKING_UNDO_NO_SHOW', 'booking', v_b.id, v_before, to_jsonb(v_b));

  return v_b;
end;
$$;

-- (B5) cancel_booking (disdetta socio): lock di riga ------------------------
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
  v_name   text;
begin
  select * into v_b from bookings where id = p_booking_id for update;
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

  select cancellation_grace_minutes into v_grace from booking_policy where id = 1;
  v_late := now() > v_b.free_cancellation_deadline
            and now() > v_b.created_at + make_interval(mins => v_grace);

  if v_late and v_b.price > 0 then
    insert into ledger_entries (member_id, kind, amount, description, booking_id, created_by)
    values (v_b.member_id, 'PENALTY', v_b.price, 'Penale disdetta tardiva', v_b.id, v_actor);
  end if;

  select coalesce(nullif(full_name, ''), email) into v_name from members where id = v_actor;
  perform enqueue_cancellation_notice(v_b.id, 'disdetta di ' || coalesce(v_name, 'un giocatore'), v_actor);

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (v_actor, 'BOOKING_CANCEL', 'booking', v_b.id, v_before, to_jsonb(v_b));

  return v_b;
end;
$$;

-- (B6) staff_cancel_booking: lock di riga -----------------------------------
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

  select * into v_b from bookings where id = p_booking_id for update;
  if not found or v_b.status <> 'CONFIRMED' then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_before := to_jsonb(v_b);

  update bookings
     set status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_actor,
         cancellation_reason = p_reason
   where id = p_booking_id
   returning * into v_b;

  if p_charge and v_b.price > 0 then
    insert into ledger_entries (member_id, kind, amount, description, booking_id, created_by)
    values (v_b.member_id, 'PENALTY', v_b.price, 'Penale disdetta (staff)', v_b.id, v_actor);
  end if;

  perform enqueue_cancellation_notice(v_b.id, p_reason);

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (v_actor, 'BOOKING_STAFF_CANCEL', 'booking', v_b.id, v_before, to_jsonb(v_b));

  return v_b;
end;
$$;

-- (B7) post_court_fees: lock di riga → niente doppio addebito quota campo ----
create or replace function post_court_fees(p_booking_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_b      bookings%rowtype;
  v_thr    smallint;
  v_n      int;
  v_share  numeric;
  v_count  int := 0;
  v_pl     record;
begin
  if not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_b from bookings where id = p_booking_id for update;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Già addebitata? non duplicare.
  if exists (select 1 from ledger_entries where booking_id = p_booking_id and kind = 'COURT') then
    return 0;
  end if;

  select per_head_threshold into v_thr from booking_policy where id = 1;
  select count(*) into v_n from booking_players where booking_id = p_booking_id;
  if v_n = 0 then
    v_n := 1; -- nessuna rosa: addebita l'intestatario
  end if;

  -- Stessa regola di perPlayerShare: oltre soglia quota fissa a testa, altrimenti prezzo/numero.
  if v_n > v_thr then
    v_share := round(v_b.per_head_price, 2);
  else
    v_share := round(v_b.price / v_n, 2);
  end if;

  if v_share <= 0 then
    return 0;
  end if;

  for v_pl in
    select member_id from booking_players where booking_id = p_booking_id
    union
    select v_b.member_id where not exists (select 1 from booking_players where booking_id = p_booking_id)
  loop
    insert into ledger_entries (member_id, kind, amount, description, booking_id, created_by)
    values (v_pl.member_id, 'COURT', v_share, 'Quota campo', p_booking_id, v_actor);
    v_count := v_count + 1;
  end loop;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_actor, 'COURT_FEES', 'booking', p_booking_id,
          jsonb_build_object('players', v_count, 'share', v_share));

  return v_count;
end;
$$;
