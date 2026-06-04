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
