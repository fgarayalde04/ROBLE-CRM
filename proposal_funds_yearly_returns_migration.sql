-- ================================================================
-- PROPUESTAS: retornos por año calendario (2021-2025) en Fondos
-- Mismos datos que ya trae el Monitor de Fondos (Davinci) — se
-- cruzan por ISIN igual que YTD/1A/3A/5A.
-- Ejecutar en Supabase SQL Editor: primero en desarrollo, y en
-- producción recién al mergear a main.
-- ================================================================

ALTER TABLE proposal_funds
  ADD COLUMN IF NOT EXISTS return_2025 NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS return_2024 NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS return_2023 NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS return_2022 NUMERIC(8, 2),
  ADD COLUMN IF NOT EXISTS return_2021 NUMERIC(8, 2);
