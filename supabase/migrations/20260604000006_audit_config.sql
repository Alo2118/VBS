-- VBS — Audit automatico delle modifiche di configurazione (RF-CFG-8).
-- Le tabelle orari/chiusure sono scrivibili direttamente dallo staff (RLS):
-- un trigger registra ogni inserimento/modifica/cancellazione in audit_log.

create or replace function audit_config_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce(new.id, old.id),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger audit_opening_rules
  after insert or update or delete on opening_rules
  for each row execute function audit_config_change();

create trigger audit_closures
  after insert or update or delete on closures
  for each row execute function audit_config_change();
