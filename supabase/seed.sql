-- VBS — Dati iniziali per sviluppo locale.

-- 3 campi da beach volley
insert into courts (name) values
  ('Giallo'),
  ('Bianco'),
  ('Verde');

-- Orari di apertura: tutti i campi, ogni giorno 09:00–23:00, slot da 60 min.
-- weekday 0=domenica … 6=sabato.
insert into opening_rules (court_id, weekday, open_time, close_time, slot_duration_minutes)
select null, gs, '09:00', '23:00', 60
from generate_series(0, 6) as gs;

-- Prezzi per fascia oraria (validi per tutti i campi e giorni):
--   09:00–18:00 = 10€ (fascia ordinaria), 18:00–23:00 = 16€ (prime-time).
-- per_head_price = quota fissa a testa quando si superano gli 8 giocatori.
insert into price_rules (court_id, weekday, start_time, end_time, price, per_head_price) values
  (null, null, '09:00', '18:00', 10.00, 3.00),
  (null, null, '18:00', '23:00', 16.00, 3.00);
