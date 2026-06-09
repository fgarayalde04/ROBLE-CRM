-- ============================================================
-- order_history v2 migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1. Add missing columns to order_history
ALTER TABLE order_history ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE order_history ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;

-- 2. Create order_history_items table
CREATE TABLE IF NOT EXISTS order_history_items (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID         NOT NULL REFERENCES order_history(id) ON DELETE CASCADE,
  order_type      TEXT     NOT NULL,   -- 'acciones' | 'fondos' | 'bonos'
  operation_type  TEXT     NOT NULL,   -- 'compra' | 'venta'
  instrument_name TEXT,
  symbol          TEXT,               -- ticker (acciones)
  cusip           TEXT,               -- CUSIP/ISIN (fondos, bonos)
  quantity        TEXT,
  value_amount    TEXT,               -- monto (fondos)
  price           TEXT,               -- 'mercado' | precio límite
  moneda          TEXT,
  order_date      TEXT,
  notes           TEXT,
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- 3. Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_order_history_items_order_id ON order_history_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_history_user_name ON order_history(user_name);
CREATE INDEX IF NOT EXISTS idx_order_history_created_at ON order_history(created_at DESC);
