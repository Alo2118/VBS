-- VBS — Disponibilità: mostra il responsabile della prenotazione sullo slot
-- occupato (al posto del costo del campo, rimosso dall'interfaccia).
-- Aggiunge la colonna `booker` a get_availability / get_week_availability.
-- Da applicare nello SQL Editor di Supabase dopo le migrazioni precedenti.

drop function if exists get_availability(date);
create or replace function get_availability(p_date date)
returns table (
  court_id   uuid,
  court_name text,
  start_at   timestamptz,
  end_at     timestamptz,
  price      numeric,
  status     text,
  booker     text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text;
begin
  select timezone into v_tz from booking_policy where id = 1;

  return query
  with slots as (
    select distinct
      c.id   as court_id,
      c.name as court_name,
      gs     as start_local,
      gs + make_interval(mins => orr.slot_duration_minutes) as end_local
    from courts c
    join opening_rules orr
      on (orr.court_id = c.id or orr.court_id is null)
     and orr.active
     and orr.weekday = extract(dow from p_date)::int
    cross join lateral generate_series(
      p_date + orr.open_time,
      p_date + orr.close_time - make_interval(mins => orr.slot_duration_minutes),
      make_interval(mins => orr.slot_duration_minutes)
    ) as gs
    where c.active
  )
  select
    s.court_id,
    s.court_name,
    (s.start_local at time zone v_tz) as start_at,
    (s.end_local   at time zone v_tz) as end_at,
    price_for_slot(s.court_id, s.start_local at time zone v_tz) as price,
    case
      when (s.start_local at time zone v_tz) <= now() then 'UNAVAILABLE'
      when exists (
        select 1 from closures cl
        where (cl.court_id = s.court_id or cl.court_id is null)
          and tstzrange(cl.start_at, cl.end_at)
              && tstzrange(s.start_local at time zone v_tz, s.end_local at time zone v_tz)
      ) then 'UNAVAILABLE'
      when exists (
        select 1 from bookings b
        where b.court_id = s.court_id
          and b.status = 'CONFIRMED'
          and b.start_at = (s.start_local at time zone v_tz)
      ) then 'TAKEN'
      else 'FREE'
    end as status,
    -- Responsabile della prenotazione (solo per gli slot occupati).
    (
      select coalesce(nullif(m.full_name, ''), nullif(m.nickname, ''), 'Prenotato')
      from bookings b
      join members m on m.id = b.member_id
      where b.court_id = s.court_id
        and b.status = 'CONFIRMED'
        and b.start_at = (s.start_local at time zone v_tz)
      limit 1
    ) as booker
  from slots s
  order by s.start_local, s.court_name;
end;
$$;

drop function if exists get_week_availability(date);
create or replace function get_week_availability(p_start date)
returns table (
  day        date,
  court_id   uuid,
  court_name text,
  start_at   timestamptz,
  end_at     timestamptz,
  price      numeric,
  status     text,
  booker     text
)
language sql
stable
security definer
set search_path = public
as $$
  select (p_start + d)::date as day,
         g.court_id, g.court_name, g.start_at, g.end_at, g.price, g.status, g.booker
  from generate_series(0, 6) as d
  cross join lateral get_availability((p_start + d)::date) as g;
$$;

grant execute on function get_availability(date) to authenticated;
grant execute on function get_week_availability(date) to authenticated;
