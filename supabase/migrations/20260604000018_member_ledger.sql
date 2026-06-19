-- VBS — Conto del socio (libro mastro / ledger) per pagamenti e consumazioni.
-- Un'unica tabella di movimenti per socio:
--   DARE (il socio deve):  COURT (quota campo), BAR (consumazioni), PENALTY (penali)
--   AVERE (entra):         PAYMENT (incasso), TOPUP (ricarica prepagata), WAIVER (storno)
-- Saldo = AVERE - DARE. Negativo = deve; positivo = ha credito prepagato.
-- I pagamenti registrano il metodo: contanti o Satispay.
-- Da applicare nello SQL Editor di Supabase dopo le migrazioni precedenti.

do $$ begin
  if not exists (select 1 from pg_type where typname = 'ledger_kind') then
    create type ledger_kind as enum ('COURT','BAR','PENALTY','PAYMENT','TOPUP','WAIVER','ADJUST');
  end if;
  if not exists (select 1 from pg_type where typname = 'pay_method') then
    create type pay_method as enum ('CASH','SATISPAY');
  end if;
end $$;

create table if not exists ledger_entries (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references members (id) on delete cascade,
  kind        ledger_kind not null,
  amount      numeric(10, 2) not null check (amount >= 0),
  method      pay_method,                          -- solo per PAYMENT/TOPUP
  description text,
  booking_id  uuid references bookings (id) on delete set null,
  created_by  uuid references members (id),
  created_at  timestamptz not null default now()
);
create index if not exists ledger_entries_member_idx on ledger_entries (member_id, created_at desc);

-- Chi può maneggiare cassa/bar: gestione + front desk + bar.
create or replace function can_handle_payments()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_role_name() in ('ADMIN','MANAGER','FRONT_DESK','BAR_STAFF'), false);
$$;

alter table ledger_entries enable row level security;
-- Il socio vede i propri movimenti; lo staff/cassa vede tutto. Scritture solo via funzioni.
drop policy if exists ledger_select on ledger_entries;
create policy ledger_select on ledger_entries
  for select using (member_id = auth.uid() or can_handle_payments());

-- Segno del movimento (DARE negativo, AVERE positivo).
create or replace function ledger_signed(p_kind ledger_kind, p_amount numeric)
returns numeric
language sql
immutable
as $$
  select case
    when p_kind in ('PAYMENT','TOPUP','WAIVER') then p_amount
    when p_kind in ('COURT','BAR','PENALTY')    then -p_amount
    else 0
  end;
$$;

-- Saldo del conto di un socio (negativo = deve; positivo = credito).
create or replace function account_balance(p_member uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_bal numeric;
begin
  if p_member <> auth.uid() and not can_handle_payments() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  select coalesce(sum(ledger_signed(kind, amount)), 0) into v_bal
  from ledger_entries where member_id = p_member;
  return v_bal;
end;
$$;

-- Addebito sul conto (DARE): quota campo, consumazione bar, penale.
create or replace function post_account_charge(
  p_member      uuid,
  p_kind        ledger_kind,
  p_amount      numeric,
  p_description text default null,
  p_booking     uuid default null
)
returns ledger_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row   ledger_entries%rowtype;
begin
  if not can_handle_payments() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_kind not in ('COURT','BAR','PENALTY') then
    raise exception 'INVALID_KIND' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  insert into ledger_entries (member_id, kind, amount, description, booking_id, created_by)
  values (p_member, p_kind, p_amount, p_description, p_booking, v_actor)
  returning * into v_row;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_actor, 'LEDGER_CHARGE', 'ledger', v_row.id, to_jsonb(v_row));

  return v_row;
end;
$$;

-- Incasso/ricarica sul conto (AVERE): registra il metodo (contanti/Satispay).
create or replace function post_account_payment(
  p_member      uuid,
  p_amount      numeric,
  p_method      pay_method,
  p_kind        ledger_kind default 'PAYMENT',
  p_description text default null,
  p_booking     uuid default null
)
returns ledger_entries
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row   ledger_entries%rowtype;
begin
  if not can_handle_payments() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_kind not in ('PAYMENT','TOPUP','WAIVER') then
    raise exception 'INVALID_KIND' using errcode = 'P0001';
  end if;
  if p_kind in ('PAYMENT','TOPUP') and p_method is null then
    raise exception 'METHOD_REQUIRED' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
  end if;

  insert into ledger_entries (member_id, kind, amount, method, description, booking_id, created_by)
  values (p_member, p_kind, p_amount, p_method, p_description, p_booking, v_actor)
  returning * into v_row;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_actor, 'LEDGER_PAYMENT', 'ledger', v_row.id, to_jsonb(v_row));

  return v_row;
end;
$$;

-- Elenco conti per la Cassa (staff): saldo per socio (solo chi ha movimenti).
create or replace function list_member_accounts()
returns table (member_id uuid, full_name text, nickname text, balance numeric, last_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not can_handle_payments() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  return query
  select m.id, m.full_name, m.nickname,
         coalesce(sum(ledger_signed(le.kind, le.amount)), 0) as balance,
         max(le.created_at) as last_at
  from members m
  join ledger_entries le on le.member_id = m.id
  group by m.id, m.full_name, m.nickname
  order by max(le.created_at) desc;
end;
$$;

grant execute on function account_balance(uuid) to authenticated;
grant execute on function post_account_charge(uuid, ledger_kind, numeric, text, uuid) to authenticated;
grant execute on function post_account_payment(uuid, numeric, pay_method, ledger_kind, text, uuid) to authenticated;
grant execute on function list_member_accounts() to authenticated;
