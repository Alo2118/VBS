-- VBS — Vendita bar con righe per prodotto.
-- post_bar_sale registra, in un'unica transazione, un movimento BAR sul conto
-- del socio per ciascun prodotto del carrello (più dettaglio nei movimenti).
-- Da applicare dopo le migrazioni precedenti.

create or replace function post_bar_sale(p_member uuid, p_items jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_item  jsonb;
  v_name  text;
  v_amt   numeric;
  v_count int := 0;
  v_total numeric := 0;
begin
  if not can_handle_payments() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'NO_ITEMS' using errcode = 'P0001';
  end if;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_name := nullif(btrim(coalesce(v_item->>'name', '')), '');
    v_amt  := (v_item->>'amount')::numeric;
    if v_amt is null or v_amt <= 0 then
      raise exception 'INVALID_AMOUNT' using errcode = 'P0001';
    end if;
    insert into ledger_entries (member_id, kind, amount, description, created_by)
    values (p_member, 'BAR', v_amt, v_name, v_actor);
    v_count := v_count + 1;
    v_total := v_total + v_amt;
  end loop;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_actor, 'BAR_SALE', 'member', p_member,
          jsonb_build_object('items', v_count, 'total', v_total));

  return v_count;
end;
$$;

grant execute on function post_bar_sale(uuid, jsonb) to authenticated;
