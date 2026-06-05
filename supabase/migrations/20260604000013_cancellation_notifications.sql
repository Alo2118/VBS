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
