-- 创建分享内容表
CREATE TABLE IF NOT EXISTS shared_content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  share_id VARCHAR(12) UNIQUE NOT NULL,  -- 短链接 ID
  content TEXT NOT NULL,                  -- 分享的内容
  title VARCHAR(255),                     -- 标题
  user_id VARCHAR(255),                   -- 创建者 ID（可选）
  view_count INTEGER DEFAULT 0,           -- 查看次数
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE     -- 过期时间（可选）
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_shared_content_share_id ON shared_content(share_id);
CREATE INDEX IF NOT EXISTS idx_shared_content_created_at ON shared_content(created_at);

-- 启用 RLS
ALTER TABLE shared_content ENABLE ROW LEVEL SECURITY;

-- 允许所有人读取分享内容
CREATE POLICY "Anyone can read shared content" ON shared_content
  FOR SELECT USING (true);

-- 允许认证用户创建分享
CREATE POLICY "Authenticated users can create shares" ON shared_content
  FOR INSERT WITH CHECK (true);

-- 允许更新查看次数
CREATE POLICY "Anyone can update view count" ON shared_content
  FOR UPDATE USING (true);
