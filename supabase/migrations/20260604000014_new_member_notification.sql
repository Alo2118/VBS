-- VBS — Avviso allo staff quando arriva una nuova richiesta di registrazione.
-- Alla creazione di un socio in stato PENDING (auto-registrazione), accoda una
-- notifica per tutti coloro che possono approvarlo (ADMIN/MANAGER/FRONT_DESK),
-- riusando la coda `notifications` (campanella in-app + Web Push).
-- Da applicare nello SQL Editor di Supabase dopo le migrazioni precedenti.

create or replace function notify_staff_new_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := coalesce(nullif(new.full_name, ''), new.email);
begin
  -- Solo le nuove richieste in attesa di approvazione.
  if new.membership_status <> 'PENDING' then
    return new;
  end if;

  insert into notifications (member_id, type, title, body, data)
  select s.id,
         'NEW_MEMBER',
         'Nuova registrazione',
         v_name || ' ha richiesto l''iscrizione.',
         jsonb_build_object('memberId', new.id, 'name', v_name, 'url', '/members')
  from members s
  where s.role in ('ADMIN', 'MANAGER', 'FRONT_DESK');

  return new;
end;
$$;

drop trigger if exists members_notify_staff on members;
create trigger members_notify_staff
  after insert on members
  for each row execute function notify_staff_new_member();
