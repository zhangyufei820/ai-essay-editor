-- ============================================
-- P1 安全加固: admin_tokens + admin_actions 表
-- 执行方式: Supabase Dashboard > SQL Editor > 运行此脚本
-- ============================================

-- 1. 管理员 Token 表（替代内存存储）
CREATE TABLE IF NOT EXISTS admin_tokens (
  id BIGSERIAL PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Token 索引（加速查询 + 过期清理）
CREATE INDEX IF NOT EXISTS idx_admin_tokens_token ON admin_tokens(token);
CREATE INDEX IF NOT EXISTS idx_admin_tokens_expires_at ON admin_tokens(expires_at);

-- RLS: 只有 service_role 可以访问
ALTER TABLE admin_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_tokens_service_role ON admin_tokens
  FOR ALL USING (true) WITH CHECK (true);

-- 2. 管理员操作审计日志表
CREATE TABLE IF NOT EXISTS admin_actions (
  id BIGSERIAL PRIMARY KEY,
  action TEXT NOT NULL,
  admin_token_prefix TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 审计日志索引（按时间查询 + 按操作类型查询）
CREATE INDEX IF NOT EXISTS idx_admin_actions_created_at ON admin_actions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_action ON admin_actions(action);

-- RLS: 只有 service_role 可以访问
ALTER TABLE admin_actions ENABLE ROW LEVEL SECURITY;
CREATE POLICY admin_actions_service_role ON admin_actions
  FOR ALL USING (true) WITH CHECK (true);

-- 3. 验证表已创建
SELECT 
  'admin_tokens' as table_name, 
  (SELECT COUNT(*) FROM admin_tokens) as row_count
UNION ALL
SELECT 
  'admin_actions' as table_name,
  (SELECT COUNT(*) FROM admin_actions) as row_count;
