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
