-- ============================================================================
-- 企业级数据库重构方案
-- 目标：将现有数据库升级为符合企业级标准的数据库结构
-- 策略：先备份现有数据，创建新表结构，迁移数据，最后切换
-- ============================================================================

-- ============================================================================
-- 第一步：备份现有数据
-- ============================================================================

-- 1.1 备份 orders 表
CREATE TABLE IF NOT EXISTS orders_backup AS SELECT * FROM orders;

-- 1.2 备份 user_credits 表
CREATE TABLE IF NOT EXISTS user_credits_backup AS SELECT * FROM user_credits;

-- 1.3 备份 credit_transactions 表
CREATE TABLE IF NOT EXISTS credit_transactions_backup AS SELECT * FROM credit_transactions;

-- 1.4 备份 user_profiles 表
CREATE TABLE IF NOT EXISTS user_profiles_backup AS SELECT * FROM user_profiles;

-- 1.5 备份 chat_sessions 表
CREATE TABLE IF NOT EXISTS chat_sessions_backup AS SELECT * FROM chat_sessions;

-- 1.6 备份 chat_messages 表
CREATE TABLE IF NOT EXISTS chat_messages_backup AS SELECT * FROM chat_messages;

-- 1.7 备份 shared_content 表
CREATE TABLE IF NOT EXISTS shared_content_backup AS SELECT * FROM shared_content;

-- 1.8 备份 submissions 表
CREATE TABLE IF NOT EXISTS submissions_backup AS SELECT * FROM submissions;

COMMENT ON TABLE orders_backup IS '订单表备份 - ' || NOW()::TEXT;
COMMENT ON TABLE user_credits_backup IS '用户积分表备份 - ' || NOW()::TEXT;
COMMENT ON TABLE credit_transactions_backup IS '积分交易表备份 - ' || NOW()::TEXT;

-- ============================================================================
-- 第二步：删除旧表（谨慎操作！）
-- ============================================================================

-- 注意：执行前请确保备份已完成
-- DROP TABLE IF EXISTS orders CASCADE;
-- DROP TABLE IF EXISTS user_credits CASCADE;
-- DROP TABLE IF EXISTS credit_transactions CASCADE;
-- DROP TABLE IF EXISTS user_profiles CASCADE;

-- ============================================================================
-- 第三步：创建企业级新表结构
-- ============================================================================

-- 3.1 用户表（核心表）
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 认证信息
  auth_id TEXT UNIQUE NOT NULL,  -- Supabase Auth ID 或 Authing ID
  username TEXT UNIQUE,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  
  -- 个人信息
  full_name TEXT,
  nickname TEXT,
  avatar_url TEXT,
  bio TEXT,
  
  -- 用户类型
  user_type TEXT NOT NULL DEFAULT 'student' CHECK (user_type IN ('student', 'teacher', 'parent', 'admin')),
  
  -- 状态
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'deleted')),
  email_verified BOOLEAN DEFAULT FALSE,
  phone_verified BOOLEAN DEFAULT FALSE,
  
  -- 时间戳
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  
  -- 元数据
  metadata JSONB DEFAULT '{}'::JSONB,
  
  -- 索引
  CONSTRAINT users_email_check CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  CONSTRAINT users_phone_check CHECK (phone ~ '^\+?[1-9]\d{1,14}$' OR phone IS NULL)
);

CREATE INDEX idx_users_auth_id ON users(auth_id);
CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
CREATE INDEX idx_users_phone ON users(phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_users_created_at ON users(created_at);

COMMENT ON TABLE users IS '用户主表 - 存储所有用户的基本信息';
COMMENT ON COLUMN users.auth_id IS '第三方认证系统ID（Supabase/Authing）';
COMMENT ON COLUMN users.user_type IS '用户类型：student-学生, teacher-教师, parent-家长, admin-管理员';
COMMENT ON COLUMN users.status IS '用户状态：active-活跃, inactive-未激活, suspended-暂停, deleted-已删除';

-- 3.2 用户积分账户表
CREATE TABLE IF NOT EXISTS user_accounts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- 积分信息
  credits_balance BIGINT NOT NULL DEFAULT 0 CHECK (credits_balance >= 0),
  credits_frozen BIGINT NOT NULL DEFAULT 0 CHECK (credits_frozen >= 0),
  credits_total_earned BIGINT NOT NULL DEFAULT 0,
  credits_total_spent BIGINT NOT NULL DEFAULT 0,
  
  -- 会员信息
  membership_level TEXT NOT NULL DEFAULT 'free' CHECK (membership_level IN ('free', 'basic', 'pro', 'premium')),
  membership_expires_at TIMESTAMPTZ,
  
  -- 统计信息
  total_orders INTEGER NOT NULL DEFAULT 0,
  total_spent_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  
  -- 时间戳
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- 元数据
  metadata JSONB DEFAULT '{}'::JSONB,
  
  CONSTRAINT user_accounts_user_id_unique UNIQUE (user_id)
);

CREATE INDEX idx_user_accounts_user_id ON user_accounts(user_id);
CREATE INDEX idx_user_accounts_membership_level ON user_accounts(membership_level);

COMMENT ON TABLE user_accounts IS '用户账户表 - 存储用户积分和会员信息';
COMMENT ON COLUMN user_accounts.credits_balance IS '可用积分余额';
COMMENT ON COLUMN user_accounts.credits_frozen IS '冻结积分（退款/争议中）';
COMMENT ON COLUMN user_accounts.membership_level IS '会员等级：free-免费, basic-基础, pro-专业, premium-豪华';

-- 3.3 订单表（企业级）
CREATE TABLE IF NOT EXISTS orders_new (
  id BIGSERIAL PRIMARY KEY,
  order_no TEXT UNIQUE NOT NULL,  -- 订单号：ORD-YYYYMMDD-随机数
  
  -- 用户信息
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  
  -- 产品信息
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  product_type TEXT NOT NULL CHECK (product_type IN ('membership', 'credits', 'service')),
  
  -- 金额信息
  original_amount DECIMAL(10, 2) NOT NULL CHECK (original_amount >= 0),
  discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  final_amount DECIMAL(10, 2) NOT NULL CHECK (final_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'CNY',
  
  -- 积分信息
  credits_amount INTEGER CHECK (credits_amount >= 0),
  
  -- 支付信息
  payment_method TEXT CHECK (payment_method IN ('xunhupay', 'alipay', 'wechat', 'stripe', 'manual')),
  payment_channel TEXT,  -- 具体支付渠道（支付宝/微信等）
  trade_no TEXT,  -- 第三方支付交易号
  
  -- 订单状态
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'processing', 'completed', 'cancelled', 'refunded', 'expired')),
  
  -- 时间信息
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- 备注和元数据
  remark TEXT,
  cancel_reason TEXT,
  refund_reason TEXT,
  metadata JSONB DEFAULT '{}'::JSONB,
  
  -- 约束
  CONSTRAINT orders_new_amount_check CHECK (final_amount = original_amount - discount_amount)
);

CREATE INDEX idx_orders_new_order_no ON orders_new(order_no);
CREATE INDEX idx_orders_new_user_id ON orders_new(user_id);
CREATE INDEX idx_orders_new_status ON orders_new(status);
CREATE INDEX idx_orders_new_created_at ON orders_new(created_at DESC);
CREATE INDEX idx_orders_new_trade_no ON orders_new(trade_no) WHERE trade_no IS NOT NULL;
CREATE INDEX idx_orders_new_product_id ON orders_new(product_id);

COMMENT ON TABLE orders_new IS '订单表 - 存储所有订单信息';
COMMENT ON COLUMN orders_new.order_no IS '订单号，格式：ORD-YYYYMMDD-随机数';
COMMENT ON COLUMN orders_new.status IS '订单状态：pending-待支付, paid-已支付, processing-处理中, completed-已完成, cancelled-已取消, refunded-已退款, expired-已过期';

-- 3.4 积分交易记录表（企业级）
CREATE TABLE IF NOT EXISTS credit_transactions_new (
  id BIGSERIAL PRIMARY KEY,
  transaction_no TEXT UNIQUE NOT NULL,  -- 交易流水号
  
  -- 用户信息
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  
  -- 交易信息
  type TEXT NOT NULL CHECK (type IN ('earn', 'spend', 'refund', 'expire', 'admin_adjust', 'gift')),
  amount BIGINT NOT NULL,  -- 正数为增加，负数为减少
  balance_before BIGINT NOT NULL CHECK (balance_before >= 0),
  balance_after BIGINT NOT NULL CHECK (balance_after >= 0),
  
  -- 关联信息
  order_id BIGINT REFERENCES orders_new(id) ON DELETE SET NULL,
  related_id TEXT,  -- 关联的其他业务ID
  
  -- 描述信息
  title TEXT NOT NULL,
  description TEXT,
  
  -- 状态
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'cancelled', 'failed')),
  
  -- 时间信息
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- 元数据
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_credit_transactions_new_user_id ON credit_transactions_new(user_id);
CREATE INDEX idx_credit_transactions_new_type ON credit_transactions_new(type);
CREATE INDEX idx_credit_transactions_new_created_at ON credit_transactions_new(created_at DESC);
CREATE INDEX idx_credit_transactions_new_order_id ON credit_transactions_new(order_id) WHERE order_id IS NOT NULL;

COMMENT ON TABLE credit_transactions_new IS '积分交易记录表 - 记录所有积分变动';
COMMENT ON COLUMN credit_transactions_new.type IS '交易类型：earn-获得, spend-消费, refund-退款, expire-过期, admin_adjust-管理员调整, gift-赠送';

-- 3.5 聊天会话表（优化）
CREATE TABLE IF NOT EXISTS chat_sessions_new (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,
  
  -- 用户信息
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- 会话信息
  title TEXT,
  model TEXT NOT NULL,
  
  -- 统计信息
  message_count INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost DECIMAL(10, 4) NOT NULL DEFAULT 0,
  
  -- 状态
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
  
  -- 时间信息
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ,
  
  -- 元数据
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_chat_sessions_new_user_id ON chat_sessions_new(user_id);
CREATE INDEX idx_chat_sessions_new_status ON chat_sessions_new(status);
CREATE INDEX idx_chat_sessions_new_updated_at ON chat_sessions_new(updated_at DESC);

-- 3.6 聊天消息表（优化）
CREATE TABLE IF NOT EXISTS chat_messages_new (
  id BIGSERIAL PRIMARY KEY,
  
  -- 会话信息
  session_id BIGINT NOT NULL REFERENCES chat_sessions_new(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- 消息信息
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  
  -- 统计信息
  tokens INTEGER,
  cost DECIMAL(10, 4),
  
  -- 时间信息
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- 元数据
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_chat_messages_new_session_id ON chat_messages_new(session_id);
CREATE INDEX idx_chat_messages_new_user_id ON chat_messages_new(user_id);
CREATE INDEX idx_chat_messages_new_created_at ON chat_messages_new(created_at DESC);

-- 3.7 分享内容表（优化）
CREATE TABLE IF NOT EXISTS shared_content_new (
  id BIGSERIAL PRIMARY KEY,
  share_id TEXT UNIQUE NOT NULL,
  
  -- 用户信息
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- 内容信息
  content_type TEXT NOT NULL CHECK (content_type IN ('chat', 'essay', 'analysis', 'other')),
  content JSONB NOT NULL,
  title TEXT,
  
  -- 访问控制
  is_public BOOLEAN NOT NULL DEFAULT TRUE,
  password_hash TEXT,
  max_views INTEGER,
  current_views INTEGER NOT NULL DEFAULT 0,
  
  -- 时间信息
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  last_viewed_at TIMESTAMPTZ,
  
  -- 元数据
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_shared_content_new_share_id ON shared_content_new(share_id);
CREATE INDEX idx_shared_content_new_user_id ON shared_content_new(user_id);
CREATE INDEX idx_shared_content_new_created_at ON shared_content_new(created_at DESC);

-- 3.8 作业提交表（优化）
CREATE TABLE IF NOT EXISTS submissions_new (
  id BIGSERIAL PRIMARY KEY,
  
  -- 用户信息
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- 作业信息
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  file_urls TEXT[],
  
  -- 评分信息
  score INTEGER CHECK (score >= 0 AND score <= 100),
  feedback TEXT,
  graded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  graded_at TIMESTAMPTZ,
  
  -- 状态
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'grading', 'graded', 'returned')),
  
  -- 时间信息
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  
  -- 元数据
  metadata JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX idx_submissions_new_user_id ON submissions_new(user_id);
CREATE INDEX idx_submissions_new_status ON submissions_new(status);
CREATE INDEX idx_submissions_new_created_at ON submissions_new(created_at DESC);

-- ============================================================================
-- 第四步：创建触发器和函数
-- ============================================================================

-- 4.1 自动更新 updated_at 触发器函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4.2 为所有表添加 updated_at 触发器
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER user_accounts_updated_at BEFORE UPDATE ON user_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER orders_new_updated_at BEFORE UPDATE ON orders_new
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER chat_sessions_new_updated_at BEFORE UPDATE ON chat_sessions_new
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER submissions_new_updated_at BEFORE UPDATE ON submissions_new
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4.3 积分交易触发器（自动更新账户余额）
CREATE OR REPLACE FUNCTION process_credit_transaction()
RETURNS TRIGGER AS $$
BEGIN
  -- 更新用户账户余额
  UPDATE user_accounts
  SET 
    credits_balance = NEW.balance_after,
    credits_total_earned = CASE WHEN NEW.amount > 0 THEN credits_total_earned + NEW.amount ELSE credits_total_earned END,
    credits_total_spent = CASE WHEN NEW.amount < 0 THEN credits_total_spent + ABS(NEW.amount) ELSE credits_total_spent END,
    updated_at = NOW()
  WHERE user_id = NEW.user_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER credit_transaction_process AFTER INSERT ON credit_transactions_new
  FOR EACH ROW EXECUTE FUNCTION process_credit_transaction();

-- ============================================================================
-- 第五步：数据迁移
-- ============================================================================

-- 5.1 迁移用户数据（从 user_credits 和 user_profiles）
INSERT INTO users (auth_id, username, email, phone, full_name, nickname, avatar_url, user_type, status, created_at)
SELECT 
  COALESCE(uc.user_id, up.id) as auth_id,
  up.username,
  up.email,
  up.phone,
  up.name as full_name,
  up.nickname,
  up.avatar_url,
  'student' as user_type,
  'active' as status,
  COALESCE(uc.created_at, up.created_at, NOW()) as created_at
FROM user_credits_backup uc
FULL OUTER JOIN user_profiles_backup up ON uc.user_id = up.id
ON CONFLICT (auth_id) DO NOTHING;

-- 5.2 迁移用户账户数据
INSERT INTO user_accounts (user_id, credits_balance, membership_level, created_at)
SELECT 
  u.id as user_id,
  COALESCE(uc.credits, 0) as credits_balance,
  CASE 
    WHEN uc.is_pro THEN 'pro'
    ELSE 'free'
  END as membership_level,
  COALESCE(uc.created_at, NOW()) as created_at
FROM users u
LEFT JOIN user_credits_backup uc ON u.auth_id = uc.user_id
ON CONFLICT (user_id) DO NOTHING;

-- 5.3 迁移订单数据
INSERT INTO orders_new (
  order_no, user_id, product_id, product_name, product_type,
  original_amount, discount_amount, final_amount,
  credits_amount, payment_method, trade_no, status,
  created_at, paid_at
)
SELECT 
  COALESCE(o.order_no, 'ORD-' || TO_CHAR(o.created_at, 'YYYYMMDD') || '-' || o.id) as order_no,
  u.id as user_id,
  o.product_id,
  COALESCE(o.product_name, o.product_id) as product_name,
  CASE 
    WHEN o.product_id LIKE 'credits-%' THEN 'credits'
    ELSE 'membership'
  END as product_type,
  o.amount as original_amount,
  0 as discount_amount,
  o.amount as final_amount,
  CASE o.product_id
    WHEN 'basic' THEN 2000
    WHEN 'pro' THEN 5000
    WHEN 'premium' THEN 12000
    WHEN 'credits-500' THEN 500
    WHEN 'credits-1000' THEN 1000
    WHEN 'credits-5000' THEN 5000
    WHEN 'credits-10000' THEN 10000
    ELSE NULL
  END as credits_amount,
  COALESCE(o.payment_method, 'xunhupay') as payment_method,
  NULL as trade_no,
  o.status,
  o.created_at,
  CASE WHEN o.status = 'paid' THEN o.created_at ELSE NULL END as paid_at
FROM orders_backup o
JOIN users u ON u.auth_id = o.user_id;

-- 5.4 迁移积分交易记录
INSERT INTO credit_transactions_new (
  transaction_no, user_id, type, amount,
  balance_before, balance_after,
  order_id, title, description, status, created_at
)
SELECT 
  'TXN-' || TO_CHAR(ct.created_at, 'YYYYMMDD') || '-' || ct.id as transaction_no,
  u.id as user_id,
  ct.type,
  ct.amount,
  COALESCE(ct.balance_after - ct.amount, 0) as balance_before,
  ct.balance_after,
  o.id as order_id,
  COALESCE(ct.description, '积分变动') as title,
  ct.description,
  'completed' as status,
  ct.created_at
FROM credit_transactions_backup ct
JOIN users u ON u.auth_id = ct.user_id
LEFT JOIN orders_new o ON o.order_no = ct.order_id;

-- ============================================================================
-- 第六步：创建视图（便于查询）
-- ============================================================================

-- 6.1 用户完整信息视图
CREATE OR REPLACE VIEW v_user_full_info AS
SELECT 
  u.id,
  u.auth_id,
  u.username,
  u.email,
  u.phone,
  u.full_name,
  u.nickname,
  u.avatar_url,
  u.user_type,
  u.status,
  ua.credits_balance,
  ua.membership_level,
  ua.membership_expires_at,
  ua.total_orders,
  ua.total_spent_amount,
  u.created_at,
  u.last_login_at
FROM users u
LEFT JOIN user_accounts ua ON ua.user_id = u.id;

-- 6.2 订单统计视图
CREATE OR REPLACE VIEW v_order_statistics AS
SELECT 
  DATE_TRUNC('day', created_at) as date,
  COUNT(*) as total_orders,
  COUNT(*) FILTER (WHERE status = 'paid') as paid_orders,
  SUM(final_amount) FILTER (WHERE status = 'paid') as total_revenue,
  AVG(final_amount) FILTER (WHERE status = 'paid') as avg_order_value
FROM orders_new
GROUP BY DATE_TRUNC('day', created_at)
ORDER BY date DESC;

-- ============================================================================
-- 第七步：权限设置（Row Level Security）
-- ============================================================================

-- 启用 RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_content_new ENABLE ROW LEVEL SECURITY;
ALTER TABLE submissions_new ENABLE ROW LEVEL SECURITY;

-- 用户只能查看和修改自己的数据
CREATE POLICY users_select_own ON users FOR SELECT USING (auth_id = auth.uid()::TEXT);
CREATE POLICY users_update_own ON users FOR UPDATE USING (auth_id = auth.uid()::TEXT);

CREATE POLICY user_accounts_select_own ON user_accounts FOR SELECT USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::TEXT));

CREATE POLICY orders_select_own ON orders_new FOR SELECT USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::TEXT));

CREATE POLICY credit_transactions_select_own ON credit_transactions_new FOR SELECT USING (user_id IN (SELECT id FROM users WHERE auth_id = auth.uid()::TEXT));

-- ============================================================================
-- 完成
-- ============================================================================

-- 输出迁移统计
SELECT 
  '用户数' as metric, COUNT(*) as count FROM users
UNION ALL
SELECT '用户账户数', COUNT(*) FROM user_accounts
UNION ALL
SELECT '订单数', COUNT(*) FROM orders_new
UNION ALL
SELECT '积分交易数', COUNT(*) FROM credit_transactions_new;
