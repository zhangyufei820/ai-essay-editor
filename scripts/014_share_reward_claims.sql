-- 🎁 分享奖励领取记录表
-- 用于记录用户通过分享链接获得积分的记录，防止重复领取

CREATE TABLE IF NOT EXISTS share_reward_claims (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  share_id TEXT NOT NULL,                    -- 分享ID
  viewer_id UUID NOT NULL,                   -- 查看者（领取积分的用户）
  sharer_id UUID,                            -- 分享者
  credits INTEGER NOT NULL DEFAULT 1000,     -- 获得的积分数量
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- 确保同一用户对同一分享只能领取一次
  UNIQUE(share_id, viewer_id)
);

-- 索引：按查看者查询
CREATE INDEX IF NOT EXISTS idx_share_reward_claims_viewer ON share_reward_claims(viewer_id);

-- 索引：按分享ID查询
CREATE INDEX IF NOT EXISTS idx_share_reward_claims_share ON share_reward_claims(share_id);

-- 索引：按创建时间查询（用于统计每日领取次数）
CREATE INDEX IF NOT EXISTS idx_share_reward_claims_created ON share_reward_claims(created_at);

-- 启用 RLS
ALTER TABLE share_reward_claims ENABLE ROW LEVEL SECURITY;

-- RLS 策略
CREATE POLICY "Users can view their own claims" ON share_reward_claims
  FOR SELECT USING (viewer_id = auth.uid() OR sharer_id = auth.uid());

CREATE POLICY "Service role can insert claims" ON share_reward_claims
  FOR INSERT WITH CHECK (true);
