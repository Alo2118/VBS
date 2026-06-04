-- VBS — Row Level Security. Le scritture sui dati sensibili passano dalle
-- funzioni SECURITY DEFINER (20260604000002): qui apriamo solo le letture
-- necessarie e chiudiamo le scritture dirette. (DEV_BEST_PRACTICE §1/§5).

alter table members        enable row level security;
alter table courts         enable row level security;
alter table opening_rules  enable row level security;
alter table price_rules    enable row level security;
alter table closures       enable row level security;
alter table bookings       enable row level security;
alter table charges        enable row level security;
alter table booking_policy enable row level security;
alter table audit_log      enable row level security;

-- Members: ognuno vede sé stesso; lo staff vede e gestisce tutti -------------
create policy members_select_self_or_staff on members
  for select using (id = auth.uid() or is_staff());

create policy members_update_staff on members
  for update using (is_staff()) with check (is_staff());

-- Configurazione (campi, orari, prezzi, chiusure): lettura a tutti gli
-- autenticati (serve per la griglia disponibilità); scrittura solo staff -----
create policy courts_select on courts
  for select using (auth.role() = 'authenticated');
create policy courts_write on courts
  for all using (is_staff()) with check (is_staff());

create policy opening_rules_select on opening_rules
  for select using (auth.role() = 'authenticated');
create policy opening_rules_write on opening_rules
  for all using (is_staff()) with check (is_staff());

create policy price_rules_select on price_rules
  for select using (auth.role() = 'authenticated');
create policy price_rules_write on price_rules
  for all using (is_staff()) with check (is_staff());

create policy closures_select on closures
  for select using (auth.role() = 'authenticated');
create policy closures_write on closures
  for all using (is_staff()) with check (is_staff());

-- Policy di prenotazione: lettura a tutti, modifica solo admin ---------------
create policy booking_policy_select on booking_policy
  for select using (auth.role() = 'authenticated');
create policy booking_policy_update on booking_policy
  for update using (current_role_name() = 'ADMIN')
  with check (current_role_name() = 'ADMIN');

-- Prenotazioni: il socio vede le proprie, lo staff tutte. Le scritture
-- avvengono solo via funzioni (create/cancel/no_show), nessuna policy diretta.
create policy bookings_select_own_or_staff on bookings
  for select using (member_id = auth.uid() or is_staff());

-- Addebiti: il socio vede i propri, lo staff tutti ---------------------------
create policy charges_select_own_or_staff on charges
  for select using (member_id = auth.uid() or is_staff());

-- Audit log: solo staff in lettura ------------------------------------------
create policy audit_select_staff on audit_log
  for select using (is_staff());
