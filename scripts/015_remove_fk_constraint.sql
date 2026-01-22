-- 移除 user_credits 表的外键约束，支持第三方认证用户
-- 问题：使用 Authing 认证时，用户ID不在 auth.users 表中，导致无法创建积分记录

-- 1. 移除 user_credits 表的外键约束
ALTER TABLE user_credits DROP CONSTRAINT IF EXISTS user_credits_user_id_fkey;

-- 2. 添加索引以保持查询性能
CREATE INDEX IF NOT EXISTS idx_user_credits_user_id ON user_credits(user_id);

-- 3. 为当前用户添加积分记录
INSERT INTO user_credits (user_id, credits, is_pro)
VALUES ('6968c52fee5fbd3da1da9f7c', 2000, true)
ON CONFLICT (user_id) 
DO UPDATE SET credits = user_credits.credits + 2000, is_pro = true;

-- 4. 验证
SELECT * FROM user_credits WHERE user_id = '6968c52fee5fbd3da1da9f7c';
