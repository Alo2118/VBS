-- VBS — Gestione addebiti da parte dello staff: incasso ed esonero.

-- Incasso di un addebito (registrazione manuale: contante/Satispay/wallet) ----
create or replace function settle_charge(p_charge_id uuid)
returns charges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_c     charges%rowtype;
begin
  if not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  update charges
     set status = 'PAID', settled_at = now(), settled_by = v_actor
   where id = p_charge_id and status = 'DUE'
   returning * into v_c;

  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_actor, 'CHARGE_SETTLE', 'charge', v_c.id, to_jsonb(v_c));

  return v_c;
end;
$$;

-- Esonero di un addebito (solo Manager/Admin, motivazione obbligatoria) -------
create or replace function waive_charge(p_charge_id uuid, p_reason text)
returns charges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_c     charges%rowtype;
begin
  if current_role_name() not in ('ADMIN', 'MANAGER') then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;

  update charges
     set status = 'WAIVED', reason = p_reason, settled_at = now(), settled_by = v_actor
   where id = p_charge_id and status = 'DUE'
   returning * into v_c;

  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_actor, 'CHARGE_WAIVE', 'charge', v_c.id, to_jsonb(v_c));

  return v_c;
end;
$$;
