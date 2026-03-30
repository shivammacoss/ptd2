-- Add custom commission columns to ib_profiles table
ALTER TABLE ib_profiles 
ADD COLUMN IF NOT EXISTS custom_commission_per_lot NUMERIC(18, 8),
ADD COLUMN IF NOT EXISTS custom_commission_per_trade NUMERIC(18, 8),
ADD COLUMN IF NOT EXISTS total_earned NUMERIC(18, 8) DEFAULT 0,
ADD COLUMN IF NOT EXISTS pending_payout NUMERIC(18, 8) DEFAULT 0;
