-- 修复 orders 表结构
-- 问题：order_id 字段为空，订单号被错误存储在 user_id 字段中

-- 1. 添加缺失的字段
ALTER TABLE orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE orders ADD COLUMN IF NOT EXISTS trade_no TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS credits_amount INTEGER;

-- 2. 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(order_no);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- 3. 为所有订单设置 credits_amount（根据产品ID）
UPDATE orders SET credits_amount = 2000 WHERE product_id = 'basic' AND credits_amount IS NULL;
UPDATE orders SET credits_amount = 5000 WHERE product_id = 'pro' AND credits_amount IS NULL;
UPDATE orders SET credits_amount = 12000 WHERE product_id = 'premium' AND credits_amount IS NULL;
UPDATE orders SET credits_amount = 500 WHERE product_id = 'credits-500' AND credits_amount IS NULL;
UPDATE orders SET credits_amount = 1000 WHERE product_id = 'credits-1000' AND credits_amount IS NULL;
UPDATE orders SET credits_amount = 5000 WHERE product_id = 'credits-5000' AND credits_amount IS NULL;
UPDATE orders SET credits_amount = 10000 WHERE product_id = 'credits-10000' AND credits_amount IS NULL;

-- 4. 添加注释
COMMENT ON COLUMN orders.order_no IS '订单号，格式：ORDER_时间戳_用户ID';
COMMENT ON COLUMN orders.user_id IS '用户ID（Supabase Auth UUID 或 Authing ID）';
COMMENT ON COLUMN orders.credits_amount IS '订单对应的积分数量';
COMMENT ON COLUMN orders.trade_no IS '第三方支付平台交易号';
COMMENT ON COLUMN orders.updated_at IS '订单更新时间';

-- 5. 修复 credit_transactions 表（如果缺少字段）
ALTER TABLE credit_transactions ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES orders(id);

-- 6. 添加触发器：自动更新 updated_at
CREATE OR REPLACE FUNCTION update_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS orders_updated_at_trigger ON orders;
CREATE TRIGGER orders_updated_at_trigger
  BEFORE UPDATE ON orders
  FOR EACH ROW
  EXECUTE FUNCTION update_orders_updated_at();

-- 7. 添加订单状态检查约束
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check 
  CHECK (status IN ('pending', 'paid', 'expired', 'cancelled', 'refunded'));

-- 8. 确保 credits_amount 不为负数
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_credits_amount_check;
ALTER TABLE orders ADD CONSTRAINT orders_credits_amount_check 
  CHECK (credits_amount IS NULL OR credits_amount >= 0);
