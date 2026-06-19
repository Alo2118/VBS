-- VBS — Disponibilità slot (giorno × campo × orario).
-- SECURITY DEFINER: calcola gli slot da opening_rules/price_rules/closures e li
-- marca FREE/TAKEN/UNAVAILABLE SENZA esporre le prenotazioni altrui (privacy +
-- RLS): il socio vede l'occupazione, non chi ha prenotato.

create or replace function get_availability(p_date date)
returns table (
  court_id   uuid,
  court_name text,
  start_at   timestamptz,
  end_at     timestamptz,
  price      numeric,
  status     text
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
    end as status
  from slots s
  order by s.start_local, s.court_name;
end;
$$;

grant execute on function get_availability(date) to authenticated;
