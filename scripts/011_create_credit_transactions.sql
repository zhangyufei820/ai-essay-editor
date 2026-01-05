-- ============================================
-- 积分交易记录表
-- 用于追踪所有积分变动历史
-- ============================================

-- 创建积分交易记录表
CREATE TABLE IF NOT EXISTS credit_transactions (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL,  -- 正数为增加，负数为消耗
  type TEXT NOT NULL CHECK (type IN ('purchase', 'consume', 'refund', 'bonus', 'register', 'manual')),
  description TEXT,
  reference_id TEXT,  -- 关联订单号、作文ID等
  balance_before INTEGER,  -- 变动前余额
  balance_after INTEGER,   -- 变动后余额
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at);

-- 为 user_credits 表添加索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id);

-- 为 orders 表添加索引（如果不存在）
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- 添加注释
COMMENT ON TABLE credit_transactions IS '积分交易记录表，记录所有积分变动历史';
COMMENT ON COLUMN credit_transactions.type IS '交易类型: purchase=购买, consume=消耗, refund=退款, bonus=奖励, register=注册赠送, manual=手动调整';
COMMENT ON COLUMN credit_transactions.reference_id IS '关联ID，如订单号、作文ID等';

-- 启用 RLS
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;

-- 创建 RLS 策略：用户只能查看自己的交易记录
CREATE POLICY "Users can view own transactions" ON credit_transactions
  FOR SELECT USING (auth.uid()::text = user_id OR user_id LIKE '%');

-- 服务端可以插入记录
CREATE POLICY "Service can insert transactions" ON credit_transactions
  FOR INSERT WITH CHECK (true);
