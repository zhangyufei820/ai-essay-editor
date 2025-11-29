-- 创建积分系统表

-- 用户积分表
CREATE TABLE IF NOT EXISTS public.user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  credits INTEGER NOT NULL DEFAULT 1000, -- 初始积分1000
  total_earned INTEGER NOT NULL DEFAULT 1000, -- 总共获得的积分
  total_spent INTEGER NOT NULL DEFAULT 0, -- 总共消费的积分
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 积分交易记录表
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL, -- 正数为获得，负数为消费
  type TEXT NOT NULL, -- 'register', 'referral', 'chat', 'essay_review', 'purchase'
  description TEXT,
  reference_id UUID, -- 关联的订单ID或推荐人ID
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 推广邀请表
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- 推荐人
  referee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- 被推荐人
  referral_code TEXT NOT NULL, -- 推荐码
  reward_credits INTEGER NOT NULL DEFAULT 500, -- 推荐奖励积分
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'completed'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(referee_id) -- 每个用户只能被推荐一次
);

-- 推荐码表
CREATE TABLE IF NOT EXISTS public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE, -- 推荐码（6位随机字符）
  uses INTEGER NOT NULL DEFAULT 0, -- 使用次数
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id)
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON public.user_credits(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_id ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referee_id ON public.referrals(referee_id);
CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON public.referral_codes(code);

-- 启用行级安全
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;

-- 用户只能查看自己的积分
CREATE POLICY "Users can view own credits" ON public.user_credits
  FOR SELECT USING (auth.uid() = user_id);

-- 用户只能查看自己的交易记录
CREATE POLICY "Users can view own transactions" ON public.credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- 用户可以查看自己的推荐记录
CREATE POLICY "Users can view own referrals" ON public.referrals
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referee_id);

-- 用户可以查看自己的推荐码
CREATE POLICY "Users can view own referral codes" ON public.referral_codes
  FOR SELECT USING (auth.uid() = user_id);

-- 任何人都可以查看推荐码（用于验证）
CREATE POLICY "Anyone can view referral codes for validation" ON public.referral_codes
  FOR SELECT USING (true);
