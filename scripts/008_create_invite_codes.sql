-- 创建邀请码表
CREATE TABLE IF NOT EXISTS invite_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  max_uses INTEGER DEFAULT 1,
  used_count INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  is_active BOOLEAN DEFAULT true
);

-- 创建用户邀请码使用记录表
CREATE TABLE IF NOT EXISTS invite_code_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_code_id UUID REFERENCES invite_codes(id),
  user_id UUID REFERENCES auth.users(id),
  used_at TIMESTAMPTZ DEFAULT NOW()
);

-- 插入公测邀请码（无限使用）
INSERT INTO invite_codes (code, max_uses, is_active) VALUES
  ('BETA2024', 999999, true),
  ('WELCOME', 999999, true),
  ('TEST123', 999999, true);

-- 启用行级安全
ALTER TABLE invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE invite_code_usage ENABLE ROW LEVEL SECURITY;

-- 允许所有人查看邀请码（验证用）
CREATE POLICY "Anyone can view invite codes" ON invite_codes
  FOR SELECT USING (true);

-- 允许所有人插入使用记录
CREATE POLICY "Anyone can insert usage" ON invite_code_usage
  FOR INSERT WITH CHECK (true);
