-- VBS — Unifica le penali nel conto del socio (ledger).
-- Le penali (no-show, disdetta tardiva) diventano movimenti PENALTY sul conto,
-- così il saldo è completo e si saldano dalla Cassa. La pagina "Addebiti"
-- confluisce nella Cassa. Migra le penali ancora dovute (charges DUE) sul conto.
-- Da applicare nello SQL Editor di Supabase dopo le migrazioni precedenti.

-- 1) No-show: penale come movimento sul conto -------------------------------
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
    insert into ledger_entries (member_id, kind, amount, description, booking_id, created_by)
    values (v_b.member_id, 'PENALTY', v_b.price, 'Penale mancata presentazione', v_b.id, v_actor);
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_actor, 'BOOKING_NO_SHOW', 'booking', v_b.id, to_jsonb(v_b));

  return v_b;
end;
$$;

-- undo_no_show: rimuove la penale dal conto -----------------------------------
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

  -- Toglie la penale di no-show dal conto (era un errore).
  delete from ledger_entries where booking_id = p_booking_id and kind = 'PENALTY';

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

-- 2) Disdetta del socio: penale tardiva come movimento sul conto -------------
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

-- 3) Disdetta dello staff: penale opzionale come movimento sul conto ---------
drop function if exists staff_cancel_booking(uuid, boolean, text);
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

grant execute on function staff_cancel_booking(uuid, boolean, text) to authenticated;

-- 4) Storno (WAIVER) consentito solo a gestione (ADMIN/MANAGER) --------------
create or replace function post_account_payment(
  p_member      uuid,
  p_amount      numeric,
  p_method      pay_method,
  p_kind        ledger_kind default 'PAYMENT',
  p_description text default null,
  p_booking     uuid default null
)
returns ledger_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row   ledger_entries%rowtype;
begin
  if not can_handle_payments() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_kind not in ('PAYMENT','TOPUP','WAIVER') then
    raise exception 'INVALID_KIND' using errcode = 'P0001';
  end if;
  if p_kind = 'WAIVER' and current_role_name() not in ('ADMIN','MANAGER') then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_kind in ('PAYMENT','TOPUP') and p_method is null then
    raise exception 'METHOD_REQUIRED' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  insert into ledger_entries (member_id, kind, amount, method, description, booking_id, created_by)
  values (p_member, p_kind, p_amount, p_method, p_description, p_booking, v_actor)
  returning * into v_row;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_actor, 'LEDGER_PAYMENT', 'ledger', v_row.id, to_jsonb(v_row));

  return v_row;
end;
$$;

-- 5) Migra le penali ancora dovute (charges DUE) sul conto -------------------
-- Idempotente: salta quelle già presenti come movimento sul conto.
insert into ledger_entries (member_id, kind, amount, description, booking_id, created_by, created_at)
select c.member_id, 'PENALTY', c.amount,
       case c.type
         when 'NO_SHOW' then 'Penale mancata presentazione'
         when 'LATE_CANCELLATION' then 'Penale disdetta tardiva'
         else 'Penale'
       end,
       c.booking_id, c.settled_by, c.created_at
from charges c
where c.status = 'DUE'
  and not exists (
    select 1 from ledger_entries le
    where le.booking_id = c.booking_id and le.kind = 'PENALTY'
  );

-- 6) Notifica al socio quando gli viene addebitata una penale ----------------
-- (creata DOPO la migrazione, per non notificare le penali storiche)
drop trigger if exists charges_notify on charges;
create or replace function notify_ledger_charge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.kind = 'PENALTY' then
    perform enqueue_notification(
      new.member_id, 'CHARGE', 'Nuovo addebito',
      coalesce(new.description, 'Penale') || ': € ' || to_char(new.amount, 'FM999990.00'),
      jsonb_build_object('amount', new.amount, 'url', '/account'),
      new.booking_id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists ledger_notify on ledger_entries;
create trigger ledger_notify
  after insert on ledger_entries
  for each row execute function notify_ledger_charge();

-- 7) Riepilogo staff: "da incassare" calcolato dal conto (saldi negativi) ----
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
  v_tz    text;
  v_today date;
  v_min   smallint;
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
    (select count(*) from (
        select member_id, sum(ledger_signed(kind, amount)) as bal
        from ledger_entries group by member_id
      ) t where t.bal < 0)::int,
    (select coalesce(sum(-t.bal), 0) from (
        select member_id, sum(ledger_signed(kind, amount)) as bal
        from ledger_entries group by member_id
      ) t where t.bal < 0),
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
