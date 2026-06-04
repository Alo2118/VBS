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
         membership_status = case when p_end >= current_date then 'VALID' else 'EXPIRED' end,
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
