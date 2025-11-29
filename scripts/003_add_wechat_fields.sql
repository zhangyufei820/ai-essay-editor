-- 为profiles表添加微信相关字段

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS wechat_openid TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS wechat_unionid TEXT,
ADD COLUMN IF NOT EXISTS wechat_nickname TEXT,
ADD COLUMN IF NOT EXISTS wechat_avatar TEXT;

-- 为微信openid创建索引
CREATE INDEX IF NOT EXISTS idx_profiles_wechat_openid ON profiles(wechat_openid);

-- 添加注释
COMMENT ON COLUMN profiles.wechat_openid IS '微信开放平台OpenID';
COMMENT ON COLUMN profiles.wechat_unionid IS '微信开放平台UnionID';
COMMENT ON COLUMN profiles.wechat_nickname IS '微信昵称';
COMMENT ON COLUMN profiles.wechat_avatar IS '微信头像URL';
