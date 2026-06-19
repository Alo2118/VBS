-- VBS — Quando un socio disdice una propria prenotazione, avvisa gli ALTRI
-- giocatori della rosa (non chi ha disdetto). Riusa la coda `notifications`.
-- Da applicare nello SQL Editor di Supabase dopo le migrazioni precedenti.

-- 1) enqueue: opzione per escludere un destinatario (es. chi ha disdetto) -----
drop function if exists enqueue_cancellation_notice(uuid, text);
create or replace function enqueue_cancellation_notice(
  p_booking_id uuid,
  p_reason     text,
  p_exclude    uuid default null
)
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
  ) p
  where p_exclude is null or p.mid <> p_exclude;
end;
$$;

-- 2) cancel_booking: avvisa gli altri giocatori della disdetta ---------------
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

  -- Avvisa gli altri giocatori della rosa (non chi ha disdetto).
  select coalesce(nullif(full_name, ''), email) into v_name from members where id = v_actor;
  perform enqueue_cancellation_notice(v_b.id, 'disdetta di ' || coalesce(v_name, 'un giocatore'), v_actor);

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (v_actor, 'BOOKING_CANCEL', 'booking', v_b.id, v_before, to_jsonb(v_b));

  return v_b;
end;
$$;
