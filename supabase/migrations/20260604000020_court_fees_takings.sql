-- VBS — Quota campo automatica sul conto + incassi del giorno per metodo.
-- post_court_fees: divide il prezzo del campo tra i giocatori e lo addebita
-- sul conto di ciascuno (stessa regola di perPlayerShare). Idempotente.
-- takings_today: totali incassati oggi per contanti / Satispay (per la dashboard).
-- Da applicare nello SQL Editor di Supabase dopo le migrazioni precedenti.

create or replace function post_court_fees(p_booking_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_b      bookings%rowtype;
  v_thr    smallint;
  v_n      int;
  v_share  numeric;
  v_count  int := 0;
  v_pl     record;
begin
  if not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_b from bookings where id = p_booking_id;
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Già addebitata? non duplicare.
  if exists (select 1 from ledger_entries where booking_id = p_booking_id and kind = 'COURT') then
    return 0;
  end if;

  select per_head_threshold into v_thr from booking_policy where id = 1;
  select count(*) into v_n from booking_players where booking_id = p_booking_id;
  if v_n = 0 then
    v_n := 1; -- nessuna rosa: addebita l'intestatario
  end if;

  -- Stessa regola di perPlayerShare: oltre soglia quota fissa a testa, altrimenti prezzo/numero.
  if v_n > v_thr then
    v_share := round(v_b.per_head_price, 2);
  else
    v_share := round(v_b.price / v_n, 2);
  end if;

  if v_share <= 0 then
    return 0;
  end if;

  for v_pl in
    select member_id from booking_players where booking_id = p_booking_id
    union
    select v_b.member_id where not exists (select 1 from booking_players where booking_id = p_booking_id)
  loop
    insert into ledger_entries (member_id, kind, amount, description, booking_id, created_by)
    values (v_pl.member_id, 'COURT', v_share, 'Quota campo', p_booking_id, v_actor);
    v_count := v_count + 1;
  end loop;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_actor, 'COURT_FEES', 'booking', p_booking_id,
          jsonb_build_object('players', v_count, 'share', v_share));

  return v_count;
end;
$$;

-- Incassi di oggi per metodo (PAYMENT + TOPUP) -------------------------------
create or replace function takings_today()
returns table (cash numeric, satispay numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz    text;
  v_today date;
begin
  if not can_handle_payments() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  select timezone into v_tz from booking_policy where id = 1;
  v_today := (now() at time zone v_tz)::date;

  return query
  select
    coalesce(sum(amount) filter (where method = 'CASH'), 0),
    coalesce(sum(amount) filter (where method = 'SATISPAY'), 0)
  from ledger_entries
  where kind in ('PAYMENT', 'TOPUP')
    and (created_at at time zone v_tz)::date = v_today;
end;
$$;

grant execute on function post_court_fees(uuid) to authenticated;
grant execute on function takings_today() to authenticated;
