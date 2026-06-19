-- VBS — Altri avvisi che riusano la coda `notifications`:
--   • socio approvato (validate_member)
--   • aggiunto alla rosa di una partita (add_player)
--   • nuovo addebito/penale (trigger su charges)
--   • funzione per i promemoria partita (schedulata via pg_cron, vedi 017/DEPLOY)
-- Da applicare nello SQL Editor di Supabase dopo le migrazioni precedenti.

-- 0) Helper generico: accoda una notifica a un singolo destinatario ----------
create or replace function enqueue_notification(
  p_member  uuid,
  p_type    text,
  p_title   text,
  p_body    text,
  p_data    jsonb default '{}'::jsonb,
  p_booking uuid default null
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into notifications (member_id, type, title, body, data, booking_id)
  values (p_member, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb), p_booking);
$$;

-- 1) Socio approvato: avvisa il socio quando la tessera diventa valida --------
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

  if v_m.membership_status = 'VALID' then
    perform enqueue_notification(
      v_m.id, 'MEMBER_APPROVED', 'Tessera approvata',
      'La tua tessera è valida fino al ' || to_char(p_end, 'DD/MM/YYYY') || '. Ora puoi prenotare i campi.',
      jsonb_build_object('url', '/bookings')
    );
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_actor, 'MEMBER_VALIDATE', 'member', v_m.id, to_jsonb(v_m));

  return v_m;
end;
$$;

-- 2) Aggiunto alla rosa: avvisa il giocatore (non se aggiunge se stesso) ------
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
  v_tz     text;
  v_court  text;
begin
  select * into v_b from bookings where id = p_booking_id;
  if not found or v_b.status <> 'CONFIRMED' or v_b.start_at <= now() then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_b.member_id <> v_actor and not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select membership_status into v_status from members where id = p_member_id;
  if v_status is distinct from 'VALID' then
    raise exception 'MEMBERSHIP_NOT_VALID' using errcode = 'P0001';
  end if;

  insert into booking_players (booking_id, member_id, added_by)
  values (p_booking_id, p_member_id, v_actor)
  on conflict do nothing;

  -- Avvisa solo se è stato davvero aggiunto e non è chi compie l'azione.
  if found and p_member_id <> v_actor then
    select timezone into v_tz from booking_policy where id = 1;
    select name into v_court from courts where id = v_b.court_id;
    perform enqueue_notification(
      p_member_id, 'ADDED_TO_GAME', 'Aggiunto a una partita',
      v_court || ' · ' || to_char(v_b.start_at at time zone v_tz, 'DD/MM HH24:MI'),
      jsonb_build_object('url', '/my-bookings'),
      p_booking_id
    );
  end if;
end;
$$;

-- 3) Nuovo addebito/penale: avvisa il socio addebitato -----------------------
create or replace function notify_charge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz    text;
  v_when  text;
  v_court text;
  v_label text;
begin
  select timezone into v_tz from booking_policy where id = 1;
  select c.name, to_char(b.start_at at time zone v_tz, 'DD/MM HH24:MI')
    into v_court, v_when
  from bookings b
  join courts c on c.id = b.court_id
  where b.id = new.booking_id;

  v_label := case new.type
    when 'LATE_CANCELLATION' then 'Penale disdetta tardiva'
    when 'NO_SHOW'           then 'Penale mancata presentazione'
    else 'Nuovo addebito'
  end;

  perform enqueue_notification(
    new.member_id, 'CHARGE', v_label,
    '€ ' || to_char(new.amount, 'FM999990.00')
          || coalesce(' — ' || v_court || ' ' || v_when, ''),
    jsonb_build_object('amount', new.amount, 'chargeType', new.type, 'url', '/my-bookings'),
    new.booking_id
  );
  return new;
end;
$$;

drop trigger if exists charges_notify on charges;
create trigger charges_notify
  after insert on charges
  for each row execute function notify_charge();

-- 4) Promemoria partita: accoda un avviso ai giocatori degli slot imminenti ---
-- Idempotente: salta chi ha già ricevuto il promemoria per quello slot.
-- Va richiamata periodicamente da pg_cron (vedi migrazione 017 / DEPLOY.md).
create or replace function enqueue_match_reminders(p_hours int default 3)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_n  int := 0;
begin
  select timezone into v_tz from booking_policy where id = 1;

  insert into notifications (member_id, type, title, body, data, booking_id)
  select distinct pl.mid,
         'MATCH_REMINDER',
         'Promemoria partita',
         co.name || ' · ' || to_char(b.start_at at time zone v_tz, 'DD/MM HH24:MI'),
         jsonb_build_object('url', '/my-bookings'),
         b.id
  from bookings b
  join courts co on co.id = b.court_id
  cross join lateral (
    select b.member_id as mid
    union
    select bp.member_id from booking_players bp where bp.booking_id = b.id
  ) pl
  where b.status = 'CONFIRMED'
    and b.start_at > now()
    and b.start_at <= now() + make_interval(hours => p_hours)
    and not exists (
      select 1 from notifications n
      where n.booking_id = b.id and n.member_id = pl.mid and n.type = 'MATCH_REMINDER'
    );

  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
