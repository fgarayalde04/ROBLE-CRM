-- Add price column to proposal_bonds
ALTER TABLE proposal_bonds ADD COLUMN IF NOT EXISTS price numeric(18,6) DEFAULT NULL;
