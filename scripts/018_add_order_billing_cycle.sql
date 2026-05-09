ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS billing_cycle TEXT DEFAULT 'monthly';

ALTER TABLE orders
  DROP CONSTRAINT IF EXISTS orders_billing_cycle_check;

ALTER TABLE orders
  ADD CONSTRAINT orders_billing_cycle_check
  CHECK (billing_cycle IN ('monthly', 'annual'));

COMMENT ON COLUMN orders.billing_cycle IS '订单计费周期：monthly 月付，annual 年付';
