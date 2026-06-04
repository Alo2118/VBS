-- VBS — Migliorie: contatto obbligatorio (telefono raccolto in registrazione),
-- disponibilità settimanale e riepilogo per lo staff (dashboard).
-- Da applicare nello SQL Editor di Supabase dopo le migrazioni precedenti.

-- 1) Registrazione: cattura anche il telefono dai metadati dell'utente --------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.members (id, email, full_name, phone, membership_status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    'PENDING'
  );
  return new;
end;
$$;

-- 2) Almeno un contatto (email o telefono) per ogni socio ---------------------
-- NOT VALID: non blocca eventuali righe storiche; vale per insert/update nuovi.
alter table members drop constraint if exists members_contact_required;
alter table members
  add constraint members_contact_required
  check (coalesce(nullif(email, ''), nullif(phone, '')) is not null) not valid;

-- 3) Disponibilità su 7 giorni in un'unica chiamata (vista calendario) --------
-- Riusa get_availability per ogni giorno; aggiunge la colonna "day".
create or replace function get_week_availability(p_start date)
returns table (
  day        date,
  court_id   uuid,
  court_name text,
  start_at   timestamptz,
  end_at     timestamptz,
  price      numeric,
  status     text
)
language sql
stable
security definer
set search_path = public
as $$
  select (p_start + d)::date as day,
         g.court_id, g.court_name, g.start_at, g.end_at, g.price, g.status
  from generate_series(0, 6) as d
  cross join lateral get_availability((p_start + d)::date) as g;
$$;

grant execute on function get_week_availability(date) to authenticated;

-- 4) Riepilogo per lo staff (dashboard) --------------------------------------
create or replace function get_admin_summary()
returns table (
  bookings_today     int,
  bookings_upcoming  int,
  pending_members    int,
  charges_due_count  int,
  charges_due_amount numeric,
  expiring_soon      int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz    text;
  v_today date;
begin
  if not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select timezone into v_tz from booking_policy where id = 1;
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
         and m.membership_end_date between v_today and (v_today + 30))::int;
end;
$$;

grant execute on function get_admin_summary() to authenticated;
