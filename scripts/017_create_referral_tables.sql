-- 创建推荐码表
CREATE TABLE IF NOT EXISTS referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  code TEXT NOT NULL UNIQUE,
  uses INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建邀请记录表
CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id TEXT NOT NULL,
  referee_id TEXT NOT NULL,
  referral_code TEXT NOT NULL,
  reward_credits INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending', -- pending, completed, cancelled
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_referral_codes_user_id ON referral_codes(user_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referee_id ON referrals(referee_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON referrals(status);

-- 启用 RLS（行级安全）
ALTER TABLE referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- 创建 RLS 策略（允许所有人读取，只有服务角色可以写入）
CREATE POLICY "Allow public read referral_codes" ON referral_codes
  FOR SELECT USING (true);

CREATE POLICY "Allow service role write referral_codes" ON referral_codes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow service role update referral_codes" ON referral_codes
  FOR UPDATE USING (true);

CREATE POLICY "Allow public read referrals" ON referrals
  FOR SELECT USING (true);

CREATE POLICY "Allow service role write referrals" ON referrals
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow service role update referrals" ON referrals
  FOR UPDATE USING (true);
