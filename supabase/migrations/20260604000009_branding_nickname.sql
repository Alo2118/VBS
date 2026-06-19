-- VBS — Soprannome socio (disambiguazione in caso di omonimia) e branding.
-- In caso di nomi uguali non mostriamo dati in chiaro (telefono/email/tessera):
-- per identificare il socio si usa il soprannome scelto in registrazione.
-- Da applicare nello SQL Editor di Supabase dopo le migrazioni precedenti.

-- 1) Campo soprannome ---------------------------------------------------------
alter table members add column if not exists nickname text;

-- 2) Il trigger copia anche il soprannome dai metadati di registrazione -------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.members (id, email, full_name, phone, nickname, membership_status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'nickname', ''),
    'PENDING'
  );
  return new;
end;
$$;

-- 3) Ricerca soci validi: restituisce anche il soprannome ---------------------
-- (cambia il tipo di ritorno: va eliminata e ricreata)
drop function if exists search_valid_members(text);
create or replace function search_valid_members(p_query text)
returns table (id uuid, full_name text, nickname text)
language sql
stable
security definer
set search_path = public
as $$
  select m.id, m.full_name, m.nickname
  from members m
  where m.membership_status = 'VALID'
    and (
      p_query is null or p_query = ''
      or m.full_name ilike '%' || p_query || '%'
      or m.nickname ilike '%' || p_query || '%'
    )
  order by m.full_name, m.nickname
  limit 20;
$$;

grant execute on function search_valid_members(text) to authenticated;
