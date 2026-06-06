-- VBS — Correzione errori: storno di un movimento + modifica dati socio.
--
-- (A) reverse_ledger_entry: annulla un movimento errato del conto inserendo il
--     movimento OPPOSTO collegato all'originale (lo storico resta intatto, il
--     conto è append-only). Un ADDEBITO (COURT/BAR/PENALTY) si annulla con un
--     accredito WAIVER; un ACCREDITO (PAYMENT/TOPUP) si annulla con una
--     rettifica a debito ADJUST. Riservata a ADMIN/MANAGER, tracciata in audit.
--     NB: il vincolo amount >= 0 non consente importi negativi, quindi il segno
--     della rettifica è dato dal `kind` (vedi ledger_signed sotto).
--     NB2: takings_today conta gli incassi lordi del giorno e NON viene ridotto
--     da uno storno (il rimborso fisico si concilia a parte nella cassa).
-- (B) update_member_profile: permette allo staff di correggere nome, telefono e
--     soprannome di un socio dopo la registrazione (prima si potevano impostare
--     solo all'iscrizione), via funzione sicura (la UPDATE diretta è chiusa).
-- Da applicare nello SQL Editor di Supabase dopo le migrazioni precedenti.

-- Collega lo storno al movimento originale (anti doppio-storno) --------------
alter table ledger_entries
  add column if not exists reverses_id uuid references ledger_entries (id) on delete set null;

-- La rettifica (ADJUST) ora pesa come un addebito (riduce il credito). -------
-- Prima valeva 0 (tipo inutilizzabile); nessun dato esistente usa ADJUST.
create or replace function ledger_signed(p_kind ledger_kind, p_amount numeric)
returns numeric
language sql
immutable
as $$
  select case
    when p_kind in ('PAYMENT','TOPUP','WAIVER')         then p_amount
    when p_kind in ('COURT','BAR','PENALTY','ADJUST')   then -p_amount
    else 0
  end;
$$;

-- (A) Storno di un movimento -------------------------------------------------
create or replace function reverse_ledger_entry(p_entry_id uuid, p_reason text)
returns ledger_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_orig  ledger_entries%rowtype;
  v_kind  ledger_kind;
  v_row   ledger_entries%rowtype;
begin
  -- Come per il WAIVER, solo la gestione può stornare.
  if current_role_name() not in ('ADMIN','MANAGER') then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  select * into v_orig from ledger_entries where id = p_entry_id for update;
  if not found then
    raise exception 'CANNOT_REVERSE' using errcode = 'P0001';
  end if;

  -- Non si storna una rettifica/storno, né un movimento già stornato.
  if v_orig.kind in ('WAIVER','ADJUST') or v_orig.reverses_id is not null then
    raise exception 'CANNOT_REVERSE' using errcode = 'P0001';
  end if;
  if exists (select 1 from ledger_entries where reverses_id = p_entry_id) then
    raise exception 'CANNOT_REVERSE' using errcode = 'P0001';
  end if;

  v_kind := case
    when v_orig.kind in ('COURT','BAR','PENALTY') then 'WAIVER'
    when v_orig.kind in ('PAYMENT','TOPUP')       then 'ADJUST'
    else null
  end::ledger_kind;
  if v_kind is null then
    raise exception 'CANNOT_REVERSE' using errcode = 'P0001';
  end if;

  insert into ledger_entries (member_id, kind, amount, description, booking_id, created_by, reverses_id)
  values (v_orig.member_id, v_kind, v_orig.amount,
          'Storno: ' || coalesce(nullif(v_orig.description, ''), 'movimento')
            || coalesce(' — ' || nullif(btrim(p_reason), ''), ''),
          v_orig.booking_id, v_actor, v_orig.id)
  returning * into v_row;

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (v_actor, 'LEDGER_REVERSE', 'ledger', v_orig.id, to_jsonb(v_orig), to_jsonb(v_row));

  return v_row;
end;
$$;

grant execute on function reverse_ledger_entry(uuid, text) to authenticated;

-- (B) Modifica dati anagrafici del socio (staff) -----------------------------
create or replace function update_member_profile(
  p_member_id uuid,
  p_full_name text,
  p_phone     text default null,
  p_nickname  text default null
)
returns members
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  uuid := auth.uid();
  v_before jsonb;
  v_m      members%rowtype;
begin
  if not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_full_name is null or btrim(p_full_name) = '' then
    raise exception 'NAME_REQUIRED' using errcode = 'P0001';
  end if;

  select * into v_m from members where id = p_member_id;
  if not found then
    raise exception 'MEMBER_NOT_FOUND' using errcode = 'P0001';
  end if;
  v_before := to_jsonb(v_m);

  update members
     set full_name = btrim(p_full_name),
         phone     = nullif(btrim(coalesce(p_phone, '')), ''),
         nickname  = nullif(btrim(coalesce(p_nickname, '')), '')
   where id = p_member_id
   returning * into v_m;

  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (v_actor, 'MEMBER_UPDATE', 'member', v_m.id, v_before, to_jsonb(v_m));

  return v_m;
end;
$$;

grant execute on function update_member_profile(uuid, text, text, text) to authenticated;
