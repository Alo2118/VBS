-- Scenari di test delle regole di business (eseguiti dopo migrazioni + seed).
-- Ogni blocco fallisce con RAISE EXCEPTION se l'esito non è quello atteso:
-- un'esecuzione pulita = tutti i test verdi.

\set STAFF '11111111-1111-1111-1111-111111111111'
\set SOCIO '22222222-2222-2222-2222-222222222222'
\set PEND  '33333333-3333-3333-3333-333333333333'

-- Utenti auth (il trigger crea i profili members in stato PENDING).
insert into auth.users (id, email, raw_user_meta_data) values
  (:'STAFF', 'staff@test.it', '{"full_name":"Staff Uno"}'),
  (:'SOCIO', 'socio@test.it', '{"full_name":"Mario Rossi"}'),
  (:'PEND',  'pend@test.it',  '{"full_name":"Pendente"}');

-- Promuovo lo staff ad ADMIN (gli altri restano PENDING).
update members set role = 'ADMIN', membership_status = 'VALID' where id = :'STAFF';

-- 1) Validazione socio da parte dello staff -> VALID
do $$
declare v_status membership_status;
begin
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
  perform validate_member(
    '22222222-2222-2222-2222-222222222222', 'AICS-123',
    current_date, current_date + 365
  );
  select membership_status into v_status from members
   where id = '22222222-2222-2222-2222-222222222222';
  if v_status <> 'VALID' then
    raise exception 'TEST 1 FALLITO: atteso VALID, ottenuto %', v_status;
  end if;
  raise notice 'TEST 1 OK: socio validato (VALID)';
end $$;

-- 2) Prenotazione valida del socio (domani 18:00)
do $$
declare
  v_court uuid;
  v_start timestamptz;
  v_b bookings%rowtype;
begin
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
  select id into v_court from courts order by name limit 1;
  v_start := ((current_date + 1)::timestamp + time '18:00') at time zone 'Europe/Rome';
  select * into v_b from create_booking(v_court, v_start);
  if v_b.status <> 'CONFIRMED' then
    raise exception 'TEST 2 FALLITO: prenotazione non confermata';
  end if;
  -- prezzo prime-time atteso 16.00 (seed)
  if v_b.price <> 16.00 then
    raise exception 'TEST 2 FALLITO: prezzo atteso 16.00, ottenuto %', v_b.price;
  end if;
  raise notice 'TEST 2 OK: prenotazione creata, prezzo % EUR', v_b.price;
end $$;

-- 3) Doppia prenotazione stesso slot -> SLOT_TAKEN
do $$
declare
  v_court uuid;
  v_start timestamptz;
begin
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
  select id into v_court from courts order by name limit 1;
  v_start := ((current_date + 1)::timestamp + time '18:00') at time zone 'Europe/Rome';
  begin
    perform create_booking(v_court, v_start);
    raise exception 'TEST 3 FALLITO: doppia prenotazione accettata';
  exception when others then
    if sqlerrm <> 'SLOT_TAKEN' then
      raise exception 'TEST 3 FALLITO: atteso SLOT_TAKEN, ottenuto %', sqlerrm;
    end if;
  end;
  raise notice 'TEST 3 OK: anti-overbooking (SLOT_TAKEN)';
end $$;

-- 4) Socio non valido (PENDING) non può prenotare -> MEMBERSHIP_NOT_VALID
do $$
declare
  v_court uuid;
  v_start timestamptz;
begin
  perform set_config('test.uid', '33333333-3333-3333-3333-333333333333', false);
  select id into v_court from courts order by name limit 1;
  v_start := ((current_date + 2)::timestamp + time '10:00') at time zone 'Europe/Rome';
  begin
    perform create_booking(v_court, v_start);
    raise exception 'TEST 4 FALLITO: socio PENDING ha prenotato';
  exception when others then
    if sqlerrm <> 'MEMBERSHIP_NOT_VALID' then
      raise exception 'TEST 4 FALLITO: atteso MEMBERSHIP_NOT_VALID, ottenuto %', sqlerrm;
    end if;
  end;
  raise notice 'TEST 4 OK: tessera non valida bloccata';
end $$;

-- 5) get_availability marca lo slot prenotato come TAKEN
do $$
declare v_taken int;
begin
  select count(*) into v_taken
  from get_availability((current_date + 1)::date)
  where status = 'TAKEN';
  if v_taken < 1 then
    raise exception 'TEST 5 FALLITO: nessuno slot TAKEN trovato';
  end if;
  raise notice 'TEST 5 OK: disponibilità mostra % slot occupati', v_taken;
end $$;

-- 6) Disdetta entro i termini -> gratuita (nessun addebito)
do $$
declare
  v_court uuid;
  v_start timestamptz;
  v_b bookings%rowtype;
  v_charges int;
begin
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
  select id into v_court from courts order by name limit 1;
  v_start := ((current_date + 5)::timestamp + time '10:00') at time zone 'Europe/Rome';
  select * into v_b from create_booking(v_court, v_start);
  perform cancel_booking(v_b.id);
  select count(*) into v_charges from charges where booking_id = v_b.id;
  if v_charges <> 0 then
    raise exception 'TEST 6 FALLITO: addebito generato su disdetta in tempo';
  end if;
  raise notice 'TEST 6 OK: disdetta gratuita, nessun addebito';
end $$;

-- 7) Disdetta tardiva -> addebito = prezzo del campo
do $$
declare
  v_court uuid;
  v_start timestamptz;
  v_b bookings%rowtype;
  v_amount numeric;
begin
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
  select id into v_court from courts order by name limit 1;
  v_start := ((current_date + 6)::timestamp + time '10:00') at time zone 'Europe/Rome';
  select * into v_b from create_booking(v_court, v_start);
  -- forzo lo scadere del termine di disdetta (simula "oltre il giorno prima")
  update bookings set free_cancellation_deadline = now() - interval '1 hour' where id = v_b.id;
  perform cancel_booking(v_b.id);
  select amount into v_amount from charges
   where booking_id = v_b.id and type = 'LATE_CANCELLATION';
  if v_amount is null or v_amount <> v_b.price then
    raise exception 'TEST 7 FALLITO: addebito atteso %, ottenuto %', v_b.price, v_amount;
  end if;
  raise notice 'TEST 7 OK: disdetta tardiva, addebito % EUR', v_amount;
end $$;

-- 8) No-show (staff) -> addebito = prezzo del campo
do $$
declare
  v_court uuid;
  v_start timestamptz;
  v_b bookings%rowtype;
  v_amount numeric;
begin
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
  select id into v_court from courts order by name limit 1;
  v_start := ((current_date + 7)::timestamp + time '11:00') at time zone 'Europe/Rome';
  select * into v_b from create_booking(v_court, v_start);
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
  perform mark_no_show(v_b.id);
  select amount into v_amount from charges
   where booking_id = v_b.id and type = 'NO_SHOW';
  if v_amount is null or v_amount <> v_b.price then
    raise exception 'TEST 8 FALLITO: addebito no-show atteso %, ottenuto %', v_b.price, v_amount;
  end if;
  raise notice 'TEST 8 OK: no-show, addebito % EUR', v_amount;
end $$;

-- 9) Esonero addebito: motivazione obbligatoria + solo Manager/Admin
do $$
declare v_charge uuid; v_status charge_status;
begin
  select id into v_charge from charges where status = 'DUE' limit 1;
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
  begin
    perform waive_charge(v_charge, '');
    raise exception 'TEST 9 FALLITO: esonero senza motivazione accettato';
  exception when others then
    if sqlerrm <> 'NOT_AUTHORIZED' then raise; end if;
  end;
  perform waive_charge(v_charge, 'impianto chiuso per maltempo');
  select status into v_status from charges where id = v_charge;
  if v_status <> 'WAIVED' then
    raise exception 'TEST 9 FALLITO: addebito non esonerato';
  end if;
  raise notice 'TEST 9 OK: esonero con motivazione';
end $$;

select 'TUTTI I TEST SUPERATI' as risultato;
