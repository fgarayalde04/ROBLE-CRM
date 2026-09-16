-- Interés/dividendo recibido de un fondo, cargado a mano por el asesor —
-- distinto de accrued_interest (real, del custodio, para bonos) para no
-- pisar ese dato al usar este campo.
ALTER TABLE portfolio_positions_snapshot ADD COLUMN IF NOT EXISTS manual_dividend_received numeric;
