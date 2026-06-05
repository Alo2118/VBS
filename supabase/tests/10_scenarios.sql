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

-- 7) Disdetta tardiva (giorno diverso) -> addebito = prezzo del campo
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
  -- simulo: prenotata ieri e termine già scaduto (disdetta in un altro giorno)
  update bookings
     set free_cancellation_deadline = now() - interval '1 hour',
         created_at = now() - interval '1 day'
   where id = v_b.id;
  perform cancel_booking(v_b.id);
  select amount into v_amount from ledger_entries
   where booking_id = v_b.id and kind = 'PENALTY';
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
  select amount into v_amount from ledger_entries
   where booking_id = v_b.id and kind = 'PENALTY';
  if v_amount is null or v_amount <> v_b.price then
    raise exception 'TEST 8 FALLITO: addebito no-show atteso %, ottenuto %', v_b.price, v_amount;
  end if;
  raise notice 'TEST 8 OK: no-show, addebito % EUR', v_amount;
end $$;

-- 9) Storno (WAIVER) sul conto: azzera il dovuto; un socio non può stornare
do $$
declare v_bal numeric;
begin
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', false); -- STAFF/ADMIN
  perform post_account_charge('33333333-3333-3333-3333-333333333333', 'PENALTY', 10, 'Penale');
  perform post_account_payment('33333333-3333-3333-3333-333333333333', 10, null::pay_method, 'WAIVER', 'Errore staff');
  select account_balance('33333333-3333-3333-3333-333333333333') into v_bal;
  if v_bal <> 0 then
    raise exception 'TEST 9 FALLITO: lo storno non azzera il dovuto (%)', v_bal;
  end if;
  -- un socio non può stornare
  begin
    perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
    perform post_account_payment('33333333-3333-3333-3333-333333333333', 5, null::pay_method, 'WAIVER', 'x');
    raise exception 'TEST 9 FALLITO: un socio non deve poter stornare';
  exception when sqlstate 'P0001' then null;
  end;
  raise notice 'TEST 9 OK: storno sul conto, solo staff';
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
  select count(*) into v_n from ledger_entries where booking_id = v_b.id and kind = 'PENALTY';
  if v_n <> 1 then raise exception 'TEST 15 FALLITO: addebito no-show mancante'; end if;
  perform undo_no_show(v_b.id);
  select status into v_status from bookings where id = v_b.id;
  select count(*) into v_n from ledger_entries where booking_id = v_b.id and kind = 'PENALTY';
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
  if exists (select 1 from ledger_entries where booking_id = v_b1.id and kind = 'PENALTY') then
    raise exception 'TEST 16 FALLITO: addebito generato senza penale';
  end if;
  -- lo slot è di nuovo prenotabile (anti-overbooking lo consente)
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
  select * into v_b2 from create_booking(v_court, v_start);
  -- con penale
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
  perform staff_cancel_booking(v_b2.id, true);
  select amount into v_amount from ledger_entries where booking_id = v_b2.id and kind = 'PENALTY';
  if v_amount is null or v_amount <> v_b2.price then
    raise exception 'TEST 16 FALLITO: penale attesa %, ottenuta %', v_b2.price, v_amount;
  end if;
  raise notice 'TEST 16 OK: libera campo senza/con penale, slot riprenotabile';
end $$;

-- 17) Finestra di tolleranza: entro = gratuita, oltre = addebito
do $$
declare v_court uuid; v_start timestamptz; v_b bookings%rowtype; v_n int;
begin
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
  select id into v_court from courts order by name desc limit 1; -- 'Verde'

  -- (a) prenotata ORA, termine già scaduto -> entro tolleranza -> gratuita
  v_start := ((current_date + 9)::timestamp + time '13:00') at time zone 'Europe/Rome';
  select * into v_b from create_booking(v_court, v_start);
  update bookings set free_cancellation_deadline = now() - interval '1 hour' where id = v_b.id;
  perform cancel_booking(v_b.id);
  select count(*) into v_n from ledger_entries where booking_id = v_b.id and kind = 'PENALTY';
  if v_n <> 0 then
    raise exception 'TEST 17a FALLITO: addebito entro la tolleranza (%)', v_n;
  end if;

  -- (b) prenotata 3 ore fa (oltre i 120') e termine scaduto -> addebito
  v_start := ((current_date + 9)::timestamp + time '15:00') at time zone 'Europe/Rome';
  select * into v_b from create_booking(v_court, v_start);
  update bookings
     set free_cancellation_deadline = now() - interval '1 hour',
         created_at = now() - interval '3 hours'
   where id = v_b.id;
  perform cancel_booking(v_b.id);
  select count(*) into v_n from ledger_entries where booking_id = v_b.id and kind = 'PENALTY';
  if v_n <> 1 then
    raise exception 'TEST 17b FALLITO: penale attesa oltre la tolleranza (%)', v_n;
  end if;

  raise notice 'TEST 17 OK: tolleranza disdetta (entro gratis, oltre con penale)';
end $$;

-- 18) Annullamento in blocco per chiusura (pioggia) + notifiche ai giocatori
do $$
declare
  v_court uuid; v_start timestamptz; v_b bookings%rowtype;
  v_closure uuid; v_n int; v_status booking_status; v_reason text;
begin
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
  select id into v_court from courts order by name limit 1;            -- 'Bianco'
  v_start := ((current_date + 10)::timestamp + time '14:00') at time zone 'Europe/Rome';
  select * into v_b from create_booking(v_court, v_start);
  -- aggiungo un secondo socio nella rosa
  insert into booking_players (booking_id, member_id, added_by)
  values (v_b.id, '33333333-3333-3333-3333-333333333333',
          '22222222-2222-2222-2222-222222222222');

  -- chiusura del campo sulla fascia dello slot
  insert into closures (court_id, start_at, end_at, reason)
  values (v_court, v_start - interval '1 hour', v_start + interval '2 hours', 'pioggia')
  returning id into v_closure;

  -- staff esegue l'annullamento in blocco
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
  select cancel_bookings_for_closure(v_closure) into v_n;
  if v_n <> 1 then
    raise exception 'TEST 18 FALLITO: attese 1 prenotazione annullata, ottenute %', v_n;
  end if;

  select status, cancellation_reason into v_status, v_reason from bookings where id = v_b.id;
  if v_status <> 'CANCELLED' or v_reason <> 'pioggia' then
    raise exception 'TEST 18 FALLITO: stato % motivo %', v_status, v_reason;
  end if;

  -- una notifica di annullamento per ciascun giocatore (intestatario + rosa) = 2
  select count(*) into v_n from notifications where booking_id = v_b.id and type = 'BOOKING_CANCELLED';
  if v_n <> 2 then
    raise exception 'TEST 18 FALLITO: attese 2 notifiche, ottenute %', v_n;
  end if;
  select count(*) into v_n from ledger_entries where booking_id = v_b.id and kind = 'PENALTY';
  if v_n <> 0 then
    raise exception 'TEST 18 FALLITO: nessuna penale attesa per chiusura (%)', v_n;
  end if;

  raise notice 'TEST 18 OK: chiusura annulla in blocco e avvisa i giocatori';
end $$;

-- 19) Nuova registrazione -> avviso a chi può approvare (staff)
do $$
declare v_new uuid := '99999999-9999-9999-9999-999999999999'; v_n int;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_new, 'nuovo@test.it', '{"full_name":"Nuovo Socio"}');
  -- il trigger di registrazione crea il member PENDING e avvisa lo staff
  select count(*) into v_n
  from notifications
  where type = 'NEW_MEMBER'
    and member_id = '11111111-1111-1111-1111-111111111111'   -- STAFF (ADMIN)
    and (data ->> 'memberId') = v_new::text;
  if v_n <> 1 then
    raise exception 'TEST 19 FALLITO: attesa 1 notifica allo staff, ottenute %', v_n;
  end if;
  raise notice 'TEST 19 OK: nuova registrazione avvisa lo staff';
end $$;

-- 20) Disdetta di un socio -> avviso agli ALTRI giocatori (non a chi disdice)
do $$
declare
  v_court uuid; v_start timestamptz; v_b bookings%rowtype; v_n int;
begin
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
  select id into v_court from courts order by name limit 1 offset 1;       -- 'Giallo'
  v_start := ((current_date + 12)::timestamp + time '14:00') at time zone 'Europe/Rome';
  select * into v_b from create_booking(v_court, v_start);
  -- secondo giocatore in rosa
  insert into booking_players (booking_id, member_id, added_by)
  values (v_b.id, '33333333-3333-3333-3333-333333333333',
          '22222222-2222-2222-2222-222222222222');

  -- il capogruppo (SOCIO) disdice
  perform cancel_booking(v_b.id);

  -- l'altro giocatore (PEND) riceve l'avviso, il capogruppo no
  select count(*) into v_n from notifications
   where booking_id = v_b.id and member_id = '33333333-3333-3333-3333-333333333333';
  if v_n <> 1 then
    raise exception 'TEST 20 FALLITO: atteso 1 avviso all''altro giocatore, ottenuti %', v_n;
  end if;
  select count(*) into v_n from notifications
   where booking_id = v_b.id and member_id = '22222222-2222-2222-2222-222222222222';
  if v_n <> 0 then
    raise exception 'TEST 20 FALLITO: chi disdice non deve essere avvisato (%)', v_n;
  end if;
  raise notice 'TEST 20 OK: la disdetta avvisa gli altri giocatori, non chi disdice';
end $$;

-- 21) Socio approvato -> avviso al socio
do $$
declare v_n int;
begin
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', false);
  perform validate_member('99999999-9999-9999-9999-999999999999', 'AICS-999',
                          current_date, current_date + 365);
  select count(*) into v_n from notifications
   where type = 'MEMBER_APPROVED' and member_id = '99999999-9999-9999-9999-999999999999';
  if v_n <> 1 then
    raise exception 'TEST 21 FALLITO: atteso 1 avviso di approvazione, ottenuti %', v_n;
  end if;
  raise notice 'TEST 21 OK: approvazione tessera avvisa il socio';
end $$;

-- 22) Aggiunto alla rosa -> avviso al giocatore (non a chi lo aggiunge)
do $$
declare v_court uuid; v_bid uuid := gen_random_uuid(); v_n int;
begin
  perform set_config('test.uid', '22222222-2222-2222-2222-222222222222', false);
  select id into v_court from courts order by name limit 1 offset 2;        -- 'Verde'
  -- prenotazione inserita direttamente (evita i limiti finestra/attive del socio)
  insert into bookings (id, court_id, member_id, start_at, end_at, price,
                        per_head_price, free_cancellation_deadline, status)
  values (v_bid, v_court, '22222222-2222-2222-2222-222222222222',
          now() + interval '1 day', now() + interval '1 day' + interval '1 hour',
          0, 0, now() + interval '1 day', 'CONFIRMED');
  perform add_player(v_bid, '99999999-9999-9999-9999-999999999999');        -- ora VALID
  select count(*) into v_n from notifications
   where type = 'ADDED_TO_GAME' and member_id = '99999999-9999-9999-9999-999999999999'
     and booking_id = v_bid;
  if v_n <> 1 then
    raise exception 'TEST 22 FALLITO: atteso 1 avviso al giocatore aggiunto, ottenuti %', v_n;
  end if;
  -- chi aggiunge (capogruppo) non riceve avviso "aggiunto"
  select count(*) into v_n from notifications
   where type = 'ADDED_TO_GAME' and member_id = '22222222-2222-2222-2222-222222222222'
     and booking_id = v_bid;
  if v_n <> 0 then
    raise exception 'TEST 22 FALLITO: il capogruppo non deve essere avvisato (%)', v_n;
  end if;

  -- 23) Penale sul conto -> avviso al socio addebitato
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', false); -- STAFF
  perform post_account_charge('22222222-2222-2222-2222-222222222222', 'PENALTY', 10, 'Penale', v_bid);
  select count(*) into v_n from notifications
   where type = 'CHARGE' and member_id = '22222222-2222-2222-2222-222222222222'
     and booking_id = v_bid;
  if v_n <> 1 then
    raise exception 'TEST 23 FALLITO: atteso 1 avviso di addebito, ottenuti %', v_n;
  end if;
  raise notice 'TEST 22/23 OK: rosa e addebito avvisano il socio giusto';
end $$;

-- 24) Promemoria partita -> avviso ai giocatori degli slot imminenti (dedup)
do $$
declare v_court uuid; v_bid uuid := gen_random_uuid(); v_n int;
begin
  select id into v_court from courts order by name limit 1;                  -- 'Bianco'
  insert into bookings (id, court_id, member_id, start_at, end_at, price,
                        per_head_price, free_cancellation_deadline, status)
  values (v_bid, v_court, '99999999-9999-9999-9999-999999999999',
          now() + interval '2 hours', now() + interval '3 hours', 0, 0, now(), 'CONFIRMED');
  insert into booking_players (booking_id, member_id) values
    (v_bid, '99999999-9999-9999-9999-999999999999'),
    (v_bid, '33333333-3333-3333-3333-333333333333');

  select enqueue_match_reminders(3) into v_n;
  if v_n <> 2 then
    raise exception 'TEST 24 FALLITO: attesi 2 promemoria, ottenuti %', v_n;
  end if;
  -- idempotenza: una seconda esecuzione non duplica
  select enqueue_match_reminders(3) into v_n;
  if v_n <> 0 then
    raise exception 'TEST 24 FALLITO: i promemoria non devono duplicarsi (%)', v_n;
  end if;
  raise notice 'TEST 24 OK: promemoria partita ai giocatori, senza duplicati';
end $$;

-- 25) Conto del socio (ledger): addebiti, incasso col metodo, saldo
do $$
declare v_bal numeric; v_n int;
begin
  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', false); -- STAFF
  -- socio 999 (conto pulito) per verificare i saldi in isolamento
  perform post_account_charge('99999999-9999-9999-9999-999999999999', 'BAR', 5, 'Birra');
  perform post_account_charge('99999999-9999-9999-9999-999999999999', 'COURT', 8, 'Quota campo');
  perform post_account_payment('99999999-9999-9999-9999-999999999999', 10, 'CASH');

  select account_balance('99999999-9999-9999-9999-999999999999') into v_bal;
  if v_bal <> -3 then
    raise exception 'TEST 25 FALLITO: saldo atteso -3, ottenuto %', v_bal;
  end if;

  select count(*) into v_n from list_member_accounts()
   where member_id = '99999999-9999-9999-9999-999999999999' and balance = -3;
  if v_n <> 1 then
    raise exception 'TEST 25 FALLITO: conto non in elenco cassa (%)', v_n;
  end if;

  -- un socio non può vedere il saldo di un altro
  begin
    perform set_config('test.uid', '33333333-3333-3333-3333-333333333333', false);
    perform account_balance('99999999-9999-9999-9999-999999999999');
    raise exception 'TEST 25 FALLITO: un socio non deve leggere il conto altrui';
  exception when sqlstate 'P0001' then null;
  end;

  raise notice 'TEST 25 OK: conto socio, metodo pagamento e saldo';
end $$;

-- 26) Quota campo automatica: divisa tra i giocatori, idempotente
do $$
declare v_court uuid; v_bid uuid := gen_random_uuid(); v_n int; v_sum numeric;
begin
  select id into v_court from courts order by name limit 1;
  insert into bookings (id, court_id, member_id, start_at, end_at, price,
                        per_head_price, free_cancellation_deadline, status)
  values (v_bid, v_court, '99999999-9999-9999-9999-999999999999',
          now() + interval '2 days', now() + interval '2 days' + interval '1 hour',
          12, 5, now(), 'CONFIRMED');
  insert into booking_players (booking_id, member_id) values
    (v_bid, '99999999-9999-9999-9999-999999999999'),
    (v_bid, '33333333-3333-3333-3333-333333333333'),
    (v_bid, '22222222-2222-2222-2222-222222222222');

  perform set_config('test.uid', '11111111-1111-1111-1111-111111111111', false); -- STAFF
  select post_court_fees(v_bid) into v_n;
  if v_n <> 3 then
    raise exception 'TEST 26 FALLITO: attesi 3 addebiti campo, ottenuti %', v_n;
  end if;
  select count(*), coalesce(sum(amount), 0) into v_n, v_sum
   from ledger_entries where booking_id = v_bid and kind = 'COURT';
  if v_n <> 3 or v_sum <> 12 then
    raise exception 'TEST 26 FALLITO: 3 quote da 4 (tot 12), ottenuto count=% sum=%', v_n, v_sum;
  end if;
  -- idempotente: seconda chiamata non duplica
  select post_court_fees(v_bid) into v_n;
  if v_n <> 0 then
    raise exception 'TEST 26 FALLITO: quota campo duplicata (%)', v_n;
  end if;
  raise notice 'TEST 26 OK: quota campo divisa tra i giocatori';
end $$;

select 'TUTTI I TEST SUPERATI' as risultato;
