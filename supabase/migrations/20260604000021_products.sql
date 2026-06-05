-- VBS — Listino prodotti del bar.
-- I prodotti venduti al bar; lo staff li gestisce, il personale di cassa/bar
-- li aggiunge al conto del socio. Lettura per tutti gli autenticati, modifiche
-- solo alla gestione (is_staff). Da applicare dopo le migrazioni precedenti.

create table if not exists products (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  price      numeric(10, 2) not null check (price >= 0),
  category   text,
  active     boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table products enable row level security;
drop policy if exists products_read on products;
create policy products_read on products
  for select using (auth.uid() is not null);

-- Crea o aggiorna un prodotto (solo gestione).
create or replace function upsert_product(
  p_id       uuid,
  p_name     text,
  p_price    numeric,
  p_category text default null,
  p_active   boolean default true,
  p_sort     int default 0
)
returns products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_row   products%rowtype;
begin
  if not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'INVALID_NAME' using errcode = 'P0001';
  end if;
  if p_price is null or p_price < 0 then
    raise exception 'INVALID_PRICE' using errcode = 'P0001';
  end if;

  if p_id is null then
    insert into products (name, price, category, active, sort_order)
    values (btrim(p_name), p_price, nullif(btrim(p_category), ''), p_active, p_sort)
    returning * into v_row;
  else
    update products
       set name = btrim(p_name), price = p_price,
           category = nullif(btrim(p_category), ''), active = p_active, sort_order = p_sort
     where id = p_id
     returning * into v_row;
    if not found then
      raise exception 'PRODUCT_NOT_FOUND' using errcode = 'P0001';
    end if;
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (v_actor, 'PRODUCT_UPSERT', 'product', v_row.id, to_jsonb(v_row));

  return v_row;
end;
$$;

-- Elimina un prodotto (solo gestione).
create or replace function delete_product(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_actor uuid := auth.uid();
begin
  if not is_staff() then
    raise exception 'NOT_AUTHORIZED' using errcode = 'P0001';
  end if;
  delete from products where id = p_id;
  insert into audit_log (actor_id, action, entity, entity_id)
  values (v_actor, 'PRODUCT_DELETE', 'product', p_id);
end;
$$;

grant execute on function upsert_product(uuid, text, numeric, text, boolean, int) to authenticated;
grant execute on function delete_product(uuid) to authenticated;

-- Listino di partenza (solo se vuoto): lo staff potrà modificarlo.
insert into products (name, price, category, sort_order)
select * from (values
  ('Acqua', 1.00, 'Bibite', 10),
  ('Caffè', 1.00, 'Bar', 20),
  ('Bibita', 2.50, 'Bibite', 30),
  ('Birra', 3.50, 'Bar', 40)
) as seed(name, price, category, sort_order)
where not exists (select 1 from products);
