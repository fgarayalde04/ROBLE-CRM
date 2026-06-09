-- Migration: add execution tracking to order_history_items
-- Run in Supabase SQL Editor

ALTER TABLE order_history_items ADD COLUMN IF NOT EXISTS done      BOOLEAN      DEFAULT FALSE;
ALTER TABLE order_history_items ADD COLUMN IF NOT EXISTS done_by   TEXT;
ALTER TABLE order_history_items ADD COLUMN IF NOT EXISTS done_at   TIMESTAMPTZ;

-- Index for filtering by done status
CREATE INDEX IF NOT EXISTS idx_order_history_items_done ON order_history_items(done);
