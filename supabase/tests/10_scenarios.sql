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

-- 10) Disponibilità settimanale: 7 giorni, con colonna "day" coerente
do $$
declare v_days int; v_taken int; v_day date;
begin
  select count(distinct day) into v_days
  from get_week_availability(current_date);
  if v_days <> 7 then
    raise exception 'TEST 10 FALLITO: attesi 7 giorni, ottenuti %', v_days;
  end if;
  -- la prenotazione confermata di domani deve risultare TAKEN nel giorno giusto
  select count(*) into v_taken from get_week_availability(current_date)
   where status = 'TAKEN' and day = (current_date + 1);
  if v_taken < 1 then
    raise exception 'TEST 10 FALLITO: slot TAKEN di domani non trovato nella settimana';
  end if;
  raise notice 'TEST 10 OK: settimana su 7 giorni, slot occupati coerenti';
end $$;

-- 11) Riepilogo staff: numeri per lo staff, vietato ai non-staff
do $$
declare v_pending int;
begin
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
  select pending_members into v_pending from get_admin_summary();
  if v_pending < 1 then
    raise exception 'TEST 11 FALLITO: atteso almeno 1 socio PENDING, ottenuto %', v_pending;
  end if;
  -- un socio normale non può vedere il riepilogo
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
  begin
    perform get_admin_summary();
    raise exception 'TEST 11 FALLITO: riepilogo accessibile a non-staff';
  exception when others then
    if sqlerrm <> 'NOT_AUTHORIZED' then
      raise exception 'TEST 11 FALLITO: atteso NOT_AUTHORIZED, ottenuto %', sqlerrm;
    end if;
  end;
  raise notice 'TEST 11 OK: riepilogo solo staff';
end $$;

-- 12) Rosa: capogruppo automatico, solo soci validi, capogruppo non rimovibile
do $$
declare v_court uuid; v_start timestamptz; v_b bookings%rowtype; v_n int;
begin
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
  select id into v_court from courts order by name limit 1;
  v_start := ((current_date + 3)::timestamp + time '10:00') at time zone 'Europe/Rome';
  select * into v_b from create_booking(v_court, v_start);
  select count(*) into v_n from booking_players where booking_id = v_b.id;
  if v_n <> 1 then raise exception 'TEST 12 FALLITO: capogruppo non in rosa (%)', v_n; end if;
  -- aggiungo un socio valido (lo staff è VALID)
  perform add_player(v_b.id, '11111111-1111-1111-1111-111111111111');
  select count(*) into v_n from booking_players where booking_id = v_b.id;
  if v_n <> 2 then raise exception 'TEST 12 FALLITO: attesi 2 in rosa, ottenuto %', v_n; end if;
  -- socio non valido (PENDING) rifiutato
  begin
    perform add_player(v_b.id, '33333333-3333-3333-3333-333333333333');
    raise exception 'TEST 12 FALLITO: aggiunto socio non valido';
  exception when others then
    if sqlerrm <> 'MEMBERSHIP_NOT_VALID' then raise; end if;
  end;
  -- il capogruppo non può essere rimosso dalla rosa
  begin
    perform remove_player(v_b.id, '22222222-2222-2222-2222-222222222222');
    raise exception 'TEST 12 FALLITO: capogruppo rimosso';
  exception when others then
    if sqlerrm <> 'NOT_AUTHORIZED' then raise; end if;
  end;
  raise notice 'TEST 12 OK: rosa con capogruppo, validità e vincoli';
end $$;

-- 13) Prenotazione fissa: genera le occorrenze settimanali fino alla data
do $$
declare v_court uuid; v_start timestamptz; v_res jsonb;
begin
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
  select id into v_court from courts order by name desc limit 1; -- 'Verde' (slot liberi)
  v_start := ((current_date + 1)::timestamp + time '09:00') at time zone 'Europe/Rome';
  select create_recurring_booking(
    v_court, v_start, (current_date + 21)::date,
    '22222222-2222-2222-2222-222222222222'
  ) into v_res;
  if (v_res->>'created')::int <> 3 then
    raise exception 'TEST 13 FALLITO: attese 3 occorrenze, ottenute %', v_res->>'created';
  end if;
  raise notice 'TEST 13 OK: prenotazione fissa, % occorrenze generate', v_res->>'created';
end $$;

-- 14) Ricerca soci validi per comporre la rosa
do $$
declare v_n int;
begin
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
  select count(*) into v_n from search_valid_members('');
  if v_n < 2 then
    raise exception 'TEST 14 FALLITO: attesi >= 2 soci validi, ottenuti %', v_n;
  end if;
  raise notice 'TEST 14 OK: ricerca soci validi (% trovati)', v_n;
end $$;

-- 15) Annulla no-show: torna CONFERMATA e rimuove l'addebito
do $$
declare v_court uuid; v_start timestamptz; v_b bookings%rowtype; v_n int; v_status booking_status;
begin
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
  select id into v_court from courts order by name limit 1;
  v_start := ((current_date + 7)::timestamp + time '11:00') at time zone 'Europe/Rome';
  select * into v_b from create_booking(v_court, v_start);
  -- lo staff segna no-show, poi lo annulla
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
  perform mark_no_show(v_b.id);
  select count(*) into v_n from charges where booking_id = v_b.id and type = 'NO_SHOW';
  if v_n <> 1 then raise exception 'TEST 15 FALLITO: addebito no-show mancante'; end if;
  perform undo_no_show(v_b.id);
  select status into v_status from bookings where id = v_b.id;
  select count(*) into v_n from charges where booking_id = v_b.id and type = 'NO_SHOW' and status = 'DUE';
  if v_status <> 'CONFIRMED' or v_n <> 0 then
    raise exception 'TEST 15 FALLITO: stato % / addebiti dovuti %', v_status, v_n;
  end if;
  raise notice 'TEST 15 OK: no-show annullato, addebito rimosso';
end $$;

-- 16) Libera campo (staff): senza penale libera lo slot; con penale addebita
do $$
declare v_court uuid; v_start timestamptz; v_b1 bookings%rowtype; v_b2 bookings%rowtype; v_amount numeric;
begin
  select id into v_court from courts order by name desc limit 1; -- 'Verde'
  v_start := ((current_date + 8)::timestamp + time '12:00') at time zone 'Europe/Rome';
  -- senza penale
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
  select * into v_b1 from create_booking(v_court, v_start);
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
  perform staff_cancel_booking(v_b1.id, false);
  if (select status from bookings where id = v_b1.id) <> 'CANCELLED' then
    raise exception 'TEST 16 FALLITO: campo non liberato';
  end if;
  if exists (select 1 from charges where booking_id = v_b1.id) then
    raise exception 'TEST 16 FALLITO: addebito generato senza penale';
  end if;
  -- lo slot è di nuovo prenotabile (anti-overbooking lo consente)
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
  select * into v_b2 from create_booking(v_court, v_start);
  -- con penale
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
  perform staff_cancel_booking(v_b2.id, true);
  select amount into v_amount from charges where booking_id = v_b2.id and type = 'LATE_CANCELLATION';
  if v_amount is null or v_amount <> v_b2.price then
    raise exception 'TEST 16 FALLITO: penale attesa %, ottenuta %', v_b2.price, v_amount;
  end if;
  raise notice 'TEST 16 OK: libera campo senza/con penale, slot riprenotabile';
end $$;

select 'TUTTI I TEST SUPERATI' as risultato;
