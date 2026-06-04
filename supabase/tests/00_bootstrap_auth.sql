-- Bootstrap per test locali su Postgres "nudo": riproduce il minimo dello
-- schema Supabase usato dalle migrazioni (auth.users, auth.uid, auth.role).
-- L'identità corrente è simulata via GUC `test.uid` / `test.role`.

create extension if not exists pgcrypto;
create schema if not exists auth;

-- Ruoli forniti da Supabase (necessari per i GRANT nelle migrazioni).
do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.uid()
returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid;
$$;

create or replace function auth.role()
returns text language sql stable as $$
  select coalesce(nullif(current_setting('test.role', true), ''), 'authenticated');
$$;
